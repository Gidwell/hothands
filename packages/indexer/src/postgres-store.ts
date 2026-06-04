import type {
  PredictNormalizedTradeEvent,
  PredictOraclePricePoint,
  PredictOracleState,
  PredictOracleSviPoint,
} from "./deepbook-predict";
import type {
  PredictIndexerJobStatus,
  PredictIndexerWriter,
  PredictPositionSummary,
} from "./store";

export type SqlValue = string | number | boolean | null;

export type SqlExecutionResult =
  | { rows?: readonly unknown[]; rowCount?: number | null }
  | readonly unknown[];

export type SqlExecutor = (
  statement: string,
  params?: readonly SqlValue[],
) => Promise<SqlExecutionResult>;

export type PostgresPredictIndexerStoreOptions = {
  execute: SqlExecutor;
};

type SqlColumn<T> = {
  name: string;
  value: (row: T) => SqlValue;
  cast?: string;
};

const POSTGRES_PARAMETER_BUDGET = 60_000;

export function createPostgresPredictIndexerStore({
  execute,
}: PostgresPredictIndexerStoreOptions): PredictIndexerWriter {
  return {
    upsertOracles: (oracles) =>
      upsertRows({
        execute,
        table: "predict_oracles",
        conflictColumns: ["oracle_id"],
        columns: oracleColumns,
        touchColumn: "indexed_at",
        rows: oracles,
      }),
    upsertTradeEvents: (events) =>
      upsertRows({
        execute,
        table: "predict_trade_events",
        conflictColumns: ["event_id"],
        columns: tradeEventColumns,
        touchColumn: "indexed_at",
        rows: events,
      }),
    upsertOraclePrices: (points) =>
      upsertRows({
        execute,
        table: "predict_oracle_prices",
        conflictColumns: ["event_id"],
        columns: priceColumns,
        touchColumn: "indexed_at",
        rows: points,
      }),
    upsertOracleSvi: (points) =>
      upsertRows({
        execute,
        table: "predict_oracle_svi",
        conflictColumns: ["event_id"],
        columns: sviColumns,
        touchColumn: "indexed_at",
        rows: points,
      }),
    upsertPositionSummaries: (summaries) =>
      upsertRows({
        execute,
        table: "predict_position_summaries",
        conflictColumns: ["position_id"],
        columns: positionSummaryColumns,
        touchColumn: "materialized_at",
        rows: summaries,
      }),
    upsertIndexerJobStatus: (status) => upsertIndexerJobStatus(execute, status),
    refreshPositionSummaries: () => refreshPositionSummaries(execute),
  };
}

async function upsertIndexerJobStatus(
  execute: SqlExecutor,
  status: PredictIndexerJobStatus,
): Promise<number> {
  const columns = indexerJobStatusColumns;
  const params = columns.map((column) => column.value(status));
  const updateSql = columns
    .filter((column) => column.name !== "job_name")
    .map((column) => `${column.name} = excluded.${column.name}`)
    .join(", ");
  const statement = [
    `insert into predict_indexer_jobs (${columns.map((column) => column.name).join(", ")})`,
    `values (${columns.map((column, index) => `$${index + 1}${column.cast ? `::${column.cast}` : ""}`).join(", ")})`,
    `on conflict (job_name) do update set ${updateSql}`,
    "returning 1",
  ].join("\n");

  return rowsAffected(await execute(statement, params));
}

