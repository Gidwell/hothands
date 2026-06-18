#!/usr/bin/env bun
import { createPostgresSqlClient } from "./postgres-client";
import type { SqlExecutor } from "./postgres-store";

declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exitCode?: number;
  stdout: { write: (text: string) => void };
  stderr: { write: (text: string) => void };
};

export type PredictPruneCliOptions = {
  activePriceRawRetentionMs: number;
  databaseUrl?: string;
  dryRun: boolean;
  batchOracleLimit: number;
  maxBatches: number;
  retentionMs: number;
  includePriceCandles: boolean;
  includePrices: boolean;
  includeSvi: boolean;
  vacuum: boolean;
};

export type PredictPruneSeriesSummary = {
  tableName: "predict_oracle_prices" | "predict_oracle_svi";
  batchOracleLimit: number;
  batchesRun: number;
  candidateRows: number;
  rowsDeleted: number;
  stoppedBecause: "dry_run" | "empty" | "max_batches" | "skipped";
};

export type PredictPruneSummary = {
  dryRun: boolean;
  cutoffMs: number;
  priceCandles: PredictPrunePriceCandleSummary;
  prices: PredictPruneSeriesSummary;
  svi: PredictPruneSeriesSummary;
  vacuumedTables: string[];
};

export type PredictPrunePriceCandleSummary = {
  tableName: "predict_oracle_price_candles_1m";
  bucketMs: number;
  candidateRawRows: number;
  rawCutoffMs: number;
  rawRowsDeleted: number;
  rowsWritten: number;
  skipped: boolean;
};

type ParsedArgs = {
  flags: Set<string>;
  values: Map<string, string[]>;
};

const DEFAULT_BATCH_ORACLE_LIMIT = 100;
const DEFAULT_MAX_BATCHES = 1;
const PRICE_CANDLE_BUCKET_MS = 60_000;
const DEFAULT_ACTIVE_PRICE_RAW_RETENTION_MS = 24 * 60 * 60_000;

export function parsePredictPruneCliOptions({
  argv,
  env,
}: {
  argv: readonly string[];
  env: Record<string, string | undefined>;
}): PredictPruneCliOptions {
  const parsed = parseArgs(argv);
  const dryRun =
    parsed.flags.has("dry-run") ||
    env.HOT_HANDS_INDEXER_PRUNE_DRY_RUN === "true" ||
    !(parsed.flags.has("write") || env.HOT_HANDS_INDEXER_PRUNE_WRITE === "true");

  return {
    activePriceRawRetentionMs: nonNegativeInt(
      lastValue(parsed, "price-candle-raw-retention-ms") ??
        env.HOT_HANDS_INDEXER_PRICE_CANDLE_RAW_RETENTION_MS,
      DEFAULT_ACTIVE_PRICE_RAW_RETENTION_MS,
    ),
    databaseUrl: env.DATABASE_URL,
    dryRun,
    batchOracleLimit: positiveInt(
      lastValue(parsed, "batch-oracle-limit") ??
        env.HOT_HANDS_INDEXER_PRUNE_BATCH_ORACLE_LIMIT,
      DEFAULT_BATCH_ORACLE_LIMIT,
    ),
    maxBatches: positiveInt(
      lastValue(parsed, "max-batches") ?? env.HOT_HANDS_INDEXER_PRUNE_MAX_BATCHES,
      DEFAULT_MAX_BATCHES,
    ),
    retentionMs: nonNegativeInt(
      lastValue(parsed, "retention-ms") ?? env.HOT_HANDS_INDEXER_PRUNE_RETENTION_MS,
      0,
    ),
    includePriceCandles:
      !parsed.flags.has("skip-price-candles") &&
      env.HOT_HANDS_INDEXER_PRICE_CANDLES !== "false",
    includePrices:
      !parsed.flags.has("skip-prices") &&
      env.HOT_HANDS_INDEXER_PRUNE_SKIP_PRICES !== "true",
    includeSvi:
      !parsed.flags.has("skip-svi") &&
      env.HOT_HANDS_INDEXER_PRUNE_SKIP_SVI !== "true",
    vacuum:
      parsed.flags.has("vacuum") || env.HOT_HANDS_INDEXER_PRUNE_VACUUM === "true",
  };
}

