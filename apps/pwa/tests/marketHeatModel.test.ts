import { describe, expect, test } from "bun:test";
import {
  MARKET_HEAT_PREVIEW_ROWS,
  buildMarketHeatPreview,
  loadMarketHeatPreview,
} from "../src/marketHeatModel";

describe("market heat preview model", () => {
  test("builds a compact external wallet watch preview from captured rows", () => {
    const preview = buildMarketHeatPreview(MARKET_HEAT_PREVIEW_ROWS);

    expect(preview).toEqual({
      title: "Market Heat",
      modeLabel: "Testnet",
      actionLabel: "Watch hand",
      detailLabel: "Observed Predict mints",
      sourceLabel: "Captured",
      rows: [
        {
          id: "external-0x84d2",
          displayName: "0x84d2...91af",
          manager: "manager 0xb795...3125",
          market: "BTC-USD UP",
          observedMint: "12.4K",
          heatScore: 92,
          preparedCopies: 18,
          actionLabel: "Copy hand",
          status: "copy_ready",
          statusLabel: "Copy ready",
        },
        {
          id: "external-0x28b7",
          displayName: "0x28b7...4c10",
          manager: "manager 0x43af...e64",
          market: "BTC-USD DOWN",
          observedMint: "7.8K",
          heatScore: 87,
          preparedCopies: 11,
          actionLabel: "Watch hand",
          status: "watching",
          statusLabel: "Watching",
        },
      ],
    });
  });

  test("loads market heat rows from the configured testnet API", async () => {
    const calls: string[] = [];
    const preview = await loadMarketHeatPreview({
      apiBaseUrl: "https://api.hot-hands.test/",
      fetcher: async (url) => {
        calls.push(String(url));

        return Response.json({
          mode: "testnet",
          source: "api",
          rows: [
            {
              id: "external-0x1111",
              wallet: "0x1111222233334444555566667777888899990000",
              manager: "manager 0xabcd...0001",
              market: "BTC-USD",
              side: "DOWN",
              observedMint: 3400,
              heatScore: 74,
              preparedCopies: 5,
              status: "watching",
            },
          ],
        });
      },
    });

    expect(calls).toEqual(["https://api.hot-hands.test/testnet/market-heat"]);
    expect(preview.sourceLabel).toBe("API testnet");
    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0]).toMatchObject({
      id: "external-0x1111",
      displayName: "0x1111...0000",
      market: "BTC-USD DOWN",
      observedMint: "3.4K",
      statusLabel: "Watching",
    });
  });

  test("keeps captured testnet API source labels compact", async () => {
    const preview = await loadMarketHeatPreview({
      apiBaseUrl: "https://api.hot-hands.test/",
      fetcher: async () =>
        Response.json({
          mode: "testnet",
          source: "captured_testnet",
          rows: [
            {
              id: "external-0x2222",
              wallet: "0x2222333344445555666677778888999900001111",
              manager: "manager 0xabcd...0002",
              market: "BTC-USD",
              side: "UP",
              observedMint: 67000,
              heatScore: 91,
              preparedCopies: 14,
              status: "copy_ready",
            },
          ],
        }),
    });

    expect(preview.sourceLabel).toBe("Captured");
    expect(preview.rows[0]).toMatchObject({
      market: "BTC-USD UP",
      actionLabel: "Copy hand",
    });
  });

  test("labels live testnet API rows without extra copy", async () => {
    const preview = await loadMarketHeatPreview({
      apiBaseUrl: "https://api.hot-hands.test/",
      fetcher: async () =>
        Response.json({
          mode: "testnet",
          source: "live_testnet",
          rows: [
            {
              id: "live-0x3333",
              wallet: "0x3333444455556666777788889999000011112222",
              manager: "manager 0xabcd...0003",
              market: "BTC-USD",
              side: "DOWN",
              observedMint: 69000,
              heatScore: 88,
              preparedCopies: 3,
              status: "watching",
            },
          ],
        }),
    });

    expect(preview.sourceLabel).toBe("Live Testnet");
    expect(preview.rows[0]).toMatchObject({
      market: "BTC-USD DOWN",
      statusLabel: "Watching",
    });
  });

  test("uses captured rows when no API URL is configured", async () => {
    const preview = await loadMarketHeatPreview({
      apiBaseUrl: "",
      fetcher: async () => {
        throw new Error("fetcher should not be called without an API URL");
      },
    });

    expect(preview.sourceLabel).toBe("Captured");
    expect(preview.rows[0]?.id).toBe(MARKET_HEAT_PREVIEW_ROWS[0]?.id);
  });

  test("falls back to captured rows when the testnet API request fails", async () => {
    const preview = await loadMarketHeatPreview({
      apiBaseUrl: "https://api.hot-hands.test",
      fetcher: async () => {
        throw new Error("offline");
      },
    });

    expect(preview.sourceLabel).toBe("Captured");
    expect(preview.rows[0]?.id).toBe(MARKET_HEAT_PREVIEW_ROWS[0]?.id);
  });
});
