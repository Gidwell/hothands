import type {
  PredictNormalizedTradeEvent,
  PredictOraclePricePoint,
  PredictOracleState,
  PredictOracleSviPoint,
} from "./deepbook-predict";
import type { PredictIndexerWriter, PredictPositionSummary } from "./store";

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
  };
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
