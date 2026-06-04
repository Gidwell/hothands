import type {
  PredictNormalizedTradeEvent,
  PredictOraclePricePoint,
  PredictOracleState,
  PredictOracleSviPoint,
} from "./deepbook-predict";

export type PredictIndexerSnapshot = {
  oracles: PredictOracleState[];
  tradeEvents: PredictNormalizedTradeEvent[];
  oraclePrices: PredictOraclePricePoint[];
  oracleSvi: PredictOracleSviPoint[];
};

export type PredictIndexerStore = {
  upsertOracles(oracles: PredictOracleState[]): Promise<number>;
  upsertTradeEvents(events: PredictNormalizedTradeEvent[]): Promise<number>;
  upsertOraclePrices(points: PredictOraclePricePoint[]): Promise<number>;
  upsertOracleSvi(points: PredictOracleSviPoint[]): Promise<number>;
  snapshot(): PredictIndexerSnapshot;
};

export type PredictPositionSummary = {
  id: string;
  owner: string;
  managerId: string;
  oracleId: string;
  expiryMs: number;
  strike: number;
  isUp: boolean;
  mintedQuantity: number;
  redeemedQuantity: number;
  openQuantity: number;
  cost: number;
  payout: number;
  realizedPnl: number;
  lastEventMs: number;
  status: "open" | "closed";
};

export function createInMemoryPredictIndexerStore(): PredictIndexerStore {
  return new InMemoryPredictIndexerStore();
}

export function summarizePredictPositions(
  events: PredictNormalizedTradeEvent[],
): PredictPositionSummary[] {
  const positions = new Map<string, PredictPositionSummary>();

  for (const event of [...events].sort(compareEventsByTime)) {
    const id = positionId(event);
    const current = positions.get(id) ?? createPositionSummary(event, id);
    positions.set(id, current);

    current.lastEventMs = Math.max(current.lastEventMs, event.timestampMs);

    if (event.kind === "mint") {
      current.owner = event.trader ?? event.actor;
      current.mintedQuantity += event.quantity;
      current.cost += event.cost ?? 0;
    } else {
      current.owner = event.trader ?? event.actor;
      current.redeemedQuantity += event.quantity;
      current.payout += event.payout ?? 0;
    }

    current.openQuantity = Math.max(0, current.mintedQuantity - current.redeemedQuantity);
    current.realizedPnl = current.payout - current.cost;
    current.status = current.openQuantity > 0 ? "open" : "closed";
  }

  return [...positions.values()].sort(
    (left, right) =>
      right.lastEventMs - left.lastEventMs ||
      left.id.localeCompare(right.id),
  );
}

class InMemoryPredictIndexerStore implements PredictIndexerStore {
  private readonly oracles = new Map<string, PredictOracleState>();
  private readonly tradeEvents = new Map<string, PredictNormalizedTradeEvent>();
  private readonly oraclePrices = new Map<string, PredictOraclePricePoint>();
  private readonly oracleSvi = new Map<string, PredictOracleSviPoint>();

  async upsertOracles(oracles: PredictOracleState[]): Promise<number> {
    return upsertMany(this.oracles, oracles, (oracle) => oracle.oracle_id);
  }

  async upsertTradeEvents(events: PredictNormalizedTradeEvent[]): Promise<number> {
    return upsertMany(this.tradeEvents, events, (event) => event.eventId);
  }

  async upsertOraclePrices(points: PredictOraclePricePoint[]): Promise<number> {
    return upsertMany(this.oraclePrices, points, pricePointKey);
  }

  async upsertOracleSvi(points: PredictOracleSviPoint[]): Promise<number> {
    return upsertMany(this.oracleSvi, points, (point) => point.eventId);
  }

  snapshot(): PredictIndexerSnapshot {
    return {
      oracles: [...this.oracles.values()].sort((left, right) =>
        left.oracle_id.localeCompare(right.oracle_id),
      ),
      tradeEvents: [...this.tradeEvents.values()].sort(compareEventsByTime),
      oraclePrices: [...this.oraclePrices.values()].sort(comparePointsByTime),
      oracleSvi: [...this.oracleSvi.values()].sort(comparePointsByTime),
    };
  }
}

function upsertMany<T>(
  map: Map<string, T>,
  values: T[],
  keyForValue: (value: T) => string,
): number {
  let changed = 0;

  for (const value of values) {
    const key = keyForValue(value);
    if (!map.has(key)) {
      changed += 1;
    }
    map.set(key, value);
  }

  return changed;
}

function pricePointKey(point: PredictOraclePricePoint): string {
  return point.eventId ?? [
    point.oracleId,
    point.checkpoint ?? "no-checkpoint",
    point.timestampMs,
    point.spot,
    point.forward ?? "no-forward",
  ].join(":");
}

function positionId(event: PredictNormalizedTradeEvent): string {
  return [
    event.managerId,
    event.oracleId,
    event.expiryMs,
    event.strike,
    event.isUp ? "UP" : "DOWN",
  ].join(":");
}

function createPositionSummary(
  event: PredictNormalizedTradeEvent,
  id: string,
): PredictPositionSummary {
  return {
    id,
    owner: event.trader ?? event.actor,
    managerId: event.managerId,
    oracleId: event.oracleId,
    expiryMs: event.expiryMs,
    strike: event.strike,
    isUp: event.isUp,
    mintedQuantity: 0,
    redeemedQuantity: 0,
    openQuantity: 0,
    cost: 0,
    payout: 0,
    realizedPnl: 0,
    lastEventMs: event.timestampMs,
    status: "open",
  };
}

function compareEventsByTime(
  left: PredictNormalizedTradeEvent,
  right: PredictNormalizedTradeEvent,
): number {
  return left.timestampMs - right.timestampMs || left.eventId.localeCompare(right.eventId);
}

function comparePointsByTime<T extends { timestampMs: number; eventId?: string }>(
  left: T,
  right: T,
): number {
  return (
    left.timestampMs - right.timestampMs ||
    (left.eventId ?? "").localeCompare(right.eventId ?? "")
  );
}
