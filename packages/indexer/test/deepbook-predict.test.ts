import { describe, expect, test } from "bun:test";
import {
  DEEPBOOK_PREDICT_TESTNET_CONFIG,
  buildPredictServerUrl,
  createPredictReadCanary,
  parsePredictCanaryConfig,
  selectBestBtcOracle,
} from "../src/deepbook-predict";

describe("DeepBook Predict read canary config", () => {
  test("uses current public testnet integration targets with env overrides", () => {
    expect(parsePredictCanaryConfig({})).toEqual(DEEPBOOK_PREDICT_TESTNET_CONFIG);
    expect(
      parsePredictCanaryConfig({
        HOT_HANDS_PREDICT_SERVER_URL: "https://predict.example.test/api/",
        HOT_HANDS_PREDICT_OBJECT_ID: "0xabc",
        HOT_HANDS_PREDICT_QUOTE_ASSET:
          "0x2::demo::DUSDC",
        HOT_HANDS_PREDICT_BTC_ONLY: "false",
      }),
    ).toEqual({
      ...DEEPBOOK_PREDICT_TESTNET_CONFIG,
      serverUrl: "https://predict.example.test/api",
      predictObjectId: "0xabc",
      quoteAssetType: "0x2::demo::DUSDC",
      btcOnly: false,
    });
  });

  test("builds normalized Predict server URLs", () => {
    expect(buildPredictServerUrl("https://predict.example.test/api/", "/status")).toBe(
      "https://predict.example.test/api/status",
    );
    expect(buildPredictServerUrl("https://predict.example.test", "predicts/0x1/state")).toBe(
      "https://predict.example.test/predicts/0x1/state",
    );
  });
});

describe("DeepBook Predict BTC oracle selection", () => {
  test("prefers active BTC oracles, then newest expiry when no active oracle exists", () => {
    expect(
      selectBestBtcOracle([
        btcOracle({ oracle_id: "settled-new", expiry: 30, status: "settled" }),
        btcOracle({ oracle_id: "active-old", expiry: 10, status: "active" }),
        btcOracle({ oracle_id: "eth-active", underlying_asset: "ETH", expiry: 40, status: "active" }),
        btcOracle({ oracle_id: "active-new", expiry: 20, status: "active" }),
      ]),
    ).toMatchObject({
      oracle_id: "active-new",
      status: "active",
    });

    expect(
      selectBestBtcOracle([
        btcOracle({ oracle_id: "settled-old", expiry: 10, status: "settled" }),
        btcOracle({ oracle_id: "settled-new", expiry: 30, status: "settled" }),
      ]),
    ).toMatchObject({
      oracle_id: "settled-new",
    });
  });
});

describe("DeepBook Predict read canary", () => {
  test("reads status, state, oracles, and latest BTC price from injected fetch", async () => {
    const requests: string[] = [];
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);

      if (url.endsWith("/status")) {
        return jsonResponse({
          status: "OK",
          latest_onchain_checkpoint: 100,
          max_checkpoint_lag: 2,
        });
      }

      if (url.endsWith("/state")) {
        return jsonResponse({
          predict_id: DEEPBOOK_PREDICT_TESTNET_CONFIG.predictObjectId,
          quote_assets: [DEEPBOOK_PREDICT_TESTNET_CONFIG.quoteAssetType.replace(/^0x/, "")],
        });
      }

      if (url.endsWith("/oracles")) {
        return jsonResponse([
          btcOracle({ oracle_id: "settled", expiry: 10, status: "settled" }),
          btcOracle({ oracle_id: "active-btc", expiry: 20, status: "active" }),
        ]);
      }

      if (url.endsWith("/prices/latest")) {
        return jsonResponse({
          oracle_id: "active-btc",
          spot: 64_200_000_000,
          forward: 64_300_000_000,
          checkpoint: 101,
        });
      }

      return jsonResponse({ error: "not_found" }, 404);
    };

    const result = await createPredictReadCanary({ fetchImpl }).run();

    expect(result).toMatchObject({
      ok: true,
      status: "OK",
      quoteAssetEnabled: true,
      btcOracleCount: 2,
      selectedBtcOracle: {
        oracle_id: "active-btc",
        status: "active",
      },
      latestPrice: {
        oracle_id: "active-btc",
        spot: 64_200_000_000,
      },
    });
    expect(requests).toEqual([
      `${DEEPBOOK_PREDICT_TESTNET_CONFIG.serverUrl}/status`,
      `${DEEPBOOK_PREDICT_TESTNET_CONFIG.serverUrl}/predicts/${DEEPBOOK_PREDICT_TESTNET_CONFIG.predictObjectId}/state`,
      `${DEEPBOOK_PREDICT_TESTNET_CONFIG.serverUrl}/predicts/${DEEPBOOK_PREDICT_TESTNET_CONFIG.predictObjectId}/oracles`,
      `${DEEPBOOK_PREDICT_TESTNET_CONFIG.serverUrl}/oracles/active-btc/prices/latest`,
    ]);
  });
});

function btcOracle(overrides: Record<string, unknown>) {
  return {
    predict_id: DEEPBOOK_PREDICT_TESTNET_CONFIG.predictObjectId,
    oracle_id: "btc-oracle",
    underlying_asset: "BTC",
    expiry: 1,
    min_strike: 50_000_000_000,
    tick_size: 1_000_000,
    status: "settled",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
