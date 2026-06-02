import { DEEPBOOK_PREDICT_TESTNET_TX_CONFIG } from "@hot-hands/contracts";
import {
  getJsonRpcFullnodeUrl,
  SuiJsonRpcClient,
  type EventId,
  type PaginatedEvents,
  type QueryEventsParams,
} from "@mysten/sui/jsonRpc";
import { formatDusdcBalance } from "./walletBalance";

export const POSITION_MINTED_EVENT_TYPE =
  `${DEEPBOOK_PREDICT_TESTNET_TX_CONFIG.predictPackageId}::predict::PositionMinted`;
export const POSITION_REDEEMED_EVENT_TYPE =
  `${DEEPBOOK_PREDICT_TESTNET_TX_CONFIG.predictPackageId}::predict::PositionRedeemed`;

export type PredictPortfolioEventType = "mint" | "redeem";

export type PredictPortfolioEvent = {
  eventId: string;
  eventType: PredictPortfolioEventType;
  managerId: string;
  oracleId: string;
  expiry: number;
  strike: number;
  isUp: boolean;
  quantity: number;
  cost?: number;
  payout?: number;
  timestampMs: number;
};

export type PredictPortfolioPosition = {
  id: string;
  managerId: string;
  oracleId: string;
  expiry: number;
  expiryMs: number;
  strike: string;
  quantity: string;
  direction: "UP" | "DOWN";
  strikeLabel: string;
  expiryTimeLabel: string;
  timeLabel: string;
  statusLabel: "Open" | "Expired";
  actionLabel: "Redeem" | "Claim";
  maxPayoutLabel: string;
  costBasisLabel: string;
  closeValueLabel?: string;
  closeValueStatusLabel?: "Quoted now";
  claimValueLabel?: string;
  outcomeLabel?: "Pays out" | "No payout" | "Settlement pending";
  settlementPriceLabel?: string;
  isExpired: boolean;
};

export type PredictPortfolioEventClient = {
  queryEvents(
    input: Pick<QueryEventsParams, "query" | "cursor" | "limit" | "order">,
  ): Promise<Pick<PaginatedEvents, "data" | "hasNextPage" | "nextCursor">>;
};

export type PredictOracleSettlement = {
  oracleId: string;
  status: string;
  settlementPrice: number | null;
  settledAtMs?: number | null;
};

export type PredictPortfolioSettlementClient = {
  getOracleSettlement(oracleId: string): Promise<PredictOracleSettlement | null>;
};

export type PredictPortfolioCloseQuote = {
  oracleId: string;
  expiry: string;
  strike: string;
  side: "UP" | "DOWN";
  quantity: string;
  redeemPayout: string;
  redeemPayoutUsd: number;
  quoteStatus: "ready";
};

export type PredictPortfolioCloseQuoteClient = {
  getCloseQuote(position: PredictPortfolioPosition): Promise<PredictPortfolioCloseQuote | null>;
};

export type LoadPredictPortfolioOptions = {
  client?: PredictPortfolioEventClient;
  closeQuoteClient?: PredictPortfolioCloseQuoteClient;
  limit?: number;
  managerObjectId: string;
  maxPages?: number;
  nowMs?: number;
  settlementClient?: PredictPortfolioSettlementClient;
};

type PortfolioAccumulator = {
  managerId: string;
  oracleId: string;
  expiry: number;
  strike: number;
  isUp: boolean;
  quantity: bigint;
  costBasis: bigint;
  lastTimestampMs: number;
};

