import { describe, expect, test } from "bun:test";
import {
  MARKET_HEAT_PREVIEW_ROWS,
  buildMarketHeatIntentPanel,
  buildMarketHeatPreview,
  closeMarketHeatIntent,
  loadMarketHeatPreview,
  selectMarketHeatIntent,
  selectVisibleMarketHeatRows,
  sortMarketHeatRows,
} from "../src/marketHeatModel";

describe("market heat preview model", () => {
  test("builds a compact external wallet watch preview from captured rows", () => {
    const preview = buildMarketHeatPreview(MARKET_HEAT_PREVIEW_ROWS, 8, {
      nowMs: 1_779_165_600_000,
      timeZone: "America/Los_Angeles",
    });

    expect(preview).toEqual({
      title: "Alpha Feed",
      modeLabel: "Testnet",
      actionLabel: "Copy",
      detailLabel: "Live BTC Predict mints",
      sourceLabel: "Captured",
      marketPrice: {
        marketLabel: "BTC/USD",
        priceLabel: "$102,480",
        statusLabel: "Captured",
      },
      rows: [
        {
          id: "external-0x84d2",
          displayName: "0x84d2...91af",
          manager: "Manager 0xb795...3125",
          pairLabel: "BTC/USD",
          side: "UP",
          strikeLabel: "Strike $12,400",
          intervalLabel: "15m",
          expiryMs: 1_779_158_400_000,
          expiryTimeLabel: "May 18, 19:40 PDT",
          observedAtMs: 1_779_158_400_000,
          heatScore: 92,
          actionLabel: "Watch next",
          status: "watching",
          statusLabel: "2h ago",
        },
        {
          id: "external-0x28b7",
          displayName: "0x28b7...4c10",
          manager: "Manager 0x43af...e64",
          pairLabel: "BTC/USD",
          side: "DOWN",
          strikeLabel: "Strike $7,800",
          intervalLabel: "1h",
          expiryMs: 1_779_158_400_000,
          expiryTimeLabel: "May 18, 19:40 PDT",
          observedAtMs: 1_779_151_200_000,
          heatScore: 87,
          actionLabel: "Watch next",
          status: "watching",
          statusLabel: "4h ago",
        },
        {
          id: "external-0x6f09",
          displayName: "0x6f09...aa35",
          manager: "Manager 0xc873...028a",
          pairLabel: "BTC/USD",
          side: "UP",
          strikeLabel: "Strike $4,200",
          intervalLabel: "1d",
          expiryMs: 1_779_158_400_000,
          expiryTimeLabel: "May 18, 19:40 PDT",
          observedAtMs: 1_779_079_200_000,
          heatScore: 81,
          actionLabel: "Watch next",
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
      actionLabel: "Watch next",
      closeLabel: "Cancel",
      detailLabel: "Next observed mint",
      signatureLabel: "We'll watch this wallet and prepare the next mint for your signature",
      statusLabel: "4h ago",
      title: "Watch 0x28b7...4c10",
    });
    expect(closeMarketHeatIntent(selected)).toEqual({ selectedRowId: null });
  });

  test("labels copy-now intent only when an observed mint is available", () => {
    const [copyReadyRow] = buildMarketHeatPreview(MARKET_HEAT_PREVIEW_ROWS, 8, {
      nowMs: 1_779_158_000_000,
    }).rows;

    expect(buildMarketHeatIntentPanel(copyReadyRow)).toEqual({
      actionLabel: "Copy now",
      closeLabel: "Cancel",
      detailLabel: "Recent mint",
      signatureLabel: "Ready for your wallet signature",
      statusLabel: "just now",
      title: "Copy 0x84d2...91af",
    });
  });

  test("loads market heat rows from the configured testnet API", async () => {
    const calls: string[] = [];
    const preview = await loadMarketHeatPreview({
      apiBaseUrl: "https://api.hot-hands.test/",
      nowMs: 1_779_165_000_000,
      timeZone: "America/Los_Angeles",
      fetcher: async (url) => {
        calls.push(String(url));

        return Response.json({
          mode: "testnet",
          source: "api",
          marketPrice: {
            market: "BTC-USD",
            price: 71234,
            source: "live_testnet",
          },
          markets: [
            {
              oracleId: "0xoracle15",
              market: "BTC-USD",
              intervalLabel: "15m",
              expiryMs: 1_779_165_900_000,
              strikeCandidatePrice: 71_000,
              status: "active",
            },
            {
              oracleId: "0xoracle2h",
              market: "BTC-USD",
              intervalLabel: "2h",
              expiryMs: 1_779_172_200_000,
              strikeCandidatePrice: 72_000,
              status: "active",
            },
          ],
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
    expect(preview.marketPrice).toEqual({
      marketLabel: "BTC/USD",
      priceLabel: "$71,234",
      statusLabel: "Live Testnet",
    });
    expect(preview.availableMarkets).toEqual([
      {
        id: "0xoracle15-1779165900000-71000",
        oracleId: "0xoracle15",
        pairLabel: "BTC/USD",
        intervalLabel: "15m",
        expiryMs: 1_779_165_900_000,
        expiryTimeLabel: "May 18, 21:45 PDT",
        strike: 71_000,
        strikeLabel: "$71,000",
        status: "active",
      },
      {
        id: "0xoracle2h-1779172200000-72000",
        oracleId: "0xoracle2h",
        pairLabel: "BTC/USD",
        intervalLabel: "2h",
        expiryMs: 1_779_172_200_000,
        expiryTimeLabel: "May 18, 23:30 PDT",
        strike: 72_000,
        strikeLabel: "$72,000",
        status: "active",
      },
    ]);
    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0]).toMatchObject({
      id: "external-0x1111",
      displayName: "0x1111...0000",
      manager: "Manager 0xabcd...0001",
      pairLabel: "BTC/USD",
      side: "DOWN",
      strikeLabel: "Strike $3,400",
      intervalLabel: "1h",
      expiryTimeLabel: "May 18, 19:40 PDT",
      actionLabel: "Watch next",
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
    const rows = Array.from({ length: 60 }, (_, index) => ({
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

    expect(preview.rows).toHaveLength(60);
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

  test("hides expired market rows before latest and heat sorting unless requested", () => {
    const preview = buildMarketHeatPreview(
      [
        {
          id: "expired-hot",
          wallet: "0x9999222233334444555566667777888899990000",
          manager: "manager-hot",
          market: "BTC-USD",
          side: "UP",
          strike: 70_000,
          expiryMs: 1_779_164_000_000,
          intervalLabel: "15m",
          observedAtMs: 1_779_165_000_000,
          heatScore: 99,
          status: "copy_ready",
        },
        {
          id: "live-warm",
          wallet: "0x1111222233334444555566667777888899990000",
          manager: "manager-warm",
          market: "BTC-USD",
          side: "DOWN",
          strike: 71_000,
          expiryMs: 1_779_166_000_000,
          intervalLabel: "15m",
          observedAtMs: 1_779_164_000_000,
          heatScore: 12,
          status: "watching",
        },
      ],
      8,
      { nowMs: 1_779_165_000_000 },
    );

    expect(
      selectVisibleMarketHeatRows(preview.rows, {
        nowMs: 1_779_165_000_000,
        showExpired: false,
        sortMode: "latest",
      }).map((row) => row.id),
    ).toEqual(["live-warm"]);
    expect(
      selectVisibleMarketHeatRows(preview.rows, {
        nowMs: 1_779_165_000_000,
        showExpired: false,
        sortMode: "heat",
      }).map((row) => row.id),
    ).toEqual(["live-warm"]);
    expect(
      selectVisibleMarketHeatRows(preview.rows, {
        nowMs: 1_779_165_000_000,
        showExpired: true,
        sortMode: "heat",
      }).map((row) => row.id),
    ).toEqual(["expired-hot", "live-warm"]);
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
      pairLabel: "BTC/USD",
      side: "UP",
      strikeLabel: "Strike $67,000",
      intervalLabel: "15m",
      actionLabel: "Copy now",
      status: "copy_ready",
      statusLabel: "5m ago",
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
      pairLabel: "BTC/USD",
      side: "DOWN",
      intervalLabel: "1d",
      actionLabel: "Watch next",
      statusLabel: "just now",
    });
  });

  test("uses captured rows when no API URL is configured", async () => {
    const nowMs = Date.UTC(2026, 5, 1, 12, 0, 0);
    const preview = await loadMarketHeatPreview({
      apiBaseUrl: "",
      nowMs,
      fetcher: async () => {
        throw new Error("fetcher should not be called without an API URL");
      },
    });

    expect(preview.sourceLabel).toBe("Captured");
    expect(preview.rows[0]?.id).toBe(MARKET_HEAT_PREVIEW_ROWS[0]?.id);
    expect(preview.rows[0]).toMatchObject({
      actionLabel: "Copy now",
      status: "copy_ready",
      statusLabel: "5m ago",
    });
  });

  test("falls back to captured rows when the testnet API request fails", async () => {
    const nowMs = Date.UTC(2026, 5, 1, 12, 0, 0);
    const preview = await loadMarketHeatPreview({
      apiBaseUrl: "https://api.hot-hands.test",
      nowMs,
      fetcher: async () => {
        throw new Error("offline");
      },
    });

    expect(preview.sourceLabel).toBe("Captured");
    expect(preview.rows[0]?.id).toBe(MARKET_HEAT_PREVIEW_ROWS[0]?.id);
    expect(preview.rows[0]?.actionLabel).toBe("Copy now");
  });
});
