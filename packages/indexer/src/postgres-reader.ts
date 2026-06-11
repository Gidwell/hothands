import type {
  PredictNormalizedTradeEvent,
  PredictOraclePricePoint,
  PredictOracleSviPoint,
  PredictOracleState,
} from "./deepbook-predict";
import { downsampleOraclePricePoints } from "./projections";
import type { PredictIndexerJobStatus, PredictPositionSummary } from "./store";
import type { SqlValue } from "./postgres-store";

export type SqlRow = Record<string, unknown>;

export type SqlQueryResult = {
  rows: readonly SqlRow[];
};

export type SqlQueryExecutor = (
  statement: string,
  params?: readonly SqlValue[],
) => Promise<SqlQueryResult>;

export type PostgresPredictIndexerReaderOptions = {
  execute: SqlQueryExecutor;
};

export type ListOraclePricesOptions = {
  oracleId: string;
  fromMs?: number;
  toMs?: number;
  maxRawPoints?: number;
  maxPoints?: number;
};

export type ListBtcOraclesOptions = {
  includeSettled?: boolean;
  limit?: number;
};

export type ListRecentTradeEventsOptions = {
  kind?: "mint" | "redeem";
  limit?: number;
  hideExpiredAtMs?: number;
  managerId?: string;
  owner?: string;
};

export type ListPositionSummariesOptions = {
  owner?: string;
  limit?: number;
  status?: PredictPositionSummary["status"];
  hideExpiredAtMs?: number;
};

export type OraclePriceStats = {
  totalPointCount: number;
  startTimestampMs: number;
  endTimestampMs: number;
};

export type PredictIndexerReader = {
  listBtcOracles(options?: ListBtcOraclesOptions): Promise<PredictOracleState[]>;
  listRecentTradeEvents(options?: ListRecentTradeEventsOptions): Promise<PredictNormalizedTradeEvent[]>;
  listPositionSummaries(options?: ListPositionSummariesOptions): Promise<PredictPositionSummary[]>;
  listOraclePrices(options: ListOraclePricesOptions): Promise<PredictOraclePricePoint[]>;
  getLatestOraclePrice(oracleId: string): Promise<PredictOraclePricePoint | null>;
  getLatestOracleSvi?: (oracleId: string) => Promise<PredictOracleSviPoint | null>;
  getOraclePriceStats(oracleId: string): Promise<OraclePriceStats | null>;
  listIndexerJobStatuses(): Promise<PredictIndexerJobStatus[]>;
};

const DEFAULT_MARKET_LIMIT = 5_000;
const DEFAULT_PRICE_RAW_LIMIT = 250_000;