export async function loadPredictPortfolio({
  client = createPredictPortfolioEventClient(),
  limit = 50,
  managerObjectId,
  maxPages = 8,
  nowMs = Date.now(),
  closeQuoteClient,
  settlementClient,
}: LoadPredictPortfolioOptions): Promise<PredictPortfolioPosition[]> {
  const [mints, redeems] = await Promise.all([
    loadPortfolioEvents({
      client,
      eventType: "mint",
      limit,
      managerObjectId,
      maxPages,
      moveEventType: POSITION_MINTED_EVENT_TYPE,
    }),
    loadPortfolioEvents({
      client,
      eventType: "redeem",
      limit,
      managerObjectId,
      maxPages,
      moveEventType: POSITION_REDEEMED_EVENT_TYPE,
    }),
  ]);

  const events = [...mints, ...redeems];
  const positions = buildPortfolioPositions(events, { nowMs });
  if (positions.length === 0 || (!settlementClient && !closeQuoteClient)) {
    return positions;
  }

  const [oracleSettlements, closeQuotes] = await Promise.all([
    settlementClient ? loadOracleSettlements(positions, settlementClient) : [],
    closeQuoteClient ? loadCloseQuotes(positions, closeQuoteClient) : [],
  ]);

  return buildPortfolioPositions(events, {
    closeQuotes,
    nowMs,
    oracleSettlements,
  });
}

export function buildPortfolioPositions(
  events: PredictPortfolioEvent[],
  {
    closeQuotes = [],
    nowMs = Date.now(),
    oracleSettlements = [],
  }: {
    closeQuotes?: PredictPortfolioCloseQuote[];
    nowMs?: number;
    oracleSettlements?: PredictOracleSettlement[];
  } = {},
): PredictPortfolioPosition[] {
  const positions = new Map<string, PortfolioAccumulator>();
  const settlementsByOracleId = new Map(
    oracleSettlements.map((settlement) => [settlement.oracleId, settlement]),
  );
  const closeQuotesByPositionId = new Map(
    closeQuotes.map((quote) => [closeQuoteKey(quote), quote]),
  );

  for (const event of [...events].sort(compareEventsByTime)) {
    const key = positionKey(event);
    const position =
      positions.get(key) ??
      {
        managerId: event.managerId,
        oracleId: event.oracleId,
        expiry: event.expiry,
        strike: event.strike,
        isUp: event.isUp,
        quantity: 0n,
        costBasis: 0n,
        lastTimestampMs: 0,
      };
    positions.set(key, position);
    position.lastTimestampMs = Math.max(position.lastTimestampMs, event.timestampMs);

    const quantity = BigInt(Math.max(0, Math.trunc(event.quantity)));
    if (event.eventType === "mint") {
      position.quantity += quantity;
      position.costBasis += BigInt(Math.max(0, Math.trunc(event.cost ?? 0)));
      continue;
    }

    const removedQuantity = quantity > position.quantity ? position.quantity : quantity;
    const removedCost =
      position.quantity === 0n
        ? 0n
        : (position.costBasis * removedQuantity) / position.quantity;
    position.quantity -= removedQuantity;
    position.costBasis -= removedCost;
  }

  return [...positions.values()]
    .filter((position) => position.quantity > 0n)
    .map((position) => {
      const builtPosition = buildPortfolioPosition(
        position,
        nowMs,
        settlementsByOracleId.get(position.oracleId),
      );
      const closeQuote = closeQuotesByPositionId.get(positionCloseQuoteKey(builtPosition));

      return closeQuote ? applyCloseQuote(builtPosition, closeQuote) : builtPosition;
    })
    .sort((left, right) => right.expiryMs - left.expiryMs || left.id.localeCompare(right.id));
}

export function createPredictPortfolioCloseQuoteClient({
  apiBaseUrl,
  fetcher = fetch,
}: {
  apiBaseUrl?: string | null;
  fetcher?: typeof fetch;
}): PredictPortfolioCloseQuoteClient | undefined {
  const normalizedBaseUrl = apiBaseUrl?.trim();
  if (!normalizedBaseUrl) {
    return undefined;
  }

  return {
    getCloseQuote: async (position) => {
      const url = new URL(`${normalizedBaseUrl.replace(/\/+$/, "")}/testnet/redeem-quote`);
      url.searchParams.set("oracleId", position.oracleId);
      url.searchParams.set("expiry", String(position.expiry));
      url.searchParams.set("strike", position.strike);
      url.searchParams.set("side", position.direction);
      url.searchParams.set("quantity", position.quantity);

      const response = await fetcher(url.toString());
      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as unknown;
      return parseCloseQuote(payload);
    },
  };
}

