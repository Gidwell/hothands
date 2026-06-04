import {
  buildLatestTradeFeedProjection,
  buildTraderHeatProjection,
  computeMarketHeat,
  createPredictReadCanary,
  createPredictTradeHistoryClient,
  type MarketHeatTrader,
  type PredictAvailableBtcMarket,
  type PredictIndexerReader,
  type PredictNormalizedTradeEvent,
  type PredictOraclePricePoint,
  type PredictOracleState,
  type TraderHeatProjection
} from "@hot-hands/indexer";

export interface MarketHeatProjection {
  source: MarketHeatSource;
  title: string;
  mode: "testnet";
  detail: string;
  capturedAt: string;
  marketPrice: MarketHeatPrice;
  markets: MarketHeatTradeMarket[];
  rows: MarketHeatRow[];
}

export type MarketHeatSource = "captured_testnet" | "indexed_testnet" | "live_testnet";

export interface MarketHeatPrice {
  market: "BTC-USD";
  price: number;
  source: MarketHeatSource;
}

export interface MarketHeatTradeMarket {
  oracleId: string;
  market: "BTC-USD";
  expiry: number;
  expiryMs: number;
  intervalLabel: string;
  active: boolean;
  status: string;
  strikeCandidate: number | null;
  strikeCandidatePrice: number | null;
  latestPrice: number | null;
  latestPriceLabel: string | null;
}

export interface MarketHeatRow {
  id: string;
  wallet: string;
  manager: string;
  market: string;
  oracleId?: string;
  side: "UP" | "DOWN";
  quantity?: number;
  cost?: number;
  costUsd?: number;
  strike: number;
  strikeRaw?: number;
  expiryMs: number;
  intervalLabel: string;
  observedAtMs: number;
  heatScore: number;
  status: "copy_ready" | "watching";
}

export interface TestnetMarketHeatOptions {
  fetchImpl?: typeof fetch;
  mode?: "live" | "captured";
  reader?: PredictIndexerReader;
}

const LATEST_ACTIVITY_ROW_LIMIT = 48;
const HEAT_ACCOUNT_ROW_LIMIT = 48;

export function getCapturedTestnetMarketHeat(): MarketHeatProjection {
  return CAPTURED_TESTNET_MARKET_HEAT;
}

export async function getTestnetMarketHeat({
  fetchImpl = fetch,
  mode = "live",
  reader
}: TestnetMarketHeatOptions = {}): Promise<MarketHeatProjection> {
  if (mode === "captured") {
    return getCapturedTestnetMarketHeat();
  }

  if (reader) {
    try {
      const indexed = await getIndexedTestnetMarketHeat(reader);
      if (indexed.rows.length > 0) {
        return indexed;
      }
    } catch {
      // Fall through to public Predict reads below.
    }
  }

  try {
    const live = await getLiveTestnetMarketHeat(fetchImpl);
    return live.rows.length > 0 ? live : getCapturedTestnetMarketHeat();
  } catch {
    return getCapturedTestnetMarketHeat();
  }
}

async function getIndexedTestnetMarketHeat(
  reader: PredictIndexerReader
): Promise<MarketHeatProjection> {
  const [oracles, tradeEvents, positionSummaries] = await Promise.all([
    reader.listBtcOracles({ includeSettled: false }),
    reader.listRecentTradeEvents({ limit: LATEST_ACTIVITY_ROW_LIMIT }),
    reader.listPositionSummaries({ limit: HEAT_ACCOUNT_ROW_LIMIT })
  ]);
  const activeOracles = selectIndexedActiveBtcOracles(oracles);
  const oraclesById = new Map(oracles.map((oracle) => [oracle.oracle_id, oracle]));
  const latestPricesByOracleId = await loadLatestIndexedPricesByOracleId(
    reader,
    activeOracles
  );
  const events = dedupeEvents(tradeEvents);
  const heat = buildTraderHeatProjection(events, positionSummaries, {
    limit: HEAT_ACCOUNT_ROW_LIMIT
  });
  const heatByTrader = new Map(heat.map((trader) => [trader.trader, trader]));
  const latestRows = buildLatestTradeFeedProjection(events, {
    limit: LATEST_ACTIVITY_ROW_LIMIT
  }).map((event) => mapIndexedTradeEventToRow(event, heatByTrader, oraclesById));
  const heatRows = heat
    .map((trader, index) => mapIndexedHeatTraderToRow(trader, events, oraclesById, index))
    .filter((row): row is MarketHeatRow => row !== null);
  const rows = mergeMarketHeatRows([...latestRows, ...heatRows])
    .sort(compareMarketHeatRowsByLatest);
  const selectedOracle = selectBestIndexedBtcOracle(activeOracles);
  const selectedPrice = selectedOracle
    ? latestPricesByOracleId.get(selectedOracle.oracle_id) ?? null
    : null;

  return {
    source: "indexed_testnet",
    title: "Testnet Market Heat",
    mode: "testnet",
    detail: "Indexed DeepBook Predict BTC market heat from testnet reader data.",
    capturedAt: new Date().toISOString(),
    marketPrice: {
      market: "BTC-USD",
      price: normalizeStrike(selectedPrice?.spot ?? 0),
      source: "indexed_testnet"
    },
    markets: activeOracles.map((oracle) =>
      mapIndexedBtcMarket(oracle, latestPricesByOracleId.get(oracle.oracle_id) ?? null)
    ),
    rows
  };
}