export function createPostgresPredictIndexerReader({
  execute,
}: PostgresPredictIndexerReaderOptions): PredictIndexerReader {
  return {
    listBtcOracles: async ({ includeSettled = false, limit = DEFAULT_MARKET_LIMIT } = {}) => {
      const filters = ["underlying_asset = $1"];
      const params: SqlValue[] = ["BTC"];

      if (!includeSettled) {
        filters.push("status = $2");
        params.push("active");
      }

      params.push(normalizeLimit(limit));
      const result = await execute(
        [
          "select predict_id, oracle_id, underlying_asset, expiry_ms, min_strike, tick_size, status,",
          "activated_at_ms, settlement_price, settled_at_ms, created_checkpoint",
          "from predict_oracles",
          `where ${filters.join(" and ")}`,
          "order by expiry_ms asc, oracle_id asc",
          `limit $${params.length}`,
        ].join("\n"),
        params,
      );

      return result.rows.map(mapOracleRow);
    },
    listRecentTradeEvents: async ({
      kind,
      limit = DEFAULT_MARKET_LIMIT,
      hideExpiredAtMs,
      managerId,
      owner,
    } = {}) => {
      const params: SqlValue[] = [];
      const filters: string[] = [];

      if (managerId) {
        params.push(managerId);
        filters.push(`manager_id = $${params.length}`);
      }

      if (owner) {
        params.push(owner);
        filters.push(`coalesce(trader, actor) = $${params.length}`);
      }

      if (kind) {
        params.push(kind);
        filters.push(`kind = $${params.length}`);
      }

      if (hideExpiredAtMs !== undefined) {
        params.push(hideExpiredAtMs);
        filters.push(`expiry_ms > $${params.length}`);
      }

      params.push(normalizeLimit(limit));
      const result = await execute(
        [
          "select event_id, kind, actor, trader, manager_id, oracle_id, expiry_ms, strike, is_up,",
          "quantity, cost, payout, transaction_digest, checkpoint, timestamp_ms, source",
          "from predict_trade_events",
          filters.length > 0 ? `where ${filters.join(" and ")}` : "",
          "order by timestamp_ms desc, event_id asc",
          `limit $${params.length}`,
        ].filter(Boolean).join("\n"),
        params,
      );

      return result.rows.map(mapTradeEventRow);
    },
    listPositionSummaries: async ({
      owner,
      limit = DEFAULT_MARKET_LIMIT,
      status,
      hideExpiredAtMs,
    } = {}) => {
      const params: SqlValue[] = [];
      const filters: string[] = [];

      if (owner) {
        params.push(owner);
        filters.push(`owner = $${params.length}`);
      }

      if (status) {
        params.push(status);
        filters.push(`status = $${params.length}`);
      }

      if (hideExpiredAtMs !== undefined) {
        params.push(hideExpiredAtMs);
        filters.push(`expiry_ms > $${params.length}`);
      }

      params.push(normalizeLimit(limit));
      const result = await execute(
        [
          "select position_id, owner, manager_id, oracle_id, expiry_ms, strike, is_up,",
          "minted_quantity, redeemed_quantity, open_quantity, cost, payout, realized_pnl,",
          "status, last_event_ms",
          "from predict_position_summaries",
          filters.length > 0 ? `where ${filters.join(" and ")}` : "",
          "order by last_event_ms desc, position_id asc",
          `limit $${params.length}`,
        ].filter(Boolean).join("\n"),
        params,
      );

      return result.rows.map(mapPositionSummaryRow);
    },
    listOraclePrices: async ({
      oracleId,
      fromMs,
      toMs,
      maxRawPoints = DEFAULT_PRICE_RAW_LIMIT,
      maxPoints,
    }) => {
      const params: SqlValue[] = [oracleId];
      const filters = ["oracle_id = $1"];

      if (fromMs !== undefined) {
        params.push(fromMs);
        filters.push(`timestamp_ms >= $${params.length}`);
      }

      if (toMs !== undefined) {
        params.push(toMs);
        filters.push(`timestamp_ms <= $${params.length}`);
      }

      if (maxPoints !== undefined) {
        params.push(normalizeLimit(maxPoints));
        const maxPointsParam = `$${params.length}`;
        const result = await execute(
          [
            "with filtered as (",
            "  select event_id, oracle_id, spot, forward, checkpoint, timestamp_ms, source,",
            "    row_number() over (order by timestamp_ms asc, event_id asc) as rn",
            "  from predict_oracle_prices",
            `  where ${filters.join(" and ")}`,
            "), stats as (",
            "  select count(*)::bigint as total_count from filtered",
            "), targets as (",
            "  select distinct greatest(",
            "    1,",
            "    least(",
            "      stats.total_count,",
            `      round(1 + (slot::numeric * greatest(stats.total_count - 1, 0)) / greatest(least(${maxPointsParam}, stats.total_count) - 1, 1))::bigint`,
            "    )",
            "  ) as target_rn",
            "  from stats, generate_series(",
            "    0,",
            `    greatest(least(${maxPointsParam}, stats.total_count)::int - 1, 0)`,
            "  ) as slot",
            ")",
            "select filtered.event_id, filtered.oracle_id, filtered.spot, filtered.forward,",
            "  filtered.checkpoint, filtered.timestamp_ms, filtered.source",
            "from filtered",
            "join targets on filtered.rn = targets.target_rn",
            "order by filtered.timestamp_ms asc, filtered.event_id asc",
          ].join("\n"),
          params,
        );
        const points = result.rows.map(mapOraclePriceRow);

        return downsampleOraclePricePoints(points, maxPoints);
      }

      params.push(normalizeLimit(maxRawPoints));
      const result = await execute(
        [
          "select event_id, oracle_id, spot, forward, checkpoint, timestamp_ms, source",
          "from predict_oracle_prices",
          `where ${filters.join(" and ")}`,
          "order by timestamp_ms asc, event_id asc",
          `limit $${params.length}`,
        ].join("\n"),
        params,
      );
      const points = result.rows.map(mapOraclePriceRow);

      return maxPoints === undefined
        ? points
        : downsampleOraclePricePoints(points, maxPoints);
    },
    getLatestOraclePrice: async (oracleId) => {
      const result = await execute(
        [
          "select event_id, oracle_id, spot, forward, checkpoint, timestamp_ms, source",
          "from predict_oracle_prices",
          "where oracle_id = $1",
          "order by timestamp_ms desc, event_id asc",
          "limit 1",
        ].join("\n"),
        [oracleId],
      );

      return result.rows[0] ? mapOraclePriceRow(result.rows[0]) : null;
    },
    getLatestOracleSvi: async (oracleId) => {
      const result = await execute(
        [
          "select event_id, oracle_id, a, b, rho, rho_negative, m, m_negative, sigma,",
          "checkpoint, timestamp_ms, source",
          "from predict_oracle_svi",
          "where oracle_id = $1",
          "order by timestamp_ms desc, event_id asc",
          "limit 1",
        ].join("\n"),
        [oracleId],
      );

      return result.rows[0] ? mapOracleSviRow(result.rows[0]) : null;
    },
    getOraclePriceStats: async (oracleId) => {
      const result = await execute(
        [
          "select count(*) as total_point_count,",
          "min(timestamp_ms) as start_timestamp_ms,",
          "max(timestamp_ms) as end_timestamp_ms",
          "from predict_oracle_prices",
          "where oracle_id = $1",
        ].join("\n"),
        [oracleId],
      );

      const row = result.rows[0];
      if (!row) {
        return null;
      }

      const totalPointCount = requiredNumber(row.total_point_count, "total_point_count");
      if (totalPointCount === 0) {
        return null;
      }

      return {
        totalPointCount,
        startTimestampMs: requiredNumber(row.start_timestamp_ms, "start_timestamp_ms"),
        endTimestampMs: requiredNumber(row.end_timestamp_ms, "end_timestamp_ms"),
      };
    },
    listIndexerJobStatuses: async () => {
      const result = await execute(
        [
          "select job_name, source, poll_interval_ms, status,",
          "last_poll_started_at_ms, last_poll_completed_at_ms, last_success_at_ms,",
          "last_new_data_at_ms, last_source_timestamp_ms, last_checkpoint,",
          "rows_fetched, rows_written, total_rows_written, consecutive_error_count,",
          "last_error, observed_update_gap_ms, lag_ms, updated_at_ms",
          "from predict_indexer_jobs",
          "order by job_name asc",
        ].join("\n"),
        [],
      );

      return result.rows.map(mapIndexerJobStatusRow);
    },
  };
}