export function createPredictPortfolioSettlementClient({
  apiBaseUrl,
  fetcher = fetch,
}: {
  apiBaseUrl?: string | null;
  fetcher?: typeof fetch;
}): PredictPortfolioSettlementClient | undefined {
  const normalizedBaseUrl = apiBaseUrl?.trim();
  if (!normalizedBaseUrl) {
    return undefined;
  }

  return {
    getOracleSettlement: async (oracleId) => {
      const url = new URL(`${normalizedBaseUrl.replace(/\/+$/, "")}/testnet/oracle-settlement`);
      url.searchParams.set("oracleId", oracleId);

      const response = await fetcher(url.toString());
      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as unknown;
      return parseOracleSettlement(payload);
    },
  };
}

async function loadPortfolioEvents({
  client,
  eventType,
  limit,
  managerObjectId,
  maxPages,
  moveEventType,
}: {
  client: PredictPortfolioEventClient;
  eventType: PredictPortfolioEventType;
  limit: number;
  managerObjectId: string;
  maxPages: number;
  moveEventType: string;
}): Promise<PredictPortfolioEvent[]> {
  const events: PredictPortfolioEvent[] = [];
  let cursor: EventId | null = null;

  for (let page = 0; page < maxPages; page += 1) {
    const response = await client.queryEvents({
      query: {
        MoveEventType: moveEventType,
      },
      cursor,
      limit,
      order: "descending",
    });

    for (const rawEvent of response.data) {
      const event = parsePortfolioEvent(rawEvent, eventType);
      if (event?.managerId === managerObjectId) {
        events.push(event);
      }
    }

    if (!response.hasNextPage || !response.nextCursor) {
      break;
    }

    cursor = response.nextCursor;
  }

  return events;
}

function buildPortfolioPosition(
  position: PortfolioAccumulator,
  nowMs: number,
  settlement?: PredictOracleSettlement,
): PredictPortfolioPosition {
  const expiryMs = normalizeEpochMs(position.expiry);
  const isExpired = expiryMs <= nowMs;
  const direction = position.isUp ? "UP" : "DOWN";
  const settlementPrice = settledPrice(settlement);
  const didWin =
    isExpired && settlementPrice !== null
      ? didPositionWin({
          isUp: position.isUp,
          settlementPrice,
          strike: position.strike,
        })
      : null;
  const claimValue = didWin === null ? null : didWin ? position.quantity : 0n;

  return {
    id: `${position.managerId}:${position.oracleId}:${position.expiry}:${position.strike}:${direction}`,
    managerId: position.managerId,
    oracleId: position.oracleId,
    expiry: position.expiry,
    expiryMs,
    strike: String(position.strike),
    quantity: position.quantity.toString(),
    direction,
    strikeLabel: formatStrike(position.strike),
    expiryTimeLabel: formatExpiryTime(expiryMs),
    timeLabel: formatTimeRemaining(expiryMs, nowMs),
    statusLabel: isExpired ? "Expired" : "Open",
    actionLabel: isExpired ? "Claim" : "Redeem",
    maxPayoutLabel: formatDusdcBalance(position.quantity),
    costBasisLabel: formatDusdcBalance(position.costBasis),
    ...(isExpired
      ? {
          claimValueLabel: claimValue === null ? undefined : formatDusdcBalance(claimValue),
          outcomeLabel:
            didWin === null ? "Settlement pending" : didWin ? "Pays out" : "No payout",
          settlementPriceLabel:
            settlementPrice === null ? undefined : formatPredictPrice(settlementPrice),
        }
      : {}),
    isExpired,
  };
}

async function loadOracleSettlements(
  positions: PredictPortfolioPosition[],
  settlementClient: PredictPortfolioSettlementClient,
): Promise<PredictOracleSettlement[]> {
  const oracleIds = [...new Set(positions.map((position) => position.oracleId))];
  const settlements = await Promise.all(
    oracleIds.map((oracleId) => settlementClient.getOracleSettlement(oracleId).catch(() => null)),
  );

  return settlements.filter(
    (settlement): settlement is PredictOracleSettlement => settlement !== null,
  );
}

