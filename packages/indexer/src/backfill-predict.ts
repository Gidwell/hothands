#!/usr/bin/env bun
import { parsePredictCanaryConfig } from "./deepbook-predict";
import { runDeepBookPredictBackfill } from "./backfill";
import { createPostgresSqlClient } from "./postgres-client";
import { createPostgresPredictIndexerStore } from "./postgres-store";
import { createInMemoryPredictIndexerStore } from "./store";

declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exitCode?: number;
  stdout: { write: (text: string) => void };
  stderr: { write: (text: string) => void };
};

export type BackfillCliOptions = {
  databaseUrl?: string;
  dryRun: boolean;
  oracleIds?: string[];
  tradeLimit: number;
  priceLimit: number;
  sviLimit: number;
  includeOracleTrades: boolean;
  includePrices: boolean;
  includeSvi: boolean;
};

export function parseBackfillCliOptions({
  argv,
  env,
}: {
  argv: readonly string[];
  env: Record<string, string | undefined>;
}): BackfillCliOptions {
  const parsed = parseArgs(argv);
  const databaseUrl = env.DATABASE_URL;
  const dryRun =
    parsed.flags.has("dry-run") ||
    env.HOT_HANDS_INDEXER_DRY_RUN === "true" ||
    !(parsed.flags.has("write") || env.HOT_HANDS_INDEXER_WRITE === "true");
  const oracleIds = [
    ...valuesFor(parsed, "oracle-id"),
    ...valuesFor(parsed, "oracle-ids").flatMap(splitCsv),
    ...splitCsv(env.HOT_HANDS_INDEXER_ORACLE_IDS),
  ];

  return {
    databaseUrl,
    dryRun,
    oracleIds: oracleIds.length === 0 ? undefined : oracleIds,
    tradeLimit: positiveInt(
      lastValue(parsed, "trade-limit") ?? env.HOT_HANDS_INDEXER_TRADE_LIMIT,
      5_000,
    ),
    priceLimit: positiveInt(
      lastValue(parsed, "price-limit") ?? env.HOT_HANDS_INDEXER_PRICE_LIMIT,
      10_000,
    ),
    sviLimit: positiveInt(
      lastValue(parsed, "svi-limit") ?? env.HOT_HANDS_INDEXER_SVI_LIMIT,
      1_000,
    ),
    includeOracleTrades:
      !parsed.flags.has("skip-oracle-trades") &&
      env.HOT_HANDS_INDEXER_SKIP_ORACLE_TRADES !== "true",
    includePrices:
      !parsed.flags.has("skip-prices") &&
      env.HOT_HANDS_INDEXER_SKIP_PRICES !== "true",
    includeSvi:
      parsed.flags.has("include-svi") ||
      env.HOT_HANDS_INDEXER_INCLUDE_SVI === "true",
  };
}

async function main() {
  const cli = parseBackfillCliOptions({
    argv: process.argv.slice(2),
    env: process.env,
  });

  if (!cli.dryRun && !cli.databaseUrl) {
    throw new Error("DATABASE_URL is required when running with --write.");
  }

  const config = parsePredictCanaryConfig(process.env);
  const { store, close } = cli.dryRun
    ? {
        store: createInMemoryPredictIndexerStore(),
        close: async () => {},
      }
    : createPostgresStore(cli.databaseUrl);

  try {
    const summary = await runDeepBookPredictBackfill({
      store,
      config,
      oracleIds: cli.oracleIds,
      tradeLimit: cli.tradeLimit,
      priceLimit: cli.priceLimit,
      sviLimit: cli.sviLimit,
      includeOracleTrades: cli.includeOracleTrades,
      includePrices: cli.includePrices,
      includeSvi: cli.includeSvi,
    });

    process.stdout.write(formatBackfillSummary(cli, summary, config.serverUrl));
  } finally {
    await close();
  }
}

function createPostgresStore(databaseUrl: string | undefined) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for Postgres writes.");
  }

  const client = createPostgresSqlClient({ databaseUrl });

  return {
    store: createPostgresPredictIndexerStore({ execute: client.execute }),
    close: client.close,
  };
}

function formatBackfillSummary(
  cli: BackfillCliOptions,
  summary: Awaited<ReturnType<typeof runDeepBookPredictBackfill>>,
  serverUrl: string,
): string {
  return [
    "DeepBook Predict backfill complete.",
    `Mode: ${cli.dryRun ? "dry-run" : "postgres"}`,
    `Server: ${serverUrl}`,
    `Selected oracles: ${summary.selectedOracleIds.length}`,
    `Oracles: ${summary.oracleCount}`,
    `Trade events: ${summary.tradeEventCount}`,
    `Position summaries: ${summary.positionSummaryCount}`,
    `Oracle prices: ${summary.oraclePriceCount}`,
    `Oracle SVI: ${summary.oracleSviCount}`,
  ].join("\n") + "\n";
}

type ParsedArgs = {
  flags: Set<string>;
  values: Map<string, string[]>;
};

function parseArgs(argv: readonly string[]): ParsedArgs {
  const flags = new Set<string>();
  const values = new Map<string, string[]>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg?.startsWith("--")) {
      continue;
    }

    const raw = arg.slice(2);
    const equalsIndex = raw.indexOf("=");
    if (equalsIndex >= 0) {
      pushValue(values, raw.slice(0, equalsIndex), raw.slice(equalsIndex + 1));
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith("--") && expectsValue(raw)) {
      pushValue(values, raw, next);
      index += 1;
    } else {
      flags.add(raw);
    }
  }

  return { flags, values };
}

function expectsValue(key: string): boolean {
  return [
    "oracle-id",
    "oracle-ids",
    "trade-limit",
    "price-limit",
    "svi-limit",
  ].includes(key);
}

function valuesFor(parsed: ParsedArgs, key: string): string[] {
  return parsed.values.get(key) ?? [];
}

function lastValue(parsed: ParsedArgs, key: string): string | undefined {
  return valuesFor(parsed, key).at(-1);
}

function pushValue(values: Map<string, string[]>, key: string, value: string) {
  values.set(key, [...(values.get(key) ?? []), value]);
}

function splitCsv(value: string | undefined): string[] {
  return value
    ? value.split(",").map((part) => part.trim()).filter(Boolean)
    : [];
}

function positiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

if ((import.meta as ImportMeta & { main?: boolean }).main) {
  try {
    await main();
  } catch (error) {
    process.exitCode = 1;
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
  }
}