async function getLiveTestnetMarketHeat(fetchImpl: typeof fetch): Promise<MarketHeatProjection> {
  const canary = await createPredictReadCanary({ fetchImpl }).run();
  const oracle = canary.selectedBtcOracle;

  if (!canary.ok || !oracle || oracle.status !== "active") {
    throw new Error("Predict read canary did not return an active BTC oracle.");
  }

  const client = createPredictTradeHistoryClient({ fetchImpl });
  const allEvents = dedupeEvents(
    await Promise.all([
      client.listOracleTrades(oracle.oracle_id).catch(() => []),
      client.listMintedPositions(),
      client.listRedeemedPositions()
    ]).then((groups) => groups.flat())
  );
  const oraclesById = new Map(
    canary.btcOracles.map((btcOracle) => [btcOracle.oracle_id, btcOracle])
  );
  const heat = computeMarketHeat(allEvents);
  const heatByTrader = new Map(
    heat.map((trader) => [traderKey(trader.trader, trader.managerId), trader])
  );
  const latestRows = selectLatestActivityRows(allEvents)
    .map((event) => mapTradeEventToRow(event, heatByTrader, oraclesById));
  const heatRows = selectHeatAccountCandidates(heat)
    .map((trader, index) => mapHeatTraderToRow(trader, allEvents, oraclesById, index));
  const rows = mergeMarketHeatRows([...latestRows, ...heatRows])
    .sort(compareMarketHeatRowsByLatest);

  return {
    source: "live_testnet",
    title: "Testnet Market Heat",
    mode: "testnet",
    detail: "Live DeepBook Predict BTC market heat from the public testnet server.",
    capturedAt: new Date().toISOString(),
    marketPrice: {
      market: "BTC-USD",
      price: normalizeStrike(canary.latestPrice?.spot ?? 0),
      source: "live_testnet"
    },
    markets: canary.availableBtcMarkets.map(mapAvailableBtcMarket),
    rows
  };
}

function dedupeEvents(events: PredictNormalizedTradeEvent[]): PredictNormalizedTradeEvent[] {
  const byId = new Map<string, PredictNormalizedTradeEvent>();

  for (const event of events) {
    byId.set(event.eventId, event);
  }

  return [...byId.values()];
}

function selectLatestActivityRows(
  events: PredictNormalizedTradeEvent[]
): PredictNormalizedTradeEvent[] {
  return [...events]
    .sort(compareEventsByLatest)
    .slice(0, LATEST_ACTIVITY_ROW_LIMIT);
}

function compareEventsByLatest(
  left: PredictNormalizedTradeEvent,
  right: PredictNormalizedTradeEvent
): number {
  return (
    right.timestampMs - left.timestampMs ||
    left.eventId.localeCompare(right.eventId)
  );
}

function selectHeatAccountCandidates(traders: MarketHeatTrader[]): MarketHeatTrader[] {
  return traders.slice(0, HEAT_ACCOUNT_ROW_LIMIT);
}

function mergeMarketHeatRows(rows: MarketHeatRow[]): MarketHeatRow[] {
  const byId = new Map<string, MarketHeatRow>();

  for (const row of rows) {
    byId.set(row.id, byId.get(row.id) ?? row);
  }

  return [...byId.values()];
}

function compareMarketHeatRowsByLatest(left: MarketHeatRow, right: MarketHeatRow): number {
  return (
    right.observedAtMs - left.observedAtMs ||
    right.heatScore - left.heatScore ||
    left.wallet.localeCompare(right.wallet)
  );
}

