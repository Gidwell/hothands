import { describe, expect, test } from "bun:test";
import { resolveDevTestnetConfig } from "../src/dev-testnet-config";

const pwaCleanupRange = (basePort: number) =>
  Array.from({ length: 11 }, (_, offset) => basePort + offset);

describe("testnet dev launcher config", () => {
  test("uses local ports that do not collide with the live worker harness", () => {
    expect(resolveDevTestnetConfig({ DATABASE_URL: "postgres://hot-hands.test" })).toEqual({
      apiHost: "127.0.0.1",
      apiCommand: ["bun", "apps/api-worker/src/testnet-dev-server.ts"],
      apiPort: 8789,
      apiUrl: "http://127.0.0.1:8789",
      bootstrapBackfillCommand: [
        "bun",
        "packages/indexer/src/backfill-predict.ts",
        "--write",
        "--include-svi",
      ],
      cleanupPorts: [8789, ...pwaCleanupRange(5176)],
      liveIndexerCommand: ["bun", "packages/indexer/src/live.ts"],
      migrationCommand: ["bun", "packages/indexer/src/migrate.ts"],
      readinessTimeoutMs: 30000,
      pwaCommand: [
        "bun",
        "run",
        "--cwd",
        "apps/pwa",
        "dev",
        "--",
        "--host",
        "127.0.0.1",
        "--port",
        "5176",
      ],
      pwaHost: "127.0.0.1",
      pwaPort: 5176,
      pwaUrl: "http://127.0.0.1:5176",
    });
  });

  test("allows testnet API and PWA host/port overrides", () => {
    expect(
      resolveDevTestnetConfig({
        DATABASE_URL: "postgres://hot-hands.test",
        HOT_HANDS_TESTNET_HOST: "0.0.0.0",
        HOT_HANDS_TESTNET_API_PORT: "8899",
        HOT_HANDS_TESTNET_PWA_HOST: "localhost",
        HOT_HANDS_TESTNET_PWA_PORT: "5299",
      }),
    ).toEqual({
      apiHost: "0.0.0.0",
      apiCommand: ["bun", "apps/api-worker/src/testnet-dev-server.ts"],
      apiPort: 8899,
      apiUrl: "http://0.0.0.0:8899",
      bootstrapBackfillCommand: [
        "bun",
        "packages/indexer/src/backfill-predict.ts",
        "--write",
        "--include-svi",
      ],
      cleanupPorts: [8899, ...pwaCleanupRange(5299)],
      liveIndexerCommand: ["bun", "packages/indexer/src/live.ts"],
      migrationCommand: ["bun", "packages/indexer/src/migrate.ts"],
      readinessTimeoutMs: 30000,
      pwaCommand: [
        "bun",
        "run",
        "--cwd",
        "apps/pwa",
        "dev",
        "--",
        "--host",
        "localhost",
        "--port",
        "5299",
      ],
      pwaHost: "localhost",
      pwaPort: 5299,
      pwaUrl: "http://localhost:5299",
    });
  });

  test("enables the dedicated live indexer when DATABASE_URL is present", () => {
    const config = resolveDevTestnetConfig({
      DATABASE_URL: "postgres://hot-hands.test",
    });

    expect(config.liveIndexerCommand).toEqual(["bun", "packages/indexer/src/live.ts"]);
    expect(config.migrationCommand).toEqual(["bun", "packages/indexer/src/migrate.ts"]);
    expect(config.bootstrapBackfillCommand).toEqual([
      "bun",
      "packages/indexer/src/backfill-predict.ts",
      "--write",
      "--include-svi",
    ]);
  });

  test("requires DATABASE_URL unless fallback mode is explicit", () => {
    expect(() => resolveDevTestnetConfig({})).toThrow("DATABASE_URL is required");
  });

  test("allows explicit fallback testnet debugging without DATABASE_URL", () => {
    const config = resolveDevTestnetConfig({
      HOT_HANDS_ALLOW_FALLBACK_TESTNET: "true",
    });

    expect(config.liveIndexerCommand).toBeNull();
    expect(config.migrationCommand).toBeNull();
    expect(config.bootstrapBackfillCommand).toBeNull();
  });

  test("allows HOT_HANDS_INDEXER_LIVE=false to disable the live indexer", () => {
    expect(
      resolveDevTestnetConfig({
        DATABASE_URL: "postgres://hot-hands.test",
        HOT_HANDS_INDEXER_LIVE: "false",
      }).liveIndexerCommand,
    ).toBeNull();
  });

  test("allows dev testnet DB bootstrap steps to be disabled independently", () => {
    const config = resolveDevTestnetConfig({
      DATABASE_URL: "postgres://hot-hands.test",
      HOT_HANDS_DEV_BACKFILL: "false",
      HOT_HANDS_DEV_MIGRATE: "false",
    });

    expect(config.migrationCommand).toBeNull();
    expect(config.bootstrapBackfillCommand).toBeNull();
    expect(config.liveIndexerCommand).toEqual(["bun", "packages/indexer/src/live.ts"]);
  });

  test("allows readiness timeout override for tighter local diagnostics", () => {
    expect(
      resolveDevTestnetConfig({
        DATABASE_URL: "postgres://hot-hands.test",
        HOT_HANDS_DEV_READY_TIMEOUT_MS: "5000",
      }).readinessTimeoutMs,
    ).toBe(5000);
  });
});