async function refreshPositionSummaries(execute: SqlExecutor): Promise<number> {
  const statement = [
    "insert into predict_position_summaries (",
    "  position_id, owner, manager_id, oracle_id, expiry_ms, strike, is_up,",
    "  minted_quantity, redeemed_quantity, open_quantity, cost, payout,",
    "  realized_pnl, status, last_event_ms",
    ")",
    "select",
    "  manager_id || ':' || oracle_id || ':' || expiry_ms || ':' || strike || ':' || case when is_up then 'UP' else 'DOWN' end as position_id,",
    "  (array_agg(coalesce(trader, actor) order by timestamp_ms desc, event_id desc))[1] as owner,",
    "  manager_id,",
    "  oracle_id,",
    "  expiry_ms,",
    "  strike,",
    "  is_up,",
    "  coalesce(sum(case when kind = 'mint' then quantity else 0 end), 0) as minted_quantity,",
    "  coalesce(sum(case when kind = 'redeem' then quantity else 0 end), 0) as redeemed_quantity,",
    "  greatest(",
    "    coalesce(sum(case when kind = 'mint' then quantity else 0 end), 0) -",
    "    coalesce(sum(case when kind = 'redeem' then quantity else 0 end), 0),",
    "    0",
    "  ) as open_quantity,",
    "  coalesce(sum(case when kind = 'mint' then coalesce(cost, 0) else 0 end), 0) as cost,",
    "  coalesce(sum(case when kind = 'redeem' then coalesce(payout, 0) else 0 end), 0) as payout,",
    "  coalesce(sum(case when kind = 'redeem' then coalesce(payout, 0) else 0 end), 0) -",
    "    coalesce(sum(case when kind = 'mint' then coalesce(cost, 0) else 0 end), 0) as realized_pnl,",
    "  case when",
    "    greatest(",
    "      coalesce(sum(case when kind = 'mint' then quantity else 0 end), 0) -",
    "      coalesce(sum(case when kind = 'redeem' then quantity else 0 end), 0),",
    "      0",
    "    ) > 0 then 'open' else 'closed' end as status,",
    "  max(timestamp_ms) as last_event_ms",
    "from predict_trade_events",
    "group by manager_id, oracle_id, expiry_ms, strike, is_up",
    "on conflict (position_id) do update set",
    "  owner = excluded.owner,",
    "  manager_id = excluded.manager_id,",
    "  oracle_id = excluded.oracle_id,",
    "  expiry_ms = excluded.expiry_ms,",
    "  strike = excluded.strike,",
    "  is_up = excluded.is_up,",
    "  minted_quantity = excluded.minted_quantity,",
    "  redeemed_quantity = excluded.redeemed_quantity,",
    "  open_quantity = excluded.open_quantity,",
    "  cost = excluded.cost,",
    "  payout = excluded.payout,",
    "  realized_pnl = excluded.realized_pnl,",
    "  status = excluded.status,",
    "  last_event_ms = excluded.last_event_ms,",
    "  materialized_at = now()",
    "returning 1",
  ].join("\n");

  return rowsAffected(await execute(statement, []));
}

async function upsertRows<T>({
  execute,
  table,
  conflictColumns,
  columns,
  touchColumn,
  rows,
}: {
  execute: SqlExecutor;
  table: string;
  conflictColumns: readonly string[];
  columns: readonly SqlColumn<T>[];
  touchColumn?: string;
  rows: readonly T[];
}): Promise<number> {
  if (rows.length === 0) {
    return 0;
  }

  const uniqueRows = dedupeRowsByConflictKey(rows, columns, conflictColumns);
  const maxRowsPerBatch = Math.max(
    1,
    Math.floor(POSTGRES_PARAMETER_BUDGET / columns.length),
  );
  let affectedRows = 0;

  for (let index = 0; index < uniqueRows.length; index += maxRowsPerBatch) {
    affectedRows += await upsertRowBatch({
      execute,
      table,
      conflictColumns,
      columns,
      touchColumn,
      rows: uniqueRows.slice(index, index + maxRowsPerBatch),
    });
  }

  return affectedRows;
}

async function upsertRowBatch<T>({
  execute,
  table,
  conflictColumns,
  columns,
  touchColumn,
  rows,
}: {
  execute: SqlExecutor;
  table: string;
  conflictColumns: readonly string[];
  columns: readonly SqlColumn<T>[];
  touchColumn?: string;
  rows: readonly T[];
}): Promise<number> {
  const params: SqlValue[] = [];
  const valuesSql = rows.map((row) => {
    const placeholders = columns.map((column) => {
      params.push(column.value(row));
      const placeholder = `$${params.length}`;
      return column.cast ? `${placeholder}::${column.cast}` : placeholder;
    });

    return `(${placeholders.join(", ")})`;
  });
  const updateSql = columns
    .filter((column) => !conflictColumns.includes(column.name))
    .map((column) => `${column.name} = excluded.${column.name}`)
    .concat(touchColumn ? [`${touchColumn} = now()`] : [])
    .join(", ");
  const statement = [
    `insert into ${table} (${columns.map((column) => column.name).join(", ")})`,
    `values ${valuesSql.join(", ")}`,
    `on conflict (${conflictColumns.join(", ")}) do update set ${updateSql}`,
    "returning 1",
  ].join("\n");
  const result = await execute(statement, params);

  return rowsAffected(result);
}

