import { describe, expect, test } from "bun:test";
import { parseBackfillCliOptions } from "../src/backfill-predict";

describe("Predict backfill CLI options", () => {
  test("parses command args and environment with safe defaults", () => {
    expect(
      parseBackfillCliOptions({
        argv: [
          "--trade-limit",
          "7000",
          "--price-limit=20000",
          "--oracle-id",
          "btc-15m",
          "--oracle-ids=btc-1h,btc-1d",
          "--include-svi",
          "--dry-run",
        ],
        env: {
          HOT_HANDS_INDEXER_SVI_LIMIT: "250",
          DATABASE_URL: "postgres://example",
        },
      }),
    ).toMatchObject({
      databaseUrl: "postgres://example",
      dryRun: true,
      oracleIds: ["btc-15m", "btc-1h", "btc-1d"],
      tradeLimit: 7_000,
      priceLimit: 20_000,
      sviLimit: 250,
      includeSvi: true,
      includePrices: true,
      includeOracleTrades: true,
    });
  });

  test("uses an in-memory dry-run when DATABASE_URL is not set", () => {
    expect(parseBackfillCliOptions({ argv: [], env: {} })).toMatchObject({
      databaseUrl: undefined,
      dryRun: true,
      oracleIds: undefined,
      tradeLimit: 5_000,
      priceLimit: 10_000,
      sviLimit: 1_000,
      includeSvi: false,
    });

    expect(
      parseBackfillCliOptions({
        argv: ["--write", "--skip-prices", "--skip-oracle-trades"],
        env: {},
      }),
    ).toMatchObject({
      dryRun: false,
      includePrices: false,
      includeOracleTrades: false,
    });
  });

  test("requires an explicit write flag even when DATABASE_URL is present", () => {
    expect(
      parseBackfillCliOptions({
        argv: [],
        env: { DATABASE_URL: "postgres://example" },
      }),
    ).toMatchObject({
      databaseUrl: "postgres://example",
      dryRun: true,
    });

    expect(
      parseBackfillCliOptions({
        argv: ["--write"],
        env: { DATABASE_URL: "postgres://example" },
      }),
    ).toMatchObject({
      databaseUrl: "postgres://example",
      dryRun: false,
    });
  });
});