function selectIndexedActiveBtcOracles(oracles: PredictOracleState[]): PredictOracleState[] {
  return oracles
    .filter((oracle) => oracle.underlying_asset === "BTC" && oracle.status === "active")
    .sort(
      (left, right) =>
        normalizeEpochMs(left.expiry) - normalizeEpochMs(right.expiry) ||
        left.oracle_id.localeCompare(right.oracle_id)
    );
}

function selectBestIndexedBtcOracle(oracles: PredictOracleState[]): PredictOracleState | null {
  return [...oracles]
    .sort(
      (left, right) =>
        normalizeEpochMs(right.expiry) - normalizeEpochMs(left.expiry) ||
        left.oracle_id.localeCompare(right.oracle_id)
    )[0] ?? null;
}

async function loadLatestIndexedPricesByOracleId(
  reader: PredictIndexerReader,
  oracles: PredictOracleState[]
): Promise<Map<string, PredictOraclePricePoint>> {
  const entries = await Promise.all(
    oracles.map(async (oracle) => {
      try {
        const latestPrice = await reader.getLatestOraclePrice(oracle.oracle_id);

        return latestPrice ? ([oracle.oracle_id, latestPrice] as const) : null;
      } catch {
        return null;
      }
    })
  );

  return new Map(
    entries.filter(
      (entry): entry is readonly [string, PredictOraclePricePoint] => entry !== null
    )
  );
}

function mapIndexedHeatTraderToRow(
  trader: TraderHeatProjection,
  events: PredictNormalizedTradeEvent[],
  oraclesById: Map<string, PredictOracleState>,
  index: number
): MarketHeatRow | null {
  const traderEvents = [...events]
    .filter((event) => indexedTradeWallet(event) === trader.trader)
    .sort(compareEventsByLatest);
  const latestMint = traderEvents.find((event) => event.kind === "mint");
  const latestEvent = latestMint ?? traderEvents[0];

  if (!latestEvent) {
    return null;
  }

  const heatScore = normalizeHeatScore(trader.hotScore);

  return {
    id: `indexed-${latestEvent.managerId}-${shortWallet(trader.trader)}-${latestMint?.eventId ?? index}`,
    wallet: trader.trader,
    manager: latestEvent.managerId,
    market: "BTC-USD",
    oracleId: latestEvent.oracleId,
    side: latestEvent.isUp === false ? "DOWN" : "UP",
    ...mapTradeEventMetrics(latestEvent),
    strike: normalizeStrike(latestEvent.strike),
    strikeRaw: latestEvent.strike,
    expiryMs: latestEvent.expiryMs,
    intervalLabel: formatIntervalLabel(latestEvent, oraclesById.get(latestEvent.oracleId)),
    observedAtMs: latestEvent.timestampMs,
    heatScore,
    status: latestMint ? "copy_ready" : "watching"
  };
}

function mapHeatTraderToRow(
  trader: MarketHeatTrader,
  events: PredictNormalizedTradeEvent[],
  oraclesById: Map<string, PredictOracleState>,
  index: number
): MarketHeatRow {
  const traderEvents = [...events]
    .filter(
      (event) => event.actor === trader.trader && event.managerId === trader.managerId
    )
    .sort((left, right) => right.timestampMs - left.timestampMs);
  const latestMint = [...events]
    .filter(
      (event) =>
        event.kind === "mint" &&
        event.actor === trader.trader &&
        event.managerId === trader.managerId
    )
    .sort((left, right) => right.timestampMs - left.timestampMs)[0];
  const latestEvent = latestMint ?? traderEvents[0];

  const heatScore = Math.min(99, Math.max(0, Math.round(trader.hotScore)));
  const strike = latestEvent?.strike ?? trader.observedVolume;
  const expiryMs = latestEvent?.expiryMs ?? trader.lastSeenMs;
  const observedAtMs = latestEvent?.timestampMs ?? trader.lastSeenMs;
  const intervalLabel = latestEvent
    ? formatIntervalLabel(latestEvent, oraclesById.get(latestEvent.oracleId))
    : "Next";

  return {
    id: `live-${trader.managerId}-${shortWallet(trader.trader)}-${latestMint?.eventId ?? index}`,
    wallet: trader.trader,
    manager: trader.managerId,
    market: "BTC-USD",
    oracleId: latestEvent?.oracleId,
    side: latestEvent?.isUp === false ? "DOWN" : "UP",
    ...mapTradeEventMetrics(latestEvent),
    strike: normalizeStrike(strike),
    ...(latestEvent ? { strikeRaw: latestEvent.strike } : {}),
    expiryMs,
    intervalLabel,
    observedAtMs,
    heatScore,
    status: latestMint ? "copy_ready" : "watching"
  };
}