function dedupeRowsByConflictKey<T>(
  rows: readonly T[],
  columns: readonly SqlColumn<T>[],
  conflictColumns: readonly string[],
): readonly T[] {
  const keyColumns = conflictColumns.map((name) => {
    const column = columns.find((candidate) => candidate.name === name);
    if (!column) {
      throw new Error(`Conflict column ${name} is not present in upsert columns.`);
    }

    return column;
  });
  const rowsByKey = new Map<string, T>();

  for (const row of rows) {
    rowsByKey.set(
      JSON.stringify(keyColumns.map((column) => column.value(row))),
      row,
    );
  }

  return [...rowsByKey.values()];
}

const oracleColumns: readonly SqlColumn<PredictOracleState>[] = [
  { name: "oracle_id", value: (oracle) => oracle.oracle_id },
  { name: "predict_id", value: (oracle) => oracle.predict_id },
  { name: "oracle_cap_id", value: () => null },
  { name: "underlying_asset", value: (oracle) => oracle.underlying_asset },
  { name: "expiry_ms", value: (oracle) => toEpochMs(oracle.expiry) },
  { name: "min_strike", value: (oracle) => oracle.min_strike },
  { name: "tick_size", value: (oracle) => oracle.tick_size },
  { name: "status", value: (oracle) => oracle.status },
  { name: "activated_at_ms", value: (oracle) => optionalEpochMs(oracle.activated_at) },
  { name: "settlement_price", value: (oracle) => optionalNumber(oracle.settlement_price) },
  { name: "settled_at_ms", value: (oracle) => optionalEpochMs(oracle.settled_at) },
  { name: "created_checkpoint", value: (oracle) => optionalNumber(oracle.created_checkpoint) },
  { name: "raw", value: (oracle) => toJson(oracle), cast: "jsonb" },
];

const tradeEventColumns: readonly SqlColumn<PredictNormalizedTradeEvent>[] = [
  { name: "event_id", value: (event) => event.eventId },
  { name: "kind", value: (event) => event.kind },
  { name: "actor", value: (event) => event.actor },
  { name: "trader", value: (event) => event.trader ?? null },
  { name: "manager_id", value: (event) => event.managerId },
  { name: "oracle_id", value: (event) => event.oracleId },
  { name: "expiry_ms", value: (event) => event.expiryMs },
  { name: "strike", value: (event) => event.strike },
  { name: "is_up", value: (event) => event.isUp },
  { name: "quantity", value: (event) => event.quantity },
  { name: "cost", value: (event) => optionalNumber(event.cost) },
  { name: "payout", value: (event) => optionalNumber(event.payout) },
  { name: "transaction_digest", value: (event) => event.transactionDigest ?? null },
  { name: "checkpoint", value: (event) => optionalNumber(event.checkpoint) },
  { name: "timestamp_ms", value: (event) => event.timestampMs },
  { name: "source", value: (event) => event.source },
  { name: "raw", value: (event) => toJson(event), cast: "jsonb" },
];

const priceColumns: readonly SqlColumn<PredictOraclePricePoint>[] = [
  { name: "event_id", value: priceEventId },
  { name: "oracle_id", value: (point) => point.oracleId },
  { name: "spot", value: (point) => point.spot },
  { name: "forward", value: (point) => optionalNumber(point.forward) },
  { name: "checkpoint", value: (point) => optionalNumber(point.checkpoint) },
  { name: "timestamp_ms", value: (point) => point.timestampMs },
  { name: "source", value: (point) => point.source },
  { name: "raw", value: (point) => toJson(point), cast: "jsonb" },
];

