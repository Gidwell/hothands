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
  isExpired: boolean;
};

export type PredictPortfolioEventClient = {
  queryEvents(
    input: Pick<QueryEventsParams, "query" | "cursor" | "limit" | "order">,
  ): Promise<Pick<PaginatedEvents, "data" | "hasNextPage" | "nextCursor">>;
};

export type LoadPredictPortfolioOptions = {
  client?: PredictPortfolioEventClient;
  limit?: number;
  managerObjectId: string;
  maxPages?: number;
  nowMs?: number;
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

  return buildPortfolioPositions([...mints, ...redeems], { nowMs });
}

export function buildPortfolioPositions(
  events: PredictPortfolioEvent[],
  { nowMs = Date.now() }: { nowMs?: number } = {},
): PredictPortfolioPosition[] {
  const positions = new Map<string, PortfolioAccumulator>();

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
    .map((position) => buildPortfolioPosition(position, nowMs))
    .sort((left, right) => right.expiryMs - left.expiryMs || left.id.localeCompare(right.id));
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
): PredictPortfolioPosition {
  const expiryMs = normalizeEpochMs(position.expiry);
  const isExpired = expiryMs <= nowMs;
  const direction = position.isUp ? "UP" : "DOWN";

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
    isExpired,
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
  return `$${normalizeStrike(strike).toLocaleString("en-US", {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