export async function runDeepBookPredictPrune({
  execute,
  dryRun = true,
  batchOracleLimit = DEFAULT_BATCH_ORACLE_LIMIT,
  maxBatches = DEFAULT_MAX_BATCHES,
  nowMs = Date.now(),
  retentionMs = 0,
  activePriceRawRetentionMs = DEFAULT_ACTIVE_PRICE_RAW_RETENTION_MS,
  includePriceCandles = true,
  includePrices = true,
  includeSvi = true,
  vacuum = false,
}: {
  execute: SqlExecutor;
  dryRun?: boolean;
  batchOracleLimit?: number;
  maxBatches?: number;
  nowMs?: number;
  retentionMs?: number;
  activePriceRawRetentionMs?: number;
  includePriceCandles?: boolean;
  includePrices?: boolean;
  includeSvi?: boolean;
  vacuum?: boolean;
}): Promise<PredictPruneSummary> {
  const cutoffMs = nowMs - retentionMs;
  const prices = includePrices
    ? await pruneSeries({
        execute,
        tableName: "predict_oracle_prices",
        tableAlias: "p",
        cutoffMs,
        batchOracleLimit,
        maxBatches,
        dryRun,
      })
    : skippedSeries("predict_oracle_prices", batchOracleLimit);
  const svi = includeSvi
    ? await pruneSeries({
        execute,
        tableName: "predict_oracle_svi",
        tableAlias: "s",
        cutoffMs,
        batchOracleLimit,
        maxBatches,
        dryRun,
      })
    : skippedSeries("predict_oracle_svi", batchOracleLimit);
  const priceCandles = includePriceCandles
    ? await rollupAndPruneActivePriceCandles({
        execute,
        nowMs,
        rawRetentionMs: activePriceRawRetentionMs,
        dryRun,
      })
    : skippedPriceCandles(nowMs, activePriceRawRetentionMs);

  const vacuumedTables: string[] = [];
  if (vacuum && !dryRun && prices.rowsDeleted > 0) {
    await execute("vacuum (analyze) predict_oracle_prices", []);
    vacuumedTables.push("predict_oracle_prices");
  }

  if (vacuum && !dryRun && svi.rowsDeleted > 0) {
    await execute("vacuum (analyze) predict_oracle_svi", []);
    vacuumedTables.push("predict_oracle_svi");
  }

  return {
    dryRun,
    cutoffMs,
    priceCandles,
    prices,
    svi,
    vacuumedTables,
  };
}

async function rollupAndPruneActivePriceCandles({
  execute,
  nowMs,
  rawRetentionMs,
  dryRun,
}: {
  execute: SqlExecutor;
  nowMs: number;
  rawRetentionMs: number;
  dryRun: boolean;
}): Promise<PredictPrunePriceCandleSummary> {
  const rawCutoffMs = Math.floor((nowMs - rawRetentionMs) / PRICE_CANDLE_BUCKET_MS) *
    PRICE_CANDLE_BUCKET_MS;

  if (rawCutoffMs <= 0) {
    return {
      ...skippedPriceCandles(nowMs, rawRetentionMs),
      rawCutoffMs,
    };
  }

  if (dryRun) {
    const result = await execute(buildCountActiveRawPriceRowsForCandlesSql(), [rawCutoffMs, nowMs]);

    return {
      tableName: "predict_oracle_price_candles_1m",
      bucketMs: PRICE_CANDLE_BUCKET_MS,
      candidateRawRows: readCount(result),
      rawCutoffMs,
      rawRowsDeleted: 0,
      rowsWritten: 0,
      skipped: false,
    };
  }

  const rowsWritten = rowsAffected(
    await execute(buildUpsertActivePriceCandlesSql(), [rawCutoffMs, nowMs]),
  );
  const rawRowsDeleted = rowsAffected(
    await execute(buildDeleteRolledActiveRawPricesSql(), [rawCutoffMs, nowMs]),
  );

  return {
    tableName: "predict_oracle_price_candles_1m",
    bucketMs: PRICE_CANDLE_BUCKET_MS,
    candidateRawRows: 0,
    rawCutoffMs,
    rawRowsDeleted,
    rowsWritten,
    skipped: false,
  };
}