const sviColumns: readonly SqlColumn<PredictOracleSviPoint>[] = [
  { name: "event_id", value: (point) => point.eventId },
  { name: "oracle_id", value: (point) => point.oracleId },
  { name: "a", value: (point) => point.a },
  { name: "b", value: (point) => point.b },
  { name: "rho", value: (point) => point.rho },
  { name: "rho_negative", value: (point) => point.rhoNegative },
  { name: "m", value: (point) => point.m },
  { name: "m_negative", value: (point) => point.mNegative },
  { name: "sigma", value: (point) => point.sigma },
  { name: "checkpoint", value: (point) => optionalNumber(point.checkpoint) },
  { name: "timestamp_ms", value: (point) => point.timestampMs },
  { name: "source", value: (point) => point.source },
  { name: "raw", value: (point) => toJson(point), cast: "jsonb" },
];

const positionSummaryColumns: readonly SqlColumn<PredictPositionSummary>[] = [
  { name: "position_id", value: (summary) => summary.id },
  { name: "owner", value: (summary) => summary.owner },
  { name: "manager_id", value: (summary) => summary.managerId },
  { name: "oracle_id", value: (summary) => summary.oracleId },
  { name: "expiry_ms", value: (summary) => summary.expiryMs },
  { name: "strike", value: (summary) => summary.strike },
  { name: "is_up", value: (summary) => summary.isUp },
  { name: "minted_quantity", value: (summary) => summary.mintedQuantity },
  { name: "redeemed_quantity", value: (summary) => summary.redeemedQuantity },
  { name: "open_quantity", value: (summary) => summary.openQuantity },
  { name: "cost", value: (summary) => summary.cost },
  { name: "payout", value: (summary) => summary.payout },
  { name: "realized_pnl", value: (summary) => summary.realizedPnl },
  { name: "status", value: (summary) => summary.status },
  { name: "last_event_ms", value: (summary) => summary.lastEventMs },
];

const indexerJobStatusColumns: readonly SqlColumn<PredictIndexerJobStatus>[] = [
  { name: "job_name", value: (status) => status.jobName },
  { name: "source", value: (status) => status.source },
  { name: "poll_interval_ms", value: (status) => status.pollIntervalMs },
  { name: "status", value: (status) => status.status },
  { name: "last_poll_started_at_ms", value: (status) => status.lastPollStartedAtMs },
  { name: "last_poll_completed_at_ms", value: (status) => optionalNumber(status.lastPollCompletedAtMs) },
  { name: "last_success_at_ms", value: (status) => optionalNumber(status.lastSuccessAtMs) },
  { name: "last_new_data_at_ms", value: (status) => optionalNumber(status.lastNewDataAtMs) },
  { name: "last_source_timestamp_ms", value: (status) => optionalNumber(status.lastSourceTimestampMs) },
  { name: "last_checkpoint", value: (status) => optionalNumber(status.lastCheckpoint) },
  { name: "rows_fetched", value: (status) => status.rowsFetched },
  { name: "rows_written", value: (status) => status.rowsWritten },
  { name: "total_rows_written", value: (status) => status.totalRowsWritten },
  { name: "consecutive_error_count", value: (status) => status.consecutiveErrorCount },
  { name: "last_error", value: (status) => status.lastError ?? null },
  { name: "observed_update_gap_ms", value: (status) => optionalNumber(status.observedUpdateGapMs) },
  { name: "lag_ms", value: (status) => optionalNumber(status.lagMs) },
  { name: "updated_at_ms", value: (status) => status.updatedAtMs },
];

function priceEventId(point: PredictOraclePricePoint): string {
  return [
    "price",
    point.oracleId,
    point.eventId ?? [
      point.checkpoint ?? "no-checkpoint",
      point.timestampMs,
      point.spot,
      point.forward ?? "no-forward",
    ].join(":"),
  ].join(":");
}

function rowsAffected(result: SqlExecutionResult): number {
  if (isRowArray(result)) {
    return result.length;
  }

  if (typeof result.rowCount === "number") {
    return result.rowCount;
  }

  return result.rows?.length ?? 0;
}

function isRowArray(result: SqlExecutionResult): result is readonly unknown[] {
  return Array.isArray(result);
}

function optionalNumber(value: number | undefined): number | null {
  return value === undefined ? null : value;
}

function optionalEpochMs(value: number | undefined): number | null {
  return value === undefined ? null : toEpochMs(value);
}

function toEpochMs(value: number): number {
  return value < 10_000_000_000 ? value * 1_000 : value;
}

function toJson(value: unknown): string {
  return JSON.stringify(value);
}