function mapOracleRow(row: SqlRow): PredictOracleState {
  return {
    predict_id: requiredString(row.predict_id, "predict_id"),
    oracle_id: requiredString(row.oracle_id, "oracle_id"),
    underlying_asset: requiredString(row.underlying_asset, "underlying_asset"),
    expiry: requiredNumber(row.expiry_ms, "expiry_ms"),
    min_strike: requiredNumber(row.min_strike, "min_strike"),
    tick_size: requiredNumber(row.tick_size, "tick_size"),
    status: requiredString(row.status, "status"),
    ...(optionalNumber(row.activated_at_ms) === undefined
      ? {}
      : { activated_at: optionalNumber(row.activated_at_ms) }),
    ...(optionalNumber(row.settlement_price) === undefined
      ? {}
      : { settlement_price: optionalNumber(row.settlement_price) }),
    ...(optionalNumber(row.settled_at_ms) === undefined
      ? {}
      : { settled_at: optionalNumber(row.settled_at_ms) }),
    ...(optionalNumber(row.created_checkpoint) === undefined
      ? {}
      : { created_checkpoint: optionalNumber(row.created_checkpoint) }),
  };
}

function mapTradeEventRow(row: SqlRow): PredictNormalizedTradeEvent {
  const kind = requiredString(row.kind, "kind");
  const source = requiredString(row.source, "source");

  return {
    eventId: requiredString(row.event_id, "event_id"),
    kind: kind === "redeem" ? "redeem" : "mint",
    actor: requiredString(row.actor, "actor"),
    ...(optionalString(row.trader) === undefined ? {} : { trader: optionalString(row.trader) }),
    managerId: requiredString(row.manager_id, "manager_id"),
    oracleId: requiredString(row.oracle_id, "oracle_id"),
    expiryMs: requiredNumber(row.expiry_ms, "expiry_ms"),
    strike: requiredNumber(row.strike, "strike"),
    isUp: booleanValue(row.is_up),
    quantity: requiredNumber(row.quantity, "quantity"),
    ...(optionalNumber(row.cost) === undefined ? {} : { cost: optionalNumber(row.cost) }),
    ...(optionalNumber(row.payout) === undefined ? {} : { payout: optionalNumber(row.payout) }),
    ...(optionalString(row.transaction_digest) === undefined
      ? {}
      : { transactionDigest: optionalString(row.transaction_digest) }),
    ...(optionalNumber(row.checkpoint) === undefined
      ? {}
      : { checkpoint: optionalNumber(row.checkpoint) }),
    timestampMs: requiredNumber(row.timestamp_ms, "timestamp_ms"),
    source: toTradeEventSource(source),
  };
}