async function loadCloseQuotes(
  positions: PredictPortfolioPosition[],
  closeQuoteClient: PredictPortfolioCloseQuoteClient,
): Promise<PredictPortfolioCloseQuote[]> {
  const quotes = await Promise.all(
    positions
      .filter((position) => !position.isExpired)
      .map((position) => closeQuoteClient.getCloseQuote(position).catch(() => null)),
  );

  return quotes.filter((quote): quote is PredictPortfolioCloseQuote => quote !== null);
}

function applyCloseQuote(
  position: PredictPortfolioPosition,
  quote: PredictPortfolioCloseQuote,
): PredictPortfolioPosition {
  if (position.isExpired || closeQuoteKey(quote) !== positionCloseQuoteKey(position)) {
    return position;
  }

  return {
    ...position,
    closeValueLabel: formatDusdcBalance(quote.redeemPayout),
    closeValueStatusLabel: "Quoted now",
  };
}

function parsePortfolioEvent(
  event: unknown,
  eventType: PredictPortfolioEventType,
): PredictPortfolioEvent | null {
  if (!isRecord(event)) {
    return null;
  }

  const parsedJson = isRecord(event.parsedJson)
    ? event.parsedJson
    : isRecord(event.json)
      ? event.json
      : null;
  if (!parsedJson) {
    return null;
  }

  const managerId = stringValue(parsedJson.manager_id ?? parsedJson.managerId);
  const oracleId = stringValue(parsedJson.oracle_id ?? parsedJson.oracleId);
  const expiry = numberValue(parsedJson.expiry);
  const strike = numberValue(parsedJson.strike);
  const isUp = booleanValue(parsedJson.is_up ?? parsedJson.isUp);
  const quantity = numberValue(parsedJson.quantity);
  const timestampMs = normalizeEpochMs(numberValue(event.timestampMs ?? parsedJson.timestamp_ms));

  if (
    !managerId ||
    !oracleId ||
    expiry === null ||
    strike === null ||
    isUp === null ||
    quantity === null ||
    timestampMs === null
  ) {
    return null;
  }

  return {
    eventId: eventId(event, eventType),
    eventType,
    managerId,
    oracleId,
    expiry,
    strike,
    isUp,
    quantity,
    cost: numberValue(parsedJson.cost) ?? undefined,
    payout: numberValue(parsedJson.payout) ?? undefined,
    timestampMs,
  };
}

function positionKey(event: Pick<PredictPortfolioEvent, "managerId" | "oracleId" | "expiry" | "strike" | "isUp">): string {
  return `${event.managerId}:${event.oracleId}:${event.expiry}:${event.strike}:${event.isUp ? "UP" : "DOWN"}`;
}

function compareEventsByTime(left: PredictPortfolioEvent, right: PredictPortfolioEvent): number {
  return left.timestampMs - right.timestampMs || left.eventId.localeCompare(right.eventId);
}

function eventId(event: Record<string, unknown>, eventType: PredictPortfolioEventType): string {
  const id = isRecord(event.id) ? event.id : null;
  const digest = stringValue(id?.txDigest ?? event.txDigest ?? event.digest) ?? "unknown";
  const seq = stringValue(id?.eventSeq ?? event.eventSeq) ?? "0";

  return `${eventType}:${digest}:${seq}`;
}

function normalizeEpochMs(value: number | null): number {
  if (value === null || !Number.isFinite(value)) {
    return 0;
  }

  return value < 10_000_000_000 ? value * 1000 : value;
}

function formatStrike(strike: number): string {
  return formatUsdPrice(normalizeStrike(strike));
}

function formatPredictPrice(price: number): string {
  return formatUsdPrice(normalizePredictPrice(price));
}