function mapTradeEventToRow(
  event: PredictNormalizedTradeEvent,
  heatByTrader: Map<string, MarketHeatTrader>,
  oraclesById: Map<string, PredictOracleState>
): MarketHeatRow {
  const heatScore = Math.min(
    99,
    Math.max(
      0,
      Math.round(heatByTrader.get(traderKey(event.actor, event.managerId))?.hotScore ?? 0)
    )
  );

  return {
    id: `live-${event.managerId}-${shortWallet(event.actor)}-${event.eventId}`,
    wallet: event.actor,
    manager: event.managerId,
    market: "BTC-USD",
    oracleId: event.oracleId,
    side: event.isUp === false ? "DOWN" : "UP",
    ...mapTradeEventMetrics(event),
    strike: normalizeStrike(event.strike),
    strikeRaw: event.strike,
    expiryMs: event.expiryMs,
    intervalLabel: formatIntervalLabel(event, oraclesById.get(event.oracleId)),
    observedAtMs: event.timestampMs,
    heatScore,
    status: event.kind === "mint" ? "copy_ready" : "watching"
  };
}

function mapIndexedTradeEventToRow(
  event: PredictNormalizedTradeEvent,
  heatByTrader: Map<string, TraderHeatProjection>,
  oraclesById: Map<string, PredictOracleState>
): MarketHeatRow {
  const wallet = indexedTradeWallet(event);
  const heatScore = normalizeHeatScore(heatByTrader.get(wallet)?.hotScore ?? 0);

  return {
    id: `indexed-${event.managerId}-${shortWallet(wallet)}-${event.eventId}`,
    wallet,
    manager: event.managerId,
    market: "BTC-USD",
    oracleId: event.oracleId,
    side: event.isUp === false ? "DOWN" : "UP",
    ...mapTradeEventMetrics(event),
    strike: normalizeStrike(event.strike),
    strikeRaw: event.strike,
    expiryMs: event.expiryMs,
    intervalLabel: formatIntervalLabel(event, oraclesById.get(event.oracleId)),
    observedAtMs: event.timestampMs,
    heatScore,
    status: event.kind === "mint" ? "copy_ready" : "watching"
  };
}

function mapTradeEventMetrics(
  event: PredictNormalizedTradeEvent | undefined
): Pick<MarketHeatRow, "quantity" | "cost" | "costUsd"> {
  if (!event) {
    return {};
  }

  return {
    quantity: event.quantity,
    cost: event.cost,
    costUsd: event.cost === undefined ? undefined : event.cost / 1_000_000
  };
}

function traderKey(trader: string, managerId: string): string {
  return `${trader}:${managerId}`;
}

function indexedTradeWallet(event: PredictNormalizedTradeEvent): string {
  return event.trader ?? event.actor;
}

function normalizeHeatScore(score: number): number {
  return Math.min(99, Math.max(0, Math.round(score)));
}

function shortWallet(wallet: string): string {
  return wallet.replace(/^0x/, "").slice(0, 10) || "unknown";
}

function normalizeStrike(value: number): number {
  if (value >= 1_000_000_000_000) {
    return Math.round(value / 1_000_000_000);
  }

  if (value >= 1_000_000_000) {
    return Math.round(value / 1_000_000);
  }

  return Math.round(value);
}

function mapAvailableBtcMarket(market: PredictAvailableBtcMarket): MarketHeatTradeMarket {
  const latestPrice = market.latestPrice ? normalizeStrike(market.latestPrice.spot) : null;
  const strikeCandidatePrice =
    market.strikeCandidate === null ? null : normalizeStrike(market.strikeCandidate);

  return {
    oracleId: market.oracleId,
    market: "BTC-USD",
    expiry: market.expiry,
    expiryMs: market.expiryMs,
    intervalLabel: market.intervalLabel,
    active: market.active,
    status: market.status,
    strikeCandidate: market.strikeCandidate,
    strikeCandidatePrice,
    latestPrice,
    latestPriceLabel: formatPriceLabel(latestPrice)
  };
}

function mapIndexedBtcMarket(
  oracle: PredictOracleState,
  latestPrice: PredictOraclePricePoint | null
): MarketHeatTradeMarket {
  const latestPriceValue = latestPrice ? normalizeStrike(latestPrice.spot) : null;
  const strikeCandidate = latestPrice
    ? snapIndexedStrikeToTick(latestPrice.forward ?? latestPrice.spot, oracle)
    : null;
  const strikeCandidatePrice =
    strikeCandidate === null ? null : normalizeStrike(strikeCandidate);
  const expiryMs = normalizeEpochMs(oracle.expiry);

  return {
    oracleId: oracle.oracle_id,
    market: "BTC-USD",
    expiry: normalizeEpochSeconds(oracle.expiry),
    expiryMs,
    intervalLabel: formatIndexedOracleIntervalLabel(oracle),
    active: oracle.status === "active",
    status: oracle.status,
    strikeCandidate,
    strikeCandidatePrice,
    latestPrice: latestPriceValue,
    latestPriceLabel: formatPriceLabel(latestPriceValue)
  };
}