function mapPositionSummaryRow(row: SqlRow): PredictPositionSummary {
  const status = requiredString(row.status, "status");

  return {
    id: requiredString(row.position_id, "position_id"),
    owner: requiredString(row.owner, "owner"),
    managerId: requiredString(row.manager_id, "manager_id"),
    oracleId: requiredString(row.oracle_id, "oracle_id"),
    expiryMs: requiredNumber(row.expiry_ms, "expiry_ms"),
    strike: requiredNumber(row.strike, "strike"),
    isUp: booleanValue(row.is_up),
    mintedQuantity: requiredNumber(row.minted_quantity, "minted_quantity"),
    redeemedQuantity: requiredNumber(row.redeemed_quantity, "redeemed_quantity"),
    openQuantity: requiredNumber(row.open_quantity, "open_quantity"),
    cost: requiredNumber(row.cost, "cost"),
    payout: requiredNumber(row.payout, "payout"),
    realizedPnl: requiredNumber(row.realized_pnl, "realized_pnl"),
    lastEventMs: requiredNumber(row.last_event_ms, "last_event_ms"),
    status: status === "closed" ? "closed" : "open",
  };
}

function mapOraclePriceRow(row: SqlRow): PredictOraclePricePoint {
  return {
    eventId: requiredString(row.event_id, "event_id"),
    oracleId: requiredString(row.oracle_id, "oracle_id"),
    spot: requiredNumber(row.spot, "spot"),
    ...(optionalNumber(row.forward) === undefined ? {} : { forward: optionalNumber(row.forward) }),
    ...(optionalNumber(row.checkpoint) === undefined
      ? {}
      : { checkpoint: optionalNumber(row.checkpoint) }),
    timestampMs: requiredNumber(row.timestamp_ms, "timestamp_ms"),
    source: "oracles/prices",
  };
}

