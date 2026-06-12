#!/usr/bin/env bun
import { parsePredictCanaryConfig } from "./deepbook-predict";
import { runDeepBookPredictBackfill } from "./backfill";
import {
  parseLiveIndexerCliOptions,
  runDeepBookPredictLiveIndexerOnce,
  startDeepBookPredictLiveIndexer,
  type DeepBookPredictLiveIndexerJobSummary,
} from "./live-indexer";
import { createPostgresSqlClient } from "./postgres-client";
import { createPostgresPredictIndexerReader } from "./postgres-reader";
import { createPostgresPredictIndexerStore } from "./postgres-store";

declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exit: (code?: number) => never;
  exitCode?: number;
  on: (event: "SIGINT" | "SIGTERM", listener: () => void) => void;
  stderr: { write: (text: string) => void };
  stdout: { write: (text: string) => void };
};

async function main() {
  const cli = parseLiveIndexerCliOptions({
    argv: process.argv.slice(2),
    env: process.env,
  });

  if (!cli.databaseUrl) {
    throw new Error("DATABASE_URL is required for the live DeepBook Predict indexer.");
  }

  const config = parsePredictCanaryConfig(process.env);
  const client = createPostgresSqlClient({ databaseUrl: cli.databaseUrl });
  const reader = createPostgresPredictIndexerReader({ execute: client.execute });
  const writer = createPostgresPredictIndexerStore({ execute: client.execute });

  if (cli.startupPriceBackfill) {
    const rangeEndMs = Date.now();
    const rangeStartMs = Math.max(
      1,
      Math.floor(rangeEndMs - cli.startupPriceBackfill.priceWindowDays * 24 * 60 * 60_000),
    );
    process.stdout.write(
      [
        "DeepBook Predict startup price backfill started.",
        `Days: ${cli.startupPriceBackfill.priceWindowDays}`,
        `Sample: ${cli.startupPriceBackfill.priceSampleMs}ms`,
        "",
      ].join("\n"),
    );
    const summary = await runDeepBookPredictBackfill({
      config,
      includeOracleTrades: false,
      includePositions: false,
      includePrices: true,
      includeSvi: false,
      priceRangeEndMs: rangeEndMs,
      priceRangeStartMs: rangeStartMs,
      priceSampleMs: cli.startupPriceBackfill.priceSampleMs,
      priceWindowConcurrency: cli.startupPriceBackfill.priceWindowConcurrency,
      priceWindowMs: cli.startupPriceBackfill.priceWindowMs,
      store: writer,
    });
    process.stdout.write(
      [
        "DeepBook Predict startup price backfill complete.",
        `Price oracles: ${summary.selectedPriceOracleIds.length}`,
        `Oracle prices written: ${summary.oraclePriceCount}`,
        "",
      ].join("\n"),
    );
  }

  if (cli.once) {
    try {
      const summary = await runDeepBookPredictLiveIndexerOnce({
        config,
        intervals: cli.intervals,
        oracleTradeLimit: cli.oracleTradeLimit,
        reader,
        sviLimit: cli.sviLimit,
        tradeLimit: cli.tradeLimit,
        writer,
      });
      process.stdout.write(formatOnceSummary(summary.jobs));
    } finally {
      await client.close();
    }
    return;
  }

  process.stdout.write(
    [
      "DeepBook Predict live indexer started.",
      `Oracles: every ${cli.intervals.oracles}ms`,
      `Prices: every ${cli.intervals.prices}ms`,
      `SVI: every ${cli.intervals.svi}ms`,
      `Positions: every ${cli.intervals.positions}ms`,
      `Oracle trades: every ${cli.intervals.oracleTrades}ms`,
      "",
    ].join("\n"),
  );

  const indexer = startDeepBookPredictLiveIndexer({
    config,
    intervals: cli.intervals,
    onError: (error, jobName) => {
      process.stderr.write(
        `${jobName} failed: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    },
    onPoll: (summary) => {
      process.stdout.write(formatJobSummary(summary));
    },
    oracleTradeLimit: cli.oracleTradeLimit,
    sviLimit: cli.sviLimit,
    reader,
    tradeLimit: cli.tradeLimit,
    writer,
  });

  const stop = () => {
    indexer.stop();
    void client.close().finally(() => process.exit(0));
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

function formatOnceSummary(jobs: readonly DeepBookPredictLiveIndexerJobSummary[]): string {
  return [
    "DeepBook Predict live indexer one-shot complete.",
    ...jobs.map(formatJobSummary),
  ].join("");
}

function formatJobSummary(summary: DeepBookPredictLiveIndexerJobSummary): string {
  return [
    `${summary.jobName}: ${summary.status}`,
    ` fetched=${summary.rowsFetched}`,
    ` written=${summary.rowsWritten}`,
    summary.lastSourceTimestampMs === undefined
      ? ""
      : ` source_ts=${summary.lastSourceTimestampMs}`,
    summary.lagMs === undefined ? "" : ` lag_ms=${summary.lagMs}`,
    "\n",
  ].join("");
}

if ((import.meta as ImportMeta & { main?: boolean }).main) {
  try {
    await main();
  } catch (error) {
    process.exitCode = 1;
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  }
}