function snapIndexedStrikeToTick(price: number, oracle: PredictOracleState): number {
  const tickSize = Math.max(1, oracle.tick_size);
  const rounded = Math.round(price / tickSize) * tickSize;

  return Math.max(oracle.min_strike, rounded);
}

function formatPriceLabel(price: number | null): string | null {
  if (price === null) {
    return null;
  }

  return `$${Math.round(price).toLocaleString("en-US")}`;
}

function formatIntervalLabel(
  event: PredictNormalizedTradeEvent,
  oracle: PredictOracleState | undefined
): string {
  const intervalMs =
    oracle?.activated_at && oracle.expiry > oracle.activated_at
      ? normalizeEpochMs(oracle.expiry) - normalizeEpochMs(oracle.activated_at)
      : event.expiryMs - event.timestampMs;

  return formatDurationLabel(intervalMs);
}

function formatDurationLabel(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return "Exp";
  }

  const minutes = Math.max(1, Math.round(durationMs / 60_000));
  if (minutes < 90) {
    const roundedMinutes = minutes > 20 ? Math.round(minutes / 15) * 15 : minutes;
    return `${roundedMinutes}m`;
  }

  if (minutes < 36 * 60) {
    return `${Math.round(minutes / 60)}h`;
  }

  return `${Math.round(minutes / (24 * 60))}d`;
}

function formatIndexedOracleIntervalLabel(oracle: PredictOracleState): string {
  if (oracle.activated_at === undefined) {
    return "Active";
  }

  const durationMs = normalizeEpochMs(oracle.expiry) - normalizeEpochMs(oracle.activated_at);

  return durationMs > 0 ? formatDurationLabel(durationMs) : "Active";
}

function normalizeEpochMs(value: number): number {
  return value < 1_000_000_000_000 ? value * 1000 : value;
}

function normalizeEpochSeconds(value: number): number {
  return value < 1_000_000_000_000 ? value : Math.floor(value / 1000);
}

const CAPTURED_TESTNET_MARKET_HEAT: MarketHeatProjection = {
  source: "captured_testnet",
  title: "Testnet Market Heat",
  mode: "testnet",
  detail: "Captured DeepBook Predict mint activity for read-only PWA testnet mode.",
  capturedAt: "2026-05-19T16:00:00.000Z",
  marketPrice: {
    market: "BTC-USD",
    price: 102_480,
    source: "captured_testnet"
  },
  markets: [],
  rows: [
    {
      id: "captured-alpha-cruz-btc-up-67k",
      wallet: "0x7a2c...4f91",
      manager: "Alpha Cruz",
      market: "BTC-USD",
      oracleId: "captured-btc-15m",
      side: "UP",
      quantity: 4,
      cost: 2_400_000,
      costUsd: 2.4,
      strike: 67_000,
      expiryMs: 1_779_158_400_000,
      intervalLabel: "15m",
      observedAtMs: 1_779_157_500_000,
      heatScore: 91,
      status: "copy_ready"
    },
    {
      id: "captured-mina-park-btc-down-66k",
      wallet: "0x55e9...c812",
      manager: "Mina Park",
      market: "BTC-USD",
      oracleId: "captured-btc-1h",
      side: "DOWN",
      quantity: 2,
      cost: 900_000,
      costUsd: 0.9,
      strike: 66_000,
      expiryMs: 1_779_158_400_000,
      intervalLabel: "1h",
      observedAtMs: 1_779_154_800_000,
      heatScore: 84,
      status: "watching"
    },
    {
      id: "captured-vee-moss-btc-up-68k",
      wallet: "0xb183...9d0a",
      manager: "Vee Moss",
      market: "BTC-USD",
      oracleId: "captured-btc-1d",
      side: "UP",
      quantity: 1,
      cost: 500_000,
      costUsd: 0.5,
      strike: 68_000,
      expiryMs: 1_779_158_400_000,
      intervalLabel: "1d",
      observedAtMs: 1_779_151_200_000,
      heatScore: 78,
      status: "copy_ready"
    }
  ]
};
