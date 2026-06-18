import { describe, expect, test } from "bun:test";
import {
  parsePredictPruneCliOptions,
  runDeepBookPredictPrune,
  type SqlExecutor,
} from "../src";

describe("DeepBook Predict expired series pruning", () => {
  test("parses safe dry-run defaults and explicit write options", () => {
    expect(parsePredictPruneCliOptions({ argv: [], env: {} })).toMatchObject({
      activePriceRawRetentionMs: 86_400_000,
      dryRun: true,
      batchOracleLimit: 100,
      maxBatches: 1,
      retentionMs: 0,
      includePriceCandles: true,
      includePrices: true,
      includeSvi: true,
      vacuum: false,
    });

    expect(
      parsePredictPruneCliOptions({
        argv: [
          "--write",
          "--batch-oracle-limit",
          "25",
          "--max-batches=9",
          "--retention-ms",
          "3600000",
          "--price-candle-raw-retention-ms",
          "43200000",
          "--skip-svi",
          "--skip-price-candles",
          "--vacuum",
        ],
        env: { DATABASE_URL: "postgres://example" },
      }),
    ).toMatchObject({
      activePriceRawRetentionMs: 43_200_000,
      databaseUrl: "postgres://example",
      dryRun: false,
      batchOracleLimit: 25,
      maxBatches: 9,
      retentionMs: 3_600_000,
      includePriceCandles: false,
      includePrices: true,
      includeSvi: false,
      vacuum: true,
    });
  });

  test("dry-run counts the next bounded oracle batch without deleting rows", async () => {
    const calls: SqlCall[] = [];
    const execute: SqlExecutor = async (statement, params = []) => {
      calls.push({ statement, params });
      return { rows: [{ row_count: statement.includes("predict_oracle_prices") ? 50 : 12 }] };
    };

    const summary = await runDeepBookPredictPrune({
      execute,
      nowMs: 1_800_000_000_000,
      batchOracleLimit: 25,
      dryRun: true,
      includePriceCandles: false,
    });

    expect(summary.prices).toMatchObject({
      candidateRows: 50,
      rowsDeleted: 0,
      stoppedBecause: "dry_run",
    });
    expect(summary.svi).toMatchObject({
      candidateRows: 12,
      rowsDeleted: 0,
      stoppedBecause: "dry_run",
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.statement).toContain("select count(*)::bigint as row_count");
    expect(calls[0]?.statement).toContain("from predict_oracle_prices");
    expect(calls[0]?.statement).not.toContain("delete from");
    expect(calls[0]?.params).toEqual([1_800_000_000_000, 25]);
  });

  test("write mode deletes only expired price and SVI series in separate batches", async () => {
    const calls: SqlCall[] = [];
    const priceCounts = [40, 30, 0];
    const sviCounts = [8, 0];
    const execute: SqlExecutor = async (statement, params = []) => {
      calls.push({ statement, params });
      if (statement.includes("delete from predict_oracle_prices")) {
        return { rowCount: priceCounts.shift() ?? 0 };
      }

      if (statement.includes("delete from predict_oracle_svi")) {
        return { rowCount: sviCounts.shift() ?? 0 };
      }

      return { rowCount: 0 };
    };

    const summary = await runDeepBookPredictPrune({
      execute,
      dryRun: false,
      nowMs: 1_800_000_000_000,
      batchOracleLimit: 100,
      maxBatches: 3,
      includePriceCandles: false,
    });

    expect(summary.prices).toMatchObject({
      batchesRun: 2,
      rowsDeleted: 70,
      stoppedBecause: "empty",
    });
    expect(summary.svi).toMatchObject({
      batchesRun: 1,
      rowsDeleted: 8,
      stoppedBecause: "empty",
    });
    expect(calls.map((call) => call.statement).join("\n")).not.toContain("predict_trade_events");
    expect(calls.map((call) => call.statement).join("\n")).not.toContain("predict_position_summaries");
    expect(calls.every((call) => call.params[0] === 1_800_000_000_000)).toBe(true);
  });

  test("write mode rolls active old raw prices into one-minute candles before deleting raw ticks", async () => {
    const calls: SqlCall[] = [];
    const execute: SqlExecutor = async (statement, params = []) => {
      calls.push({ statement, params });
      if (statement.includes("insert into predict_oracle_price_candles_1m")) {
        return { rowCount: 3 };
      }

      if (statement.includes("delete from predict_oracle_prices") && statement.includes("candle_buckets")) {
        return { rowCount: 180 };
      }

      return { rowCount: 0 };
    };

    const summary = await runDeepBookPredictPrune({
      activePriceRawRetentionMs: 86_400_000,
      dryRun: false,
      execute,
      includeSvi: false,
      nowMs: 1_800_000_000_000,
      retentionMs: 0,
    });

    expect(summary.priceCandles).toMatchObject({
      bucketMs: 60_000,
      rawCutoffMs: 1_799_913_600_000,
      rowsWritten: 3,
      rawRowsDeleted: 180,
      skipped: false,
    });
    expect(calls.map((call) => call.statement).join("\n")).toContain(
      "insert into predict_oracle_price_candles_1m",
    );
    expect(calls.map((call) => call.statement).join("\n")).not.toContain(
      "delete from predict_trade_events",
    );
    expect(calls.map((call) => call.statement).join("\n")).not.toContain(
      "delete from predict_position_summaries",
    );
  });

  test("optional vacuum analyzes pruned tables after write batches", async () => {
    const calls: SqlCall[] = [];
    const execute: SqlExecutor = async (statement, params = []) => {
      calls.push({ statement, params });
      if (statement.includes("delete from")) {
        return { rowCount: 1 };
      }

      return { rowCount: 0 };
    };

    const summary = await runDeepBookPredictPrune({
      execute,
      dryRun: false,
      maxBatches: 1,
      vacuum: true,
    });

    expect(summary.vacuumedTables).toEqual([
      "predict_oracle_prices",
      "predict_oracle_svi",
    ]);
    expect(calls.at(-2)?.statement).toBe("vacuum (analyze) predict_oracle_prices");
    expect(calls.at(-1)?.statement).toBe("vacuum (analyze) predict_oracle_svi");
  });
});

type SqlCall = {
  statement: string;
  params: readonly unknown[];
};
