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
  positionSummaries: PredictPositionSummary[];
  indexerJobStatuses: PredictIndexerJobStatus[];
};

export type PredictIndexerWriter = {
  upsertOracles(oracles: PredictOracleState[]): Promise<number>;
  upsertTradeEvents(events: PredictNormalizedTradeEvent[]): Promise<number>;
  upsertOraclePrices(points: PredictOraclePricePoint[]): Promise<number>;
  upsertOracleSvi(points: PredictOracleSviPoint[]): Promise<number>;
  upsertPositionSummaries(summaries: PredictPositionSummary[]): Promise<number>;
  upsertIndexerJobStatus(status: PredictIndexerJobStatus): Promise<number>;
  refreshPositionSummaries(): Promise<number>;
};

export type PredictIndexerStore = PredictIndexerWriter & {
  listBtcOracles(options?: { includeSettled?: boolean; limit?: number }): Promise<PredictOracleState[]>;
  listRecentTradeEvents(options?: {
    kind?: "mint" | "redeem";
    limit?: number;
    hideExpiredAtMs?: number;
    managerId?: string;
    owner?: string;
  }): Promise<PredictNormalizedTradeEvent[]>;
  listPositionSummaries(options?: {
    owner?: string;
    limit?: number;
    status?: PredictPositionSummary["status"];
    hideExpiredAtMs?: number;
  }): Promise<PredictPositionSummary[]>;
  listOraclePrices(options: {
    oracleId: string;
    fromMs?: number;
    toMs?: number;
    maxRawPoints?: number;
    maxPoints?: number;
  }): Promise<PredictOraclePricePoint[]>;
  getLatestOraclePrice(oracleId: string): Promise<PredictOraclePricePoint | null>;
  getOraclePriceStats(oracleId: string): Promise<{
    totalPointCount: number;
    startTimestampMs: number;
    endTimestampMs: number;
  } | null>;
  listIndexerJobStatuses(): Promise<PredictIndexerJobStatus[]>;
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

export type PredictIndexerJobStatus = {
  jobName: string;
  source: string;
  pollIntervalMs: number;
  status: "ok" | "error";
  lastPollStartedAtMs: number;
  lastPollCompletedAtMs?: number;
  lastSuccessAtMs?: number;
  lastNewDataAtMs?: number;
  lastSourceTimestampMs?: number;
  lastCheckpoint?: number;
  rowsFetched: number;
  rowsWritten: number;
  totalRowsWritten: number;
  consecutiveErrorCount: number;
  lastError?: string;
  observedUpdateGapMs?: number;
  lagMs?: number;
  updatedAtMs: number;
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
  private readonly positionSummaries = new Map<string, PredictPositionSummary>();
  private readonly indexerJobStatuses = new Map<string, PredictIndexerJobStatus>();

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

  async upsertPositionSummaries(summaries: PredictPositionSummary[]): Promise<number> {
    return upsertMany(this.positionSummaries, summaries, (summary) => summary.id);
  }

  async upsertIndexerJobStatus(status: PredictIndexerJobStatus): Promise<number> {
    const existing = this.indexerJobStatuses.get(status.jobName);
    this.indexerJobStatuses.set(status.jobName, status);

    return existing ? 0 : 1;
  }

  async refreshPositionSummaries(): Promise<number> {
    const summaries = summarizePredictPositions([...this.tradeEvents.values()]);
    this.positionSummaries.clear();
    for (const summary of summaries) {
      this.positionSummaries.set(summary.id, summary);
    }

    return summaries.length;
  }

  async listIndexerJobStatuses(): Promise<PredictIndexerJobStatus[]> {
    return [...this.indexerJobStatuses.values()].sort((left, right) =>
      left.jobName.localeCompare(right.jobName),
    );
  }

  async listBtcOracles({
    includeSettled = false,
    limit = Number.POSITIVE_INFINITY,
  }: { includeSettled?: boolean; limit?: number } = {}): Promise<PredictOracleState[]> {
    return [...this.oracles.values()]
      .filter((oracle) => oracle.underlying_asset === "BTC")
      .filter((oracle) => includeSettled || oracle.status === "active")
      .sort((left, right) => left.expiry - right.expiry || left.oracle_id.localeCompare(right.oracle_id))
      .slice(0, limit);
  }

  async listRecentTradeEvents({
    kind,
    limit = Number.POSITIVE_INFINITY,
    hideExpiredAtMs,
    managerId,
    owner,
  }: {
    kind?: "mint" | "redeem";
    limit?: number;
    hideExpiredAtMs?: number;
    managerId?: string;
    owner?: string;
  } = {}): Promise<PredictNormalizedTradeEvent[]> {
    return [...this.tradeEvents.values()]
      .filter((event) => (kind ? event.kind === kind : true))
      .filter((event) => (managerId ? event.managerId === managerId : true))
      .filter((event) => (owner ? (event.trader ?? event.actor) === owner : true))
      .filter((event) => (hideExpiredAtMs === undefined ? true : event.expiryMs > hideExpiredAtMs))
      .sort((left, right) => right.timestampMs - left.timestampMs || left.eventId.localeCompare(right.eventId))
      .slice(0, limit);
  }

  async listPositionSummaries({
    owner,
    limit = Number.POSITIVE_INFINITY,
    status,
    hideExpiredAtMs,
  }: {
    owner?: string;
    limit?: number;
    status?: PredictPositionSummary["status"];
    hideExpiredAtMs?: number;
  } = {}): Promise<PredictPositionSummary[]> {
    return [...this.positionSummaries.values()]
      .filter((summary) => (owner ? summary.owner === owner : true))
      .filter((summary) => (status ? summary.status === status : true))
      .filter((summary) => (hideExpiredAtMs === undefined ? true : summary.expiryMs > hideExpiredAtMs))
      .sort((left, right) => right.lastEventMs - left.lastEventMs || left.id.localeCompare(right.id))
      .slice(0, limit);
  }

  async listOraclePrices({
    oracleId,
    fromMs,
    toMs,
    maxRawPoints = Number.POSITIVE_INFINITY,
    maxPoints,
  }: {
    oracleId: string;
    fromMs?: number;
    toMs?: number;
    maxRawPoints?: number;
    maxPoints?: number;
  }): Promise<PredictOraclePricePoint[]> {
    const points = [...this.oraclePrices.values()]
      .filter((point) => point.oracleId === oracleId)
      .filter((point) => (fromMs === undefined ? true : point.timestampMs >= fromMs))
      .filter((point) => (toMs === undefined ? true : point.timestampMs <= toMs))
      .sort(comparePointsByTime)
      .slice(0, maxRawPoints);

    return maxPoints === undefined ? points : points.slice(0, maxPoints);
  }

  async getLatestOraclePrice(oracleId: string): Promise<PredictOraclePricePoint | null> {
    return [...this.oraclePrices.values()]
      .filter((point) => point.oracleId === oracleId)
      .sort((left, right) => right.timestampMs - left.timestampMs || (left.eventId ?? "").localeCompare(right.eventId ?? ""))[0] ?? null;
  }

  async getOraclePriceStats(oracleId: string): Promise<{
    totalPointCount: number;
    startTimestampMs: number;
    endTimestampMs: number;
  } | null> {
    const points = [...this.oraclePrices.values()]
      .filter((point) => point.oracleId === oracleId)
      .sort(comparePointsByTime);

    if (points.length === 0) {
      return null;
    }

    return {
      totalPointCount: points.length,
      startTimestampMs: points[0].timestampMs,
      endTimestampMs: points.at(-1)?.timestampMs ?? points[0].timestampMs,
    };
  }

  snapshot(): PredictIndexerSnapshot {
    return {
      oracles: [...this.oracles.values()].sort((left, right) =>
        left.oracle_id.localeCompare(right.oracle_id),
      ),
      tradeEvents: [...this.tradeEvents.values()].sort(compareEventsByTime),
      oraclePrices: [...this.oraclePrices.values()].sort(comparePointsByTime),
      oracleSvi: [...this.oracleSvi.values()].sort(comparePointsByTime),
      positionSummaries: [...this.positionSummaries.values()].sort(
        (left, right) =>
          right.lastEventMs - left.lastEventMs ||
          left.id.localeCompare(right.id),
      ),
      indexerJobStatuses: [...this.indexerJobStatuses.values()].sort(
        (left, right) => left.jobName.localeCompare(right.jobName),
      ),
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