function formatUsdPrice(price: number): string {
  return `$${price.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
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

function normalizePredictPrice(value: number): number {
  if (value >= 1_000_000_000_000) {
    return value / 1_000_000_000;
  }

  if (value >= 1_000_000_000) {
    return value / 1_000_000;
  }

  return value;
}

function didPositionWin({
  isUp,
  settlementPrice,
  strike,
}: {
  isUp: boolean;
  settlementPrice: number;
  strike: number;
}): boolean {
  const normalizedSettlementPrice = normalizePredictPrice(settlementPrice);
  const normalizedStrike = normalizeStrike(strike);

  return isUp
    ? normalizedSettlementPrice > normalizedStrike
    : normalizedSettlementPrice <= normalizedStrike;
}

function settledPrice(settlement: PredictOracleSettlement | undefined): number | null {
  if (
    !settlement ||
    settlement.status !== "settled" ||
    typeof settlement.settlementPrice !== "number" ||
    !Number.isFinite(settlement.settlementPrice)
  ) {
    return null;
  }

  return settlement.settlementPrice;
}

function closeQuoteKey(quote: PredictPortfolioCloseQuote): string {
  return `${quote.oracleId}:${quote.expiry}:${quote.strike}:${quote.side}:${quote.quantity}`;
}

function positionCloseQuoteKey(position: PredictPortfolioPosition): string {
  return `${position.oracleId}:${position.expiry}:${position.strike}:${position.direction}:${position.quantity}`;
}

function parseCloseQuote(payload: unknown): PredictPortfolioCloseQuote | null {
  if (!isRecord(payload)) {
    return null;
  }

  const oracleId = stringValue(payload.oracleId ?? payload.oracle_id);
  const expiry = stringValue(payload.expiry);
  const strike = stringValue(payload.strike);
  const side = sideValue(payload.side);
  const quantity = stringValue(payload.quantity);
  const redeemPayout = stringValue(payload.redeemPayout ?? payload.redeem_payout);
  const redeemPayoutUsd = numberValue(payload.redeemPayoutUsd ?? payload.redeem_payout_usd);

  if (
    !oracleId ||
    !expiry ||
    !strike ||
    !side ||
    !quantity ||
    !redeemPayout ||
    redeemPayoutUsd === null ||
    payload.quoteStatus !== "ready"
  ) {
    return null;
  }

  return {
    oracleId,
    expiry,
    strike,
    side,
    quantity,
    redeemPayout,
    redeemPayoutUsd,
    quoteStatus: "ready",
  };
}

function parseOracleSettlement(payload: unknown): PredictOracleSettlement | null {
  if (!isRecord(payload)) {
    return null;
  }

  const oracleId = stringValue(payload.oracleId ?? payload.oracle_id);
  const status = stringValue(payload.status);
  const settlementPrice = numberValue(payload.settlementPrice ?? payload.settlement_price);
  const settledAtMs = numberValue(payload.settledAtMs ?? payload.settled_at);

  if (!oracleId || !status) {
    return null;
  }

  return {
    oracleId,
    status,
    settlementPrice,
    settledAtMs,
  };
}

function formatExpiryTime(expiryMs: number): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(expiryMs));
}

function formatTimeRemaining(expiryMs: number, nowMs: number): string {
  const remainingMs = expiryMs - nowMs;
  if (remainingMs <= 0) {
    return "Expired";
  }

  const minuteMs = 60_000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  if (remainingMs >= dayMs) {
    const days = Math.ceil(remainingMs / dayMs);
    return `${days}d left`;
  }
  if (remainingMs >= hourMs) {
    const hours = Math.ceil(remainingMs / hourMs);
    return `${hours}h left`;
  }

  return `${Math.max(1, Math.ceil(remainingMs / minuteMs))}m left`;
}

function createPredictPortfolioEventClient(): PredictPortfolioEventClient {
  return new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl("testnet"),
    network: "testnet",
  });
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value)) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }

  return null;
}

function sideValue(value: unknown): "UP" | "DOWN" | null {
  return value === "UP" || value === "DOWN" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
