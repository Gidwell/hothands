import { describe, expect, test } from "bun:test";
import {
  MARKET_HEAT_PREVIEW_ROWS,
  buildMarketHeatIntentPanel,
  buildMarketHeatPreview,
  closeMarketHeatIntent,
  loadMarketHeatPreview,
  selectMarketHeatIntent,
  sortMarketHeatRows,
} from "../src/marketHeatModel";

describe("market heat preview model", () => {
  test("builds a compact external wallet watch preview from captured rows", () => {
    const preview = buildMarketHeatPreview(MARKET_HEAT_PREVIEW_ROWS, 8, {
      nowMs: 1_779_165_600_000,
    });

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
          observedAtMs: 1_779_158_400_000,
          heatScore: 92,
          actionLabel: "Copy now",
          status: "copy_ready",
          statusLabel: "2h ago",
        },
        {
          id: "external-0x28b7",
          displayName: "0x28b7...4c10",
          manager: "manager 0x43af...e64",
          market: "BTC-USD DOWN",
          strikeLabel: "Strike 7.8K",
          intervalLabel: "1h",
          observedAtMs: 1_779_151_200_000,
          heatScore: 87,
          actionLabel: "Copy next",
          status: "watching",
          statusLabel: "4h ago",
        },
        {
          id: "external-0x6f09",
          displayName: "0x6f09...aa35",
          manager: "manager 0xc873...028a",
          market: "BTC-USD UP",
          strikeLabel: "Strike 4.2K",
          intervalLabel: "1d",
          observedAtMs: 1_779_079_200_000,
          heatScore: 81,
          actionLabel: "Copy next",
          status: "watching",
          statusLabel: "1d ago",
        },
      ],
    });
  });

  test("selects and closes a next-mint row without implying a ready signature", () => {
    const preview = buildMarketHeatPreview(MARKET_HEAT_PREVIEW_ROWS, 3, {
      nowMs: 1_779_165_600_000,
    });
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
      statusLabel: "4h ago",
      title: "Copy 0x28b7...4c10",
    });
    expect(closeMarketHeatIntent(selected)).toEqual({ selectedRowId: null });
  });

  test("labels copy-now intent only when an observed mint is available", () => {
    const [copyReadyRow] = buildMarketHeatPreview(MARKET_HEAT_PREVIEW_ROWS, 8, {
      nowMs: 1_779_165_600_000,
    }).rows;

    expect(buildMarketHeatIntentPanel(copyReadyRow)).toEqual({
      actionLabel: "Copy now",
      closeLabel: "Cancel",
      detailLabel: "Recent mint",
      signatureLabel: "Ready for user signature",
      statusLabel: "2h ago",
      title: "Copy 0x84d2...91af",
    });
  });

  test("loads market heat rows from the configured testnet API", async () => {
    const calls: string[] = [];
    const preview = await loadMarketHeatPreview({
      apiBaseUrl: "https://api.hot-hands.test/",
      nowMs: 1_779_165_000_000,
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
              observedAtMs: 1_779_165_000_000,
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
      statusLabel: "just now",
    });
  });

  test("keeps the full compact market heat feed available for scrolling", () => {
    const rows = Array.from({ length: 8 }, (_, index) => ({
      id: `external-${index}`,
      wallet: `0x${String(index).repeat(40)}`,
      manager: `manager-${index}`,
      market: "BTC-USD",
      side: index % 2 === 0 ? ("UP" as const) : ("DOWN" as const),
      strike: 70_000 + index,
      expiryMs: 1_779_158_400_000,
      intervalLabel: "15m",
      observedAtMs: 1_779_165_000_000 - index * 60_000,
      heatScore: 99 - index,
      status: index % 2 === 0 ? ("copy_ready" as const) : ("watching" as const),
    }));

    expect(buildMarketHeatPreview(rows).rows).toHaveLength(8);
  });

  test("keeps extra market heat API candidates for client-side sorting", async () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      id: `api-candidate-${index}`,
      wallet: `0x${String(index % 10).repeat(40)}`,
      manager: `manager-${index}`,
      market: "BTC-USD",
      side: index % 2 === 0 ? ("UP" as const) : ("DOWN" as const),
      strike: 70_000 + index,
      expiryMs: 1_779_158_400_000,
      intervalLabel: "15m",
      observedAtMs: 1_779_165_000_000 - index * 60_000,
      heatScore: 99 - index,
      status: index % 2 === 0 ? ("copy_ready" as const) : ("watching" as const),
    }));
    const preview = await loadMarketHeatPreview({
      apiBaseUrl: "https://api.hot-hands.test/",
      nowMs: 1_779_165_000_000,
      fetcher: async () =>
        Response.json({
          mode: "testnet",
          source: "live_testnet",
          rows,
        }),
    });

    expect(preview.rows).toHaveLength(12);
  });

  test("orders market heat by latest observed trade by default", () => {
    const preview = buildMarketHeatPreview(
      [
        {
          id: "older-hot",
          wallet: "0x9999222233334444555566667777888899990000",
          manager: "manager-hot",
          market: "BTC-USD",
          side: "UP",
          strike: 70_000,
          expiryMs: 1_779_158_400_000,
          intervalLabel: "15m",
          observedAtMs: 1_779_164_000_000,
          heatScore: 99,
          status: "copy_ready",
        },
        {
          id: "newer-warm",
          wallet: "0x1111222233334444555566667777888899990000",
          manager: "manager-warm",
          market: "BTC-USD",
          side: "DOWN",
          strike: 71_000,
          expiryMs: 1_779_158_400_000,
          intervalLabel: "15m",
          observedAtMs: 1_779_165_000_000,
          heatScore: 12,
          status: "watching",
        },
      ],
      8,
      { nowMs: 1_779_165_000_000 },
    );

    expect(preview.rows.map((row) => row.id)).toEqual(["newer-warm", "older-hot"]);
  });

  test("can reorder market heat rows by heat score", () => {
    const preview = buildMarketHeatPreview(
      [
        {
          id: "newer-warm",
          wallet: "0x1111222233334444555566667777888899990000",
          manager: "manager-warm",
          market: "BTC-USD",
          side: "DOWN",
          strike: 71_000,
          expiryMs: 1_779_158_400_000,
          intervalLabel: "15m",
          observedAtMs: 1_779_165_000_000,
          heatScore: 12,
          status: "watching",
        },
        {
          id: "older-hot",
          wallet: "0x9999222233334444555566667777888899990000",
          manager: "manager-hot",
          market: "BTC-USD",
          side: "UP",
          strike: 70_000,
          expiryMs: 1_779_158_400_000,
          intervalLabel: "15m",
          observedAtMs: 1_779_164_000_000,
          heatScore: 99,
          status: "copy_ready",
        },
      ],
      8,
      { nowMs: 1_779_165_000_000 },
    );

    expect(sortMarketHeatRows(preview.rows, "heat").map((row) => row.id)).toEqual([
      "older-hot",
      "newer-warm",
    ]);
  });

  test("keeps captured testnet API source labels compact", async () => {
    const preview = await loadMarketHeatPreview({
      apiBaseUrl: "https://api.hot-hands.test/",
      nowMs: 1_779_165_000_000,
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
              observedAtMs: 1_779_165_000_000,
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
      nowMs: 1_779_165_000_000,
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
              observedAtMs: 1_779_165_000_000,
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
      statusLabel: "just now",
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