async function pruneSeries({
  execute,
  tableName,
  tableAlias,
  cutoffMs,
  batchOracleLimit,
  maxBatches,
  dryRun,
}: {
  execute: SqlExecutor;
  tableName: "predict_oracle_prices" | "predict_oracle_svi";
  tableAlias: "p" | "s";
  cutoffMs: number;
  batchOracleLimit: number;
  maxBatches: number;
  dryRun: boolean;
}): Promise<PredictPruneSeriesSummary> {
  if (dryRun) {
    const result = await execute(
      buildCountExpiredOracleBatchRowsSql({ tableName, tableAlias }),
      [cutoffMs, batchOracleLimit],
    );

    return {
      tableName,
      batchOracleLimit,
      batchesRun: 0,
      candidateRows: readCount(result),
      rowsDeleted: 0,
      stoppedBecause: "dry_run",
    };
  }

  let batchesRun = 0;
  let rowsDeleted = 0;

  while (batchesRun < maxBatches) {
    const result = await execute(
      buildDeleteExpiredOracleBatchSql({ tableName, tableAlias }),
      [cutoffMs, batchOracleLimit],
    );
    const deletedThisBatch = rowsAffected(result);

    if (deletedThisBatch === 0) {
      return {
        tableName,
        batchOracleLimit,
        batchesRun,
        candidateRows: 0,
        rowsDeleted,
        stoppedBecause: "empty",
      };
    }

    rowsDeleted += deletedThisBatch;
    batchesRun += 1;
  }

  return {
    tableName,
    batchOracleLimit,
    batchesRun,
    candidateRows: 0,
    rowsDeleted,
    stoppedBecause: "max_batches",
  };
}

function buildCountExpiredOracleBatchRowsSql({
  tableName,
  tableAlias,
}: {
  tableName: "predict_oracle_prices" | "predict_oracle_svi";
  tableAlias: "p" | "s";
}): string {
  return [
    "with expired_oracles as (",
    "  select o.oracle_id",
    "  from predict_oracles o",
    "  where o.expiry_ms <= $1",
    `    and exists (select 1 from ${tableName} ${tableAlias} where ${tableAlias}.oracle_id = o.oracle_id)`,
    "  limit $2",
    ")",
    "select count(*)::bigint as row_count",
    `from ${tableName} ${tableAlias}`,
    `join expired_oracles o on o.oracle_id = ${tableAlias}.oracle_id`,
  ].join("\n");
}

function buildDeleteExpiredOracleBatchSql({
  tableName,
  tableAlias,
}: {
  tableName: "predict_oracle_prices" | "predict_oracle_svi";
  tableAlias: "p" | "s";
}): string {
  return [
    "with expired_oracles as (",
    "  select o.oracle_id",
    "  from predict_oracles o",
    "  where o.expiry_ms <= $1",
    `    and exists (select 1 from ${tableName} ${tableAlias} where ${tableAlias}.oracle_id = o.oracle_id)`,
    "  limit $2",
    ")",
    `delete from ${tableName} ${tableAlias}`,
    "using expired_oracles o",
    `where ${tableAlias}.oracle_id = o.oracle_id`,
  ].join("\n");
}

function buildCountActiveRawPriceRowsForCandlesSql(): string {
  return [
    "select count(*)::bigint as row_count",
    "from predict_oracle_prices p",
    "join predict_oracles o on o.oracle_id = p.oracle_id",
    "where o.expiry_ms > $2",
    "  and p.timestamp_ms < $1",
  ].join("\n");
}

