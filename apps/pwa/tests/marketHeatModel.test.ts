import { describe, expect, test } from "bun:test";
import {
  MARKET_HEAT_PREVIEW_ROWS,
  buildMarketHeatIntentPanel,
  buildMarketHeatPreview,
  closeMarketHeatIntent,
  loadMarketHeatPreview,
  selectMarketHeatIntent,
} from "../src/marketHeatModel";

describe("market heat preview model", () => {
  test("builds a compact external wallet watch preview from captured rows", () => {
    const preview = buildMarketHeatPreview(MARKET_HEAT_PREVIEW_ROWS);

    expect(preview).toEqual({
      title: "Market Heat",
      modeLabel: "Testnet",
      actionLabel: "Copy",
      detailLabel: "Observed Predict mints",
      sourceLabel: "Captured",
      rows: [
        {
          id: "external-0x84d2",
          displayName: "0x84d2...91af",
          manager: "manager 0xb795...3125",
          market: "BTC-USD UP",
          strikeLabel: "Strike 12.4K",
          intervalLabel: "15m",
          heatScore: 92,
          actionLabel: "Copy now",
          status: "copy_ready",
          statusLabel: "Mint seen",
        },
        {
          id: "external-0x28b7",
          displayName: "0x28b7...4c10",
          manager: "manager 0x43af...e64",
          market: "BTC-USD DOWN",
          strikeLabel: "Strike 7.8K",
          intervalLabel: "1h",
          heatScore: 87,
          actionLabel: "Copy next",
          status: "watching",
          statusLabel: "Next mint",
        },
      ],
    });
  });

  test("selects and closes a next-mint row without implying a ready signature", () => {
    const preview = buildMarketHeatPreview(MARKET_HEAT_PREVIEW_ROWS, 3);
    const selected = selectMarketHeatIntent(
      { selectedRowId: null },
      "external-0x28b7",
      preview.rows,
    );
    const watchingRow = preview.rows.find((row) => row.id === selected.selectedRowId);

    expect(selected.selectedRowId).toBe("external-0x28b7");
    expect(buildMarketHeatIntentPanel(watchingRow)).toEqual({
      actionLabel: "Copy next",
      closeLabel: "Cancel",
      detailLabel: "Next observed mint",
      signatureLabel: "We'll prepare the next mint for your signature",
      statusLabel: "Next mint",
      title: "Copy 0x28b7...4c10",
    });
    expect(closeMarketHeatIntent(selected)).toEqual({ selectedRowId: null });
  });

  test("labels copy-now intent only when an observed mint is available", () => {
    const [copyReadyRow] = buildMarketHeatPreview(MARKET_HEAT_PREVIEW_ROWS).rows;

    expect(buildMarketHeatIntentPanel(copyReadyRow)).toEqual({
      actionLabel: "Copy now",
      closeLabel: "Cancel",
      detailLabel: "Recent mint",
      signatureLabel: "Ready for user signature",
      statusLabel: "Mint seen",
      title: "Copy 0x84d2...91af",
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
              strike: 3400,
              expiryMs: 1_779_158_400_000,
              intervalLabel: "1h",
              heatScore: 74,
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
      strikeLabel: "Strike 3.4K",
      intervalLabel: "1h",
      actionLabel: "Copy next",
      statusLabel: "Next mint",
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
              strike: 67000,
              expiryMs: 1_779_158_400_000,
              intervalLabel: "15m",
              heatScore: 91,
              status: "copy_ready",
            },
          ],
        }),
    });

    expect(preview.sourceLabel).toBe("Captured");
    expect(preview.rows[0]).toMatchObject({
      market: "BTC-USD UP",
      strikeLabel: "Strike 67.0K",
      intervalLabel: "15m",
      actionLabel: "Copy now",
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
              strike: 69000,
              expiryMs: 1_779_158_400_000,
              intervalLabel: "1d",
              heatScore: 88,
              status: "watching",
            },
          ],
        }),
    });

    expect(preview.sourceLabel).toBe("Live Testnet");
    expect(preview.rows[0]).toMatchObject({
      market: "BTC-USD DOWN",
      intervalLabel: "1d",
      actionLabel: "Copy next",
      statusLabel: "Next mint",
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
