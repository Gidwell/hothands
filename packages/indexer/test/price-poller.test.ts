import { describe, expect, test } from "bun:test";
import {
  DEEPBOOK_PREDICT_TESTNET_CONFIG,
  pollDeepBookPredictLatestPrices,
  type PredictOraclePricePoint,
  type PredictOracleState,
} from "../src";

describe("DeepBook Predict live price poller", () => {
  test("polls latest prices for active indexed BTC oracles", async () => {
    const upserted: PredictOraclePricePoint[][] = [];
    const requests: string[] = [];

    const summary = await pollDeepBookPredictLatestPrices({
      fetchImpl: async (input: RequestInfo | URL) => {
        const url = String(input);
        requests.push(url);

        if (url.endsWith("/oracles/btc-fast/prices/latest")) {
          return jsonResponse({
            event_digest: "0xfast",
            event_index: 2,
            oracle_id: "btc-fast",
            spot: "63100000000000",
            forward: "63150000000000",
            checkpoint: "101",
            checkpoint_timestamp_ms: "1780604800000",
          });
        }

        return jsonResponse({ error: "not_found" }, 404);
      },
      reader: {
        listBtcOracles: async () => [
          btcOracle({ oracle_id: "btc-fast" }),
          btcOracle({ oracle_id: "btc-failing" }),
        ],
      },
      writer: {
        upsertOraclePrices: async (points) => {
          upserted.push(points);
          return points.length;
        },
      },
    });

    expect(summary).toEqual({
      activeOracleCount: 2,
      fetchedPriceCount: 1,
      latestCheckpoint: 101,
      latestSourceTimestampMs: 1_780_604_800_000,
      upsertedPriceCount: 1,
    });
    expect(upserted).toEqual([
      [
        {
          eventId: "price:0xfast:2",
          oracleId: "btc-fast",
          spot: 63_100_000_000_000,
          forward: 63_150_000_000_000,
          checkpoint: 101,
          timestampMs: 1_780_604_800_000,
          source: "oracles/prices",
        },
      ],
    ]);
    expect(requests).toEqual([
      `${DEEPBOOK_PREDICT_TESTNET_CONFIG.serverUrl}/oracles/btc-fast/prices/latest`,
      `${DEEPBOOK_PREDICT_TESTNET_CONFIG.serverUrl}/oracles/btc-failing/prices/latest`,
    ]);
  });
});

function btcOracle(overrides: Partial<PredictOracleState> = {}): PredictOracleState {
  return {
    predict_id: DEEPBOOK_PREDICT_TESTNET_CONFIG.predictObjectId,
    oracle_id: "btc-fast",
    underlying_asset: "BTC",
    expiry: 1_780_606_800,
    min_strike: 50_000_000_000,
    tick_size: 1_000_000,
    status: "active",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