function buildUpsertActivePriceCandlesSql(): string {
  return [
    "with raw_points as (",
    "  select",
    "    p.oracle_id,",
    `    floor(p.timestamp_ms / ${PRICE_CANDLE_BUCKET_MS})::bigint * ${PRICE_CANDLE_BUCKET_MS} as bucket_ms,`,
    "    p.spot,",
    "    p.forward,",
    "    p.checkpoint,",
    "    p.timestamp_ms",
    "  from predict_oracle_prices p",
    "  join predict_oracles o on o.oracle_id = p.oracle_id",
    "  where o.expiry_ms > $2",
    "    and p.timestamp_ms < $1",
    "), ranked as (",
    "  select",
    "    oracle_id,",
    "    bucket_ms,",
    "    first_value(spot) over bucket_asc as open,",
    "    max(spot) over bucket_partition as high,",
    "    min(spot) over bucket_partition as low,",
    "    first_value(spot) over bucket_desc as close,",
    "    first_value(forward) over bucket_asc as forward_open,",
    "    max(forward) over bucket_partition as forward_high,",
    "    min(forward) over bucket_partition as forward_low,",
    "    first_value(forward) over bucket_desc as forward_close,",
    "    count(*) over bucket_partition as sample_count,",
    "    min(timestamp_ms) over bucket_partition as first_timestamp_ms,",
    "    max(timestamp_ms) over bucket_partition as last_timestamp_ms,",
    "    first_value(checkpoint) over bucket_asc as first_checkpoint,",
    "    first_value(checkpoint) over bucket_desc as last_checkpoint,",
    "    row_number() over bucket_asc as row_number",
    "  from raw_points",
    "  window",
    "    bucket_partition as (partition by oracle_id, bucket_ms),",
    "    bucket_asc as (partition by oracle_id, bucket_ms order by timestamp_ms asc),",
    "    bucket_desc as (partition by oracle_id, bucket_ms order by timestamp_ms desc)",
    ")",
    "insert into predict_oracle_price_candles_1m (",
    "  oracle_id, bucket_ms, open, high, low, close,",
    "  forward_open, forward_high, forward_low, forward_close,",
    "  sample_count, first_timestamp_ms, last_timestamp_ms, first_checkpoint, last_checkpoint, source",
    ")",
    "select",
    "  oracle_id, bucket_ms, open, high, low, close,",
    "  forward_open, forward_high, forward_low, forward_close,",
    "  sample_count, first_timestamp_ms, last_timestamp_ms, first_checkpoint, last_checkpoint,",
    "  'oracles/prices/candle_1m'",
    "from ranked",
    "where row_number = 1",
    "on conflict (oracle_id, bucket_ms) do update set",
    "  open = excluded.open,",
    "  high = excluded.high,",
    "  low = excluded.low,",
    "  close = excluded.close,",
    "  forward_open = excluded.forward_open,",
    "  forward_high = excluded.forward_high,",
    "  forward_low = excluded.forward_low,",
    "  forward_close = excluded.forward_close,",
    "  sample_count = excluded.sample_count,",
    "  first_timestamp_ms = excluded.first_timestamp_ms,",
    "  last_timestamp_ms = excluded.last_timestamp_ms,",
    "  first_checkpoint = excluded.first_checkpoint,",
    "  last_checkpoint = excluded.last_checkpoint,",
    "  source = excluded.source,",
    "  updated_at = now()",
  ].join("\n");
}

function buildDeleteRolledActiveRawPricesSql(): string {
  return [
    "with candle_buckets as (",
    "  select c.oracle_id, c.bucket_ms",
    "  from predict_oracle_price_candles_1m c",
    "  join predict_oracles o on o.oracle_id = c.oracle_id",
    "  where o.expiry_ms > $2",
    "    and c.bucket_ms < $1",
    ")",
    "delete from predict_oracle_prices p",
    "using candle_buckets c",
    "where p.oracle_id = c.oracle_id",
    `  and floor(p.timestamp_ms / ${PRICE_CANDLE_BUCKET_MS})::bigint * ${PRICE_CANDLE_BUCKET_MS} = c.bucket_ms`,
    "  and p.timestamp_ms < $1",
  ].join("\n");
}

function skippedSeries(
  tableName: "predict_oracle_prices" | "predict_oracle_svi",
  batchOracleLimit: number,
): PredictPruneSeriesSummary {
  return {
    tableName,
    batchOracleLimit,
    batchesRun: 0,
    candidateRows: 0,
    rowsDeleted: 0,
    stoppedBecause: "skipped",
  };
}

function skippedPriceCandles(
  nowMs: number,
  rawRetentionMs: number,
): PredictPrunePriceCandleSummary {
  return {
    tableName: "predict_oracle_price_candles_1m",
    bucketMs: PRICE_CANDLE_BUCKET_MS,
    candidateRawRows: 0,
    rawCutoffMs: Math.floor((nowMs - rawRetentionMs) / PRICE_CANDLE_BUCKET_MS) *
      PRICE_CANDLE_BUCKET_MS,
    rawRowsDeleted: 0,
    rowsWritten: 0,
    skipped: true,
  };
}

