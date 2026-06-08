import { describe, expect, test } from "bun:test";
import {
  loadOraclePriceChart,
  loadOraclePriceChartTick,
  type OraclePriceChart,
} from "../src/oraclePriceChartModel";

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
      "https://api.hot-hands.test/testnet/oracle-prices?oracleId=btc-live&maxPoints=10000",
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

  test("represents indexed full-history metadata without modal copy", async () => {
    const chart = await loadOraclePriceChart({
      apiBaseUrl: "https://api.hot-hands.test/",
      oracleId: "btc-indexed",
      fetcher: async () =>
        Response.json({
          source: "indexed_testnet",
          market: "BTC-USD",
          oracleId: "btc-indexed",
          latestPrice: 72100,
          historyRange: {
            startTimestampMs: 1_778_985_000_000,
            endTimestampMs: 1_779_071_400_000,
            totalPointCount: 86_400,
            returnedPointCount: 3,
            maxPoints: 10_000,
            downsampled: true,
          },
          points: [
            {
              timestampMs: 1_779_070_800_000,
              price: 72000,
              checkpoint: 101,
            },
            {
              timestampMs: 1_779_071_100_000,
              price: 72075,
              checkpoint: 106,
            },
            {
              timestampMs: 1_779_071_400_000,
              price: 72100,
              checkpoint: 111,
            },
          ],
        }),
    });

    expect(chart.status).toBe("ready");
    expect(chart.sourceLabel).toBe("Indexed Testnet");
    expect(chart.historyRange).toEqual({
      startTimestampMs: 1_778_985_000_000,
      endTimestampMs: 1_779_071_400_000,
      totalPointCount: 86_400,
      returnedPointCount: 3,
      maxPoints: 10_000,
      downsampled: true,
    });
    expect(chart.points).toHaveLength(3);
  });

  test("merges a lightweight indexed price snapshot into existing chart history", async () => {
    const calls: string[] = [];
    const chart: OraclePriceChart = {
      status: "ready",
      oracleId: "btc-indexed",
      marketLabel: "BTC/USD",
      sourceLabel: "Indexed Testnet",
      title: "DeepBook BTC oracle price",
      detail: "DeepBook Predict oracle price used for BTC market settlement.",
      latestPriceLabel: "$72,100",
      historyRange: {
        startTimestampMs: 1_779_070_800_000,
        endTimestampMs: 1_779_071_400_000,
        totalPointCount: 3,
        returnedPointCount: 3,
        maxPoints: 10_000,
        downsampled: false,
      },
      points: [
        { timestampMs: 1_779_070_800_000, price: 72000, checkpoint: 101 },
        { timestampMs: 1_779_071_100_000, price: 72075, checkpoint: 106 },
        { timestampMs: 1_779_071_400_000, price: 72100, checkpoint: 111 },
      ],
    };

    const updated = await loadOraclePriceChartTick({
      apiBaseUrl: "https://api.hot-hands.test/",
      oracleId: "btc-indexed",
      chart,
      fetcher: async (url) => {
        calls.push(String(url));

        return Response.json({
          source: "indexed_testnet",
          marketPrice: {
            market: "BTC-USD",
            price: 72125,
            source: "indexed_testnet",
          },
          markets: [
            {
              oracleId: "btc-other",
              latestPrice: 71000,
              latestPriceTimestampMs: 1_779_071_600_000,
            },
            {
              oracleId: "btc-indexed",
              latestPrice: 72125,
              latestPriceLabel: "$72,125",
              latestPriceTimestampMs: 1_779_071_700_000,
              latestPriceCheckpoint: 112,
              pricingModel: {
                forwardPrice: 72140,
                timestampMs: 1_779_071_700_000,
              },
            },
          ],
        });
      },
    });

    expect(calls).toEqual([
      "https://api.hot-hands.test/testnet/price-snapshot",
    ]);
    expect(updated?.latestPriceLabel).toBe("$72,125");
    expect(updated?.historyRange).toEqual({
      startTimestampMs: 1_779_070_800_000,
      endTimestampMs: 1_779_071_700_000,
      totalPointCount: 4,
      returnedPointCount: 4,
      maxPoints: 10_000,
      downsampled: false,
    });
    expect(updated?.points.at(-1)).toEqual({
      timestampMs: 1_779_071_700_000,
      price: 72125,
      forwardPrice: 72140,
      checkpoint: 112,
    });
  });

  test("keeps the current chart when the price snapshot does not include the oracle", async () => {
    const chart: OraclePriceChart = {
      status: "ready",
      oracleId: "btc-indexed",
      marketLabel: "BTC/USD",
      sourceLabel: "Indexed Testnet",
      title: "DeepBook BTC oracle price",
      detail: "DeepBook Predict oracle price used for BTC market settlement.",
      latestPriceLabel: "$72,100",
      points: [
        { timestampMs: 1_779_070_800_000, price: 72000 },
        { timestampMs: 1_779_071_400_000, price: 72100 },
      ],
    };

    await expect(
      loadOraclePriceChartTick({
        apiBaseUrl: "https://api.hot-hands.test",
        oracleId: "btc-indexed",
        chart,
        fetcher: async () =>
          Response.json({
            source: "indexed_testnet",
            markets: [{ oracleId: "btc-other", latestPrice: 71000 }],
          }),
      }),
    ).resolves.toBe(chart);
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
