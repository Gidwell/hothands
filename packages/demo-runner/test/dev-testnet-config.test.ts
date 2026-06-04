import { describe, expect, test } from "bun:test";
import { resolveDevTestnetConfig } from "../src/dev-testnet-config";

describe("testnet dev launcher config", () => {
  test("uses local ports that do not collide with the live worker harness", () => {
    expect(resolveDevTestnetConfig({})).toEqual({
      apiHost: "127.0.0.1",
      apiPort: 8789,
      apiUrl: "http://127.0.0.1:8789",
      liveIndexerCommand: null,
      pwaHost: "127.0.0.1",
      pwaPort: 5176,
      pwaUrl: "http://127.0.0.1:5176",
    });
  });

  test("allows testnet API and PWA host/port overrides", () => {
    expect(
      resolveDevTestnetConfig({
        HOT_HANDS_TESTNET_HOST: "0.0.0.0",
        HOT_HANDS_TESTNET_API_PORT: "8899",
        HOT_HANDS_TESTNET_PWA_HOST: "localhost",
        HOT_HANDS_TESTNET_PWA_PORT: "5299",
      }),
    ).toEqual({
      apiHost: "0.0.0.0",
      apiPort: 8899,
      apiUrl: "http://0.0.0.0:8899",
      liveIndexerCommand: null,
      pwaHost: "localhost",
      pwaPort: 5299,
      pwaUrl: "http://localhost:5299",
    });
  });

  test("enables the dedicated live indexer when DATABASE_URL is present", () => {
    expect(
      resolveDevTestnetConfig({
        DATABASE_URL: "postgres://hot-hands.test",
      }).liveIndexerCommand,
    ).toEqual(["bun", "run", "--cwd", "packages/indexer", "live"]);
  });

  test("does not enable the live indexer without DATABASE_URL", () => {
    expect(resolveDevTestnetConfig({}).liveIndexerCommand).toBeNull();
  });

  test("allows HOT_HANDS_INDEXER_LIVE=false to disable the live indexer", () => {
    expect(
      resolveDevTestnetConfig({
        DATABASE_URL: "postgres://hot-hands.test",
        HOT_HANDS_INDEXER_LIVE: "false",
      }).liveIndexerCommand,
    ).toBeNull();
  });
});