function rowsAffected(result: Awaited<ReturnType<SqlExecutor>>): number {
  if (isRowArray(result)) {
    return result.length;
  }

  return result.rowCount ?? result.rows?.length ?? 0;
}

function readCount(result: Awaited<ReturnType<SqlExecutor>>): number {
  const rows = isRowArray(result) ? result : result.rows ?? [];
  const row = rows[0] as Record<string, unknown> | undefined;

  return Number(row?.row_count ?? row?.count ?? 0);
}

function isRowArray(
  result: Awaited<ReturnType<SqlExecutor>>,
): result is readonly unknown[] {
  return Array.isArray(result);
}

async function main() {
  const cli = parsePredictPruneCliOptions({
    argv: process.argv.slice(2),
    env: process.env,
  });

  if (!cli.databaseUrl) {
    throw new Error("DATABASE_URL is required for Predict pruning.");
  }

  if (!cli.dryRun && !cli.includePrices && !cli.includeSvi && !cli.includePriceCandles) {
    throw new Error("At least one prune target must be enabled.");
  }

  const client = createPostgresSqlClient({ databaseUrl: cli.databaseUrl });

  try {
    const summary = await runDeepBookPredictPrune({
      execute: client.execute,
      dryRun: cli.dryRun,
      activePriceRawRetentionMs: cli.activePriceRawRetentionMs,
      batchOracleLimit: cli.batchOracleLimit,
      maxBatches: cli.maxBatches,
      retentionMs: cli.retentionMs,
      includePriceCandles: cli.includePriceCandles,
      includePrices: cli.includePrices,
      includeSvi: cli.includeSvi,
      vacuum: cli.vacuum,
    });

    process.stdout.write(formatPredictPruneSummary(summary));
  } finally {
    await client.close();
  }
}

function formatPredictPruneSummary(summary: PredictPruneSummary): string {
  const mode = summary.dryRun ? "dry-run" : "write";

  return [
    "DeepBook Predict prune complete.",
    `Mode: ${mode}`,
    `Cutoff: ${new Date(summary.cutoffMs).toISOString()} (${summary.cutoffMs})`,
    formatPriceCandleSummary(summary.priceCandles),
    formatSeriesSummary(summary.prices),
    formatSeriesSummary(summary.svi),
    `Vacuumed: ${summary.vacuumedTables.length === 0 ? "none" : summary.vacuumedTables.join(", ")}`,
    "",
  ].join("\n");
}

function formatPriceCandleSummary(summary: PredictPrunePriceCandleSummary): string {
  return [
    `${summary.tableName}:`,
    `  skipped: ${summary.skipped}`,
    `  raw cutoff: ${new Date(summary.rawCutoffMs).toISOString()} (${summary.rawCutoffMs})`,
    `  bucket ms: ${summary.bucketMs}`,
    `  candidate raw rows: ${summary.candidateRawRows}`,
    `  candle rows written: ${summary.rowsWritten}`,
    `  raw rows deleted: ${summary.rawRowsDeleted}`,
  ].join("\n");
}

function formatSeriesSummary(summary: PredictPruneSeriesSummary): string {
  return [
    `${summary.tableName}:`,
    `  batch oracle limit: ${summary.batchOracleLimit}`,
    `  candidate rows: ${summary.candidateRows}`,
    `  rows deleted: ${summary.rowsDeleted}`,
    `  batches run: ${summary.batchesRun}`,
    `  stopped: ${summary.stoppedBecause}`,
  ].join("\n");
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const flags = new Set<string>();
  const values = new Map<string, string[]>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      continue;
    }

    const withoutPrefix = arg.slice(2);
    const [name, inlineValue] = withoutPrefix.split("=", 2);
    if (inlineValue !== undefined) {
      appendValue(values, name, inlineValue);
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      appendValue(values, name, next);
      index += 1;
      continue;
    }

    flags.add(name);
  }

  return { flags, values };
}

function appendValue(values: Map<string, string[]>, name: string, value: string) {
  values.set(name, [...(values.get(name) ?? []), value]);
}

function lastValue(parsed: ParsedArgs, name: string): string | undefined {
  const values = parsed.values.get(name);
  return values?.[values.length - 1];
}

function positiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

if ((import.meta as { main?: boolean }).main) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
