import { describe, expect, test } from "bun:test";
import { loadOraclePriceChart } from "../src/oraclePriceChartModel";

describe("oracle price chart model", () => {
  test("loads DeepBook oracle chart points from the configured API", async () => {
    const calls: string[] = [];
    const chart = await loadOraclePriceChart({
      apiBaseUrl: "https://api.hot-hands.test/",
      oracleId: "btc-live",
      fetcher: async (url) => {
        calls.push(String(url));

        return Response.json({
          source: "live_testnet",
          market: "BTC-USD",
          oracleId: "btc-live",
          title: "DeepBook BTC oracle price",
          detail: "DeepBook Predict oracle price used for BTC market settlement.",
          latestPrice: 72050,
          points: [
            {
              timestampMs: 1_779_070_800_000,
              price: 72000,
              checkpoint: 101,
            },
            {
              timestampMs: 1_779_070_860_000,
              price: 72050,
              forwardPrice: 72070,
              checkpoint: 102,
            },
          ],
        });
      },
    });

    expect(calls).toEqual([
      "https://api.hot-hands.test/testnet/oracle-prices?oracleId=btc-live",
    ]);
    expect(chart).toEqual({
      status: "ready",
      oracleId: "btc-live",
      marketLabel: "BTC/USD",
      sourceLabel: "Live Testnet",
      title: "DeepBook BTC oracle price",
      detail: "DeepBook Predict oracle price used for BTC market settlement.",
      latestPriceLabel: "$72,050",
      points: [
        {
          timestampMs: 1_779_070_800_000,
          price: 72000,
          checkpoint: 101,
        },
        {
          timestampMs: 1_779_070_860_000,
          price: 72050,
          forwardPrice: 72070,
          checkpoint: 102,
        },
      ],
    });
  });

  test("returns an unavailable state when the chart API has no useful points", async () => {
    const chart = await loadOraclePriceChart({
      apiBaseUrl: "https://api.hot-hands.test",
      oracleId: "btc-empty",
      fetcher: async () =>
        Response.json({
          source: "live_testnet",
          market: "BTC-USD",
          oracleId: "btc-empty",
          points: [{ timestampMs: 1, price: 0 }],
        }),
    });

    expect(chart).toEqual({
      status: "unavailable",
      oracleId: "btc-empty",
      marketLabel: "BTC/USD",
      sourceLabel: "Live Testnet",
      title: "DeepBook BTC oracle price",
      detail: "Waiting for DeepBook oracle price history.",
      latestPriceLabel: null,
      points: [],
    });
  });
});