function mapOracleSviRow(row: SqlRow): PredictOracleSviPoint {
  return {
    eventId: requiredString(row.event_id, "event_id"),
    oracleId: requiredString(row.oracle_id, "oracle_id"),
    a: requiredNumber(row.a, "a"),
    b: requiredNumber(row.b, "b"),
    rho: requiredNumber(row.rho, "rho"),
    rhoNegative: requiredNumber(row.rho_negative, "rho_negative"),
    m: requiredNumber(row.m, "m"),
    mNegative: requiredNumber(row.m_negative, "m_negative"),
    sigma: requiredNumber(row.sigma, "sigma"),
    ...(optionalNumber(row.checkpoint) === undefined
      ? {}
      : { checkpoint: optionalNumber(row.checkpoint) }),
    timestampMs: requiredNumber(row.timestamp_ms, "timestamp_ms"),
    source: "oracles/svi",
  };
}

function mapIndexerJobStatusRow(row: SqlRow): PredictIndexerJobStatus {
  const status = requiredString(row.status, "status");

  return {
    jobName: requiredString(row.job_name, "job_name"),
    source: requiredString(row.source, "source"),
    pollIntervalMs: requiredNumber(row.poll_interval_ms, "poll_interval_ms"),
    status: status === "error" ? "error" : "ok",
    lastPollStartedAtMs: requiredNumber(row.last_poll_started_at_ms, "last_poll_started_at_ms"),
    ...(optionalNumber(row.last_poll_completed_at_ms) === undefined
      ? {}
      : { lastPollCompletedAtMs: optionalNumber(row.last_poll_completed_at_ms) }),
    ...(optionalNumber(row.last_success_at_ms) === undefined
      ? {}
      : { lastSuccessAtMs: optionalNumber(row.last_success_at_ms) }),
    ...(optionalNumber(row.last_new_data_at_ms) === undefined
      ? {}
      : { lastNewDataAtMs: optionalNumber(row.last_new_data_at_ms) }),
    ...(optionalNumber(row.last_source_timestamp_ms) === undefined
      ? {}
      : { lastSourceTimestampMs: optionalNumber(row.last_source_timestamp_ms) }),
    ...(optionalNumber(row.last_checkpoint) === undefined
      ? {}
      : { lastCheckpoint: optionalNumber(row.last_checkpoint) }),
    rowsFetched: requiredNumber(row.rows_fetched, "rows_fetched"),
    rowsWritten: requiredNumber(row.rows_written, "rows_written"),
    totalRowsWritten: requiredNumber(row.total_rows_written, "total_rows_written"),
    consecutiveErrorCount: requiredNumber(row.consecutive_error_count, "consecutive_error_count"),
    ...(optionalString(row.last_error) === undefined
      ? {}
      : { lastError: optionalString(row.last_error) }),
    ...(optionalNumber(row.observed_update_gap_ms) === undefined
      ? {}
      : { observedUpdateGapMs: optionalNumber(row.observed_update_gap_ms) }),
    ...(optionalNumber(row.lag_ms) === undefined
      ? {}
      : { lagMs: optionalNumber(row.lag_ms) }),
    updatedAtMs: requiredNumber(row.updated_at_ms, "updated_at_ms"),
  };
}

function toTradeEventSource(source: string): PredictNormalizedTradeEvent["source"] {
  if (source === "positions/redeemed") {
    return "positions/redeemed";
  }

  if (source === "trades/oracle") {
    return "trades/oracle";
  }

  return "positions/minted";
}

function requiredString(value: unknown, field: string): string {
  const result = optionalString(value);
  if (result === undefined) {
    throw new Error(`${field} is required.`);
  }

  return result;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function requiredNumber(value: unknown, field: string): number {
  const result = optionalNumber(value);
  if (result === undefined) {
    throw new Error(`${field} is required.`);
  }

  return result;
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function booleanValue(value: unknown): boolean {
  return value === true || value === "true" || value === "t" || value === 1 || value === "1";
}

function normalizeLimit(value: number): number {
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_MARKET_LIMIT;
}
