import {
  computeMarketHeat,
  createPredictReadCanary,
  createPredictTradeHistoryClient,
  type MarketHeatTrader,
  type PredictNormalizedTradeEvent
} from "@hot-hands/indexer";

export interface MarketHeatProjection {
  source: MarketHeatSource;
  title: string;
  mode: "testnet";
  detail: string;
  capturedAt: string;
  rows: MarketHeatRow[];
}

export type MarketHeatSource = "captured_testnet" | "live_testnet";

export interface MarketHeatRow {
  id: string;
  wallet: string;
  manager: string;
  market: string;
  side: "UP" | "DOWN";
  observedMint: number;
  heatScore: number;
  preparedCopies: number;
  status: "copy_ready" | "watching";
}

export interface TestnetMarketHeatOptions {
  fetchImpl?: typeof fetch;
  mode?: "live" | "captured";
}

export function getCapturedTestnetMarketHeat(): MarketHeatProjection {
  return CAPTURED_TESTNET_MARKET_HEAT;
}

export async function getTestnetMarketHeat({
  fetchImpl = fetch,
  mode = "live"
}: TestnetMarketHeatOptions = {}): Promise<MarketHeatProjection> {
  if (mode === "captured") {
    return getCapturedTestnetMarketHeat();
  }

  try {
    const live = await getLiveTestnetMarketHeat(fetchImpl);
    return live.rows.length > 0 ? live : getCapturedTestnetMarketHeat();
  } catch {
    return getCapturedTestnetMarketHeat();
  }
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
  const activeOracleEvents = allEvents.filter((event) => event.oracleId === oracle.oracle_id);
  const events = activeOracleEvents.length > 0 ? activeOracleEvents : allEvents;
  const heat = computeMarketHeat(events);
  const rows = heat.slice(0, 8).map((trader, index) =>
    mapHeatTraderToRow(trader, events, index)
  );

  return {
    source: "live_testnet",
    title: "Testnet Market Heat",
    mode: "testnet",
    detail: "Live DeepBook Predict BTC market heat from the public testnet server.",
    capturedAt: new Date().toISOString(),
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

function mapHeatTraderToRow(
  trader: MarketHeatTrader,
  events: PredictNormalizedTradeEvent[],
  index: number
): MarketHeatRow {
  const latestMint = [...events]
    .filter(
      (event) =>
        event.kind === "mint" &&
        event.actor === trader.trader &&
        event.managerId === trader.managerId
    )
    .sort((left, right) => right.timestampMs - left.timestampMs)[0];

  const heatScore = Math.min(99, Math.max(0, Math.round(trader.hotScore)));

  return {
    id: `live-${trader.managerId}-${shortWallet(trader.trader)}-${latestMint?.eventId ?? index}`,
    wallet: trader.trader,
    manager: trader.managerId,
    market: "BTC-USD",
    side: latestMint?.isUp === false ? "DOWN" : "UP",
    observedMint: normalizeObservedMint(latestMint?.strike ?? trader.observedVolume),
    heatScore,
    preparedCopies: Math.max(1, Math.round(heatScore / 7)),
    status: heatScore >= 20 ? "copy_ready" : "watching"
  };
}

function shortWallet(wallet: string): string {
  return wallet.replace(/^0x/, "").slice(0, 10) || "unknown";
}

function normalizeObservedMint(value: number): number {
  if (value >= 1_000_000_000_000) {
    return Math.round(value / 1_000_000_000);
  }

  if (value >= 1_000_000_000) {
    return Math.round(value / 1_000_000);
  }

  return Math.round(value);
}

const CAPTURED_TESTNET_MARKET_HEAT: MarketHeatProjection = {
  source: "captured_testnet",
  title: "Testnet Market Heat",
  mode: "testnet",
  detail: "Captured DeepBook Predict mint activity for read-only PWA testnet mode.",
  capturedAt: "2026-05-19T16:00:00.000Z",
  rows: [
    {
      id: "captured-alpha-cruz-btc-up-67k",
      wallet: "0x7a2c...4f91",
      manager: "Alpha Cruz",
      market: "BTC-USD",
      side: "UP",
      observedMint: 67_000,
      heatScore: 91,
      preparedCopies: 14,
      status: "copy_ready"
    },
    {
      id: "captured-mina-park-btc-down-66k",
      wallet: "0x55e9...c812",
      manager: "Mina Park",
      market: "BTC-USD",
      side: "DOWN",
      observedMint: 66_000,
      heatScore: 84,
      preparedCopies: 9,
      status: "watching"
    },
    {
      id: "captured-vee-moss-btc-up-68k",
      wallet: "0xb183...9d0a",
      manager: "Vee Moss",
      market: "BTC-USD",
      side: "UP",
      observedMint: 68_000,
      heatScore: 78,
      preparedCopies: 6,
      status: "copy_ready"
    }
  ]
};
