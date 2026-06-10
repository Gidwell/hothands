import { describe, expect, test } from "bun:test";
import {
  MARKET_HEAT_PREVIEW_ROWS,
  buildMarketDurationOptions,
  buildMarketHeatIntentPanel,
  buildMarketHeatPreview,
  closeMarketHeatIntent,
  loadMarketHeatPreview,
  loadMarketHeatPriceSnapshot,
  loadTradeQuote,
  buildTradeMarketLadder,
  buildTradeMarketForMarketHeatRow,
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
          wallet: "0x84d2f193f73f9d5f2bb0fe47238bc8c2441b91af",
          displayName: "0x84d2...91af",
          manager: "Manager 0xb795...3125",
          pairLabel: "BTC/USD",
          side: "UP",
          strike: 12_400,
          strikeLabel: "Strike $12,400",
          intervalLabel: "15m",
          expiryMs: 1_779_158_400_000,
          expiryTimeLabel: "May 18, 19:40 PDT",
          timeRemainingLabel: "Expired",
          observedAtMs: 1_779_158_400_000,
          heatScore: 92,
          actionLabel: "Copy now",
          status: "watching",
          statusLabel: "2h ago",
        },
        {
          id: "external-0x28b7",
          wallet: "0x28b7a9cd430a1d7ec8c90f0cb74b212ad8934c10",
          displayName: "0x28b7...4c10",
          manager: "Manager 0x43af...e64",
          pairLabel: "BTC/USD",
          side: "DOWN",
          strike: 7_800,
          strikeLabel: "Strike $7,800",
          intervalLabel: "1h",
          expiryMs: 1_779_158_400_000,
          expiryTimeLabel: "May 18, 19:40 PDT",
          timeRemainingLabel: "Expired",
          observedAtMs: 1_779_151_200_000,
          heatScore: 87,
          actionLabel: "Copy now",
          status: "watching",
          statusLabel: "4h ago",
        },
        {
          id: "external-0x6f09",
          wallet: "0x6f098d1adf9c8b603452dc72cb9096da0c82aa35",
          displayName: "0x6f09...aa35",
          manager: "Manager 0xc873...028a",
          pairLabel: "BTC/USD",
          side: "UP",
          strike: 4_200,
          strikeLabel: "Strike $4,200",
          intervalLabel: "1d",
          expiryMs: 1_779_158_400_000,
          expiryTimeLabel: "May 18, 19:40 PDT",
          timeRemainingLabel: "Expired",
          observedAtMs: 1_779_079_200_000,
          heatScore: 81,
          actionLabel: "Copy now",
          status: "watching",
          statusLabel: "1d ago",
        },
      ],
    });
  });

  test("formats local timezone offsets with UTC labels", () => {
    const preview = buildMarketHeatPreview(
      [
        {
          id: "tokyo-expiry",
          wallet: "0x1111222233334444555566667777888899990000",
          manager: "manager 0xabcd...0001",
          market: "BTC-USD",
          side: "UP",
          strike: 60_914,
          expiryMs: Date.UTC(2026, 5, 7, 8, 0, 0),
          intervalLabel: "1d",
          observedAtMs: Date.UTC(2026, 5, 7, 7, 0, 0),
          heatScore: 74,
          status: "copy_ready",
        },
      ],
      1,
      {
        nowMs: Date.UTC(2026, 5, 7, 7, 0, 0),
        timeZone: "Asia/Tokyo",
      },
    );

    expect(preview.rows[0]?.expiryTimeLabel).toBe("Jun 7, 17:00 UTC+9");
  });

  test("collapses repeated feed fills into one visible row with fill counts", () => {
    const nowMs = 1_779_158_000_000;
    const expiryMs = nowMs + 60 * 60_000;
    const duplicateFillBase = {
      wallet: "0x5e2a00000000000000000000000000000000efb6",
      manager: "manager 0xfeed...cafe",
      oracleId: "oracle-duplicate",
      market: "BTC-USD",
      side: "DOWN" as const,
      strike: 63_187,
      strikeRaw: 63_187_000_000,
      expiryMs,
      intervalLabel: "1h",
      status: "copy_ready" as const,
    };
    const preview = buildMarketHeatPreview(
      [
        {
          ...duplicateFillBase,
          id: "fill-a",
          observedAtMs: nowMs - 60_000,
          heatScore: 56,
          quantity: 50_000_000,
          cost: 25_000_000,
          costUsd: 25,
        },
        {
          ...duplicateFillBase,
          id: "fill-b",
          observedAtMs: nowMs - 30_000,
          heatScore: 61,
          quantity: 25_000_000,
          cost: 12_500_000,
          costUsd: 12.5,
        },
      ],
      8,
      { nowMs },
    );
    const [row] = preview.rows;
    const [market] = buildTradeMarketLadder(preview, { nowMs });

    expect(preview.rows).toHaveLength(1);
    expect(row?.id).toBe("fill-b");
    expect(row?.fillCount).toBe(2);
    expect(row?.fillSummaryLabel).toBe("2 fills · $37.50 total");
    expect(row?.quantity).toBe(75_000_000);
    expect(row?.cost).toBe(37_500_000);
    expect(row?.costUsd).toBe(37.5);
    expect(row?.heatScore).toBe(61);
    expect(market?.tradeCount).toBe(2);
    expect(market?.down.tradeCount).toBe(2);
    expect(market?.volumeUsd).toBe(37.5);
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
      actionLabel: "Copy now",
      closeLabel: "Cancel",
      detailLabel: "Next observed mint",
      signatureLabel: "We'll watch this wallet and prepare the next mint for your signature",
      statusLabel: "4h ago",
      title: "Copy 0x28b7...4c10",
    });
    expect(closeMarketHeatIntent(selected)).toEqual({ selectedRowId: null });
  });

  test("labels copy intent as wallet-ready when an observed mint is available", () => {
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
              expiry: 1_779_165_900_000,
              expiryMs: 1_779_165_900_000,
              strikeCandidate: 71_000_000_000,
              strikeCandidatePrice: 71_000,
              status: "active",
            },
            {
              oracleId: "0xoracle2h",
              market: "BTC-USD",
              intervalLabel: "2h",
              expiry: 1_779_172_200_000,
              expiryMs: 1_779_172_200_000,
              strikeCandidate: 72_000_000_000,
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
              walletStats: {
                totalPnl: 22_230_000,
                currentStreakType: "win",
                currentStreakLength: 12,
                lastSeenMs: 1_779_164_940_000,
              },
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
        id: "0xoracle15-1779165900000",
        oracleId: "0xoracle15",
        pairLabel: "BTC/USD",
        intervalLabel: "15m",
        expiry: 1_779_165_900_000,
        expiryMs: 1_779_165_900_000,
        expiryTimeLabel: "May 18, 21:45 PDT",
        strike: 71_000,
        strikeRaw: 71_000_000_000,
        strikeLabel: "$71,000",
        status: "active",
      },
      {
        id: "0xoracle2h-1779172200000",
        oracleId: "0xoracle2h",
        pairLabel: "BTC/USD",
        intervalLabel: "1h",
        expiry: 1_779_172_200_000,
        expiryMs: 1_779_172_200_000,
        expiryTimeLabel: "May 18, 23:30 PDT",
        strike: 72_000,
        strikeRaw: 72_000_000_000,
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
      actionLabel: "Copy now",
      statusLabel: "just now",
      walletStatsLabel: "+$22.23 · 12 wins · just now",
    });
  });

  test("requests expired market heat rows when the feed includes expired positions", async () => {
    const calls: string[] = [];

    await loadMarketHeatPreview({
      apiBaseUrl: "https://api.hot-hands.test/",
      includeExpired: true,
      nowMs: 1_779_165_000_000,
      fetcher: async (url) => {
        calls.push(String(url));

        return Response.json({
          mode: "testnet",
          source: "indexed_testnet",
          rows: [],
        });
      },
    });

    expect(calls).toEqual([
      "https://api.hot-hands.test/testnet/market-heat?includeExpired=true",
    ]);
  });

  test("refreshes the market price from the lightweight testnet snapshot endpoint", async () => {
    const calls: string[] = [];
    const currentPreview = buildMarketHeatPreview(MARKET_HEAT_PREVIEW_ROWS, 8, {
      nowMs: 1_779_165_000_000,
    });

    const preview = await loadMarketHeatPriceSnapshot(currentPreview, {
      apiBaseUrl: "https://api.hot-hands.test/",
      nowMs: 1_779_165_100_000,
      fetcher: async (url) => {
        calls.push(String(url));

        return Response.json({
          source: "indexed_testnet",
          capturedAt: "2026-05-18T04:45:00.000Z",
          marketPrice: {
            market: "BTC-USD",
            price: 72_345.67,
            source: "indexed_testnet",
          },
        });
      },
    });

    expect(calls).toEqual(["https://api.hot-hands.test/testnet/price-snapshot"]);
    expect(preview.rows).toEqual(currentPreview.rows);
    expect(preview.availableMarkets).toEqual(currentPreview.availableMarkets);
    expect(preview.marketPrice).toEqual({
      marketLabel: "BTC/USD",
      priceLabel: "$72,346",
      statusLabel: "Indexed Testnet",
    });
  });

  test("falls back to the full market heat payload when the price snapshot is unavailable", async () => {
    const calls: string[] = [];
    const currentPreview = buildMarketHeatPreview(MARKET_HEAT_PREVIEW_ROWS, 8, {
      nowMs: 1_779_165_000_000,
    });

    const preview = await loadMarketHeatPriceSnapshot(currentPreview, {
      apiBaseUrl: "https://api.hot-hands.test/",
      nowMs: 1_779_165_100_000,
      fetcher: async (url) => {
        calls.push(String(url));

        if (String(url).endsWith("/testnet/price-snapshot")) {
          return new Response(null, { status: 404 });
        }

        return Response.json({
          mode: "testnet",
          source: "api",
          marketPrice: {
            market: "BTC-USD",
            price: 71_234,
            source: "live_testnet",
          },
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

    expect(calls).toEqual([
      "https://api.hot-hands.test/testnet/price-snapshot",
      "https://api.hot-hands.test/testnet/market-heat",
    ]);
    expect(preview.marketPrice.priceLabel).toBe("$71,234");
    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0].id).toBe("external-0x1111");
  });

  test("uses oracle SVI pricing for trade ladder indicative prices", async () => {
    const nowMs = 1_779_165_000_000;
    const expiryMs = nowMs + 15 * 60_000;
    const preview = await loadMarketHeatPreview({
      apiBaseUrl: "https://api.hot-hands.test/",
      nowMs,
      fetcher: async () =>
        Response.json({
          mode: "testnet",
          source: "indexed_testnet",
          marketPrice: {
            market: "BTC-USD",
            price: 71_000,
            source: "indexed_testnet",
          },
          markets: [
            {
              oracleId: "0xoracle15",
              market: "BTC-USD",
              intervalLabel: "15m",
              expiry: expiryMs,
              expiryMs,
              strikeCandidate: 71_000_000_000,
              strikeCandidatePrice: 71_000,
              status: "active",
              pricingModel: {
                forward: 71_000_000_000,
                forwardPrice: 71_000,
                a: 40_000_000,
                b: 0,
                rho: 0,
                m: 0,
                sigma: 150_000_000,
                timestampMs: nowMs,
              },
            },
          ],
          rows: [
            {
              id: "mint-oracle-priced",
              oracleId: "0xoracle15",
              wallet: "0x1111222233334444555566667777888899990000",
              manager: "manager-a",
              market: "BTC-USD",
              side: "UP",
              strike: 71_000,
              strikeRaw: 71_000_000_000,
              expiryMs,
              intervalLabel: "15m",
              observedAtMs: nowMs,
              heatScore: 10,
              status: "copy_ready",
              quantity: 100_000_000,
              cost: 90_000_000,
            },
          ],
        }),
    });
    const [market] = buildTradeMarketLadder(preview, { nowMs });

    expect(market.pricingModel).toMatchObject({
      forward: 71_000_000_000,
      a: 40_000_000,
    });
    expect(market.up.estimatedPrice).toBeCloseTo(0.4602, 3);
    expect(market.down.estimatedPrice).toBeCloseTo(0.5398, 3);
  });

  test("overlays mainnet SuiNS names on market heat rows when requested", async () => {
    const wallet = "0x1111222233334444555566667777888899990000";
    const calls: string[] = [];
    const preview = await loadMarketHeatPreview({
      apiBaseUrl: "https://api.hot-hands.test/",
      nowMs: 1_779_165_000_000,
      useMainnetSuinsNames: true,
      fetcher: async (url) => {
        calls.push(String(url));

        if (String(url).includes("/testnet/mainnet-suins-names")) {
          return Response.json({
            source: "mainnet_suins",
            network: "mainnet",
            names: [
              {
                wallet,
                name: "alice.sui",
                source: "mainnet_suins",
              },
            ],
          });
        }

        return Response.json({
          mode: "testnet",
          source: "indexed_testnet",
          marketPrice: {
            market: "BTC-USD",
            price: 71234,
            source: "live_testnet",
          },
          rows: [
            {
              id: "external-0x1111",
              wallet,
              manager: "manager 0xabcd...0001",
              market: "BTC-USD",
              side: "UP",
              strike: 71000,
              expiryMs: 1_779_165_900_000,
              intervalLabel: "15m",
              observedAtMs: 1_779_165_000_000,
              heatScore: 74,
              status: "copy_ready",
            },
          ],
        });
      },
    });

    expect(calls).toEqual([
      "https://api.hot-hands.test/testnet/market-heat",
      `https://api.hot-hands.test/testnet/mainnet-suins-names?wallet=${wallet}`,
    ]);
    expect(preview.rows[0]).toMatchObject({
      wallet,
      displayName: "alice.sui",
      displayNameSource: "mainnet_suins",
    });
  });

  test("keeps parsed trade market ids stable when live strike candidates update", async () => {
    const expiryMs = 1_779_165_900_000;
    const loadForStrike = (strikeCandidatePrice: number) =>
      loadMarketHeatPreview({
        apiBaseUrl: "https://api.hot-hands.test/",
        nowMs: 1_779_165_000_000,
        fetcher: async () =>
          Response.json({
            mode: "testnet",
            source: "live_testnet",
            marketPrice: {
              market: "BTC-USD",
              price: strikeCandidatePrice,
              source: "live_testnet",
            },
            markets: [
              {
                oracleId: "0xoracle15",
                market: "BTC-USD",
                intervalLabel: "15m",
                expiry: expiryMs,
                expiryMs,
                strikeCandidate: strikeCandidatePrice * 1_000_000,
                strikeCandidatePrice,
                status: "active",
              },
            ],
            rows: [
              {
                id: "external-0x1111",
                oracleId: "0xoracle15",
                wallet: "0x1111222233334444555566667777888899990000",
                manager: "manager 0xabcd...0001",
                market: "BTC-USD",
                side: "UP",
                strike: strikeCandidatePrice,
                expiryMs,
                intervalLabel: "15m",
                observedAtMs: 1_779_165_000_000,
                heatScore: 74,
                status: "copy_ready",
              },
            ],
          }),
      });

    const first = await loadForStrike(71_000);
    const updated = await loadForStrike(71_050);

    expect(first.availableMarkets?.[0]).toMatchObject({
      id: "0xoracle15-1779165900000",
      strikeLabel: "$71,000",
    });
    expect(updated.availableMarkets?.[0]).toMatchObject({
      id: "0xoracle15-1779165900000",
      strikeLabel: "$71,050",
    });
  });

  test("loads a trade quote for the selected ladder row and spend amount", async () => {
    const nowMs = 1_779_165_000_000;
    const expiryMs = nowMs + 15 * 60_000;
    const [market] = buildTradeMarketLadder(
      {
        ...buildMarketHeatPreview([], 8, {
          marketPrice: {
            market: "BTC-USD",
            price: 71_050,
            source: "live_testnet",
          },
          nowMs,
          timeZone: "America/Los_Angeles",
        }),
        availableMarkets: [
          {
            id: "0xoracle15-1779165900000",
            oracleId: "0xoracle15",
            pairLabel: "BTC/USD",
            intervalLabel: "15m",
            expiry: 1_779_165_900_000,
            expiryMs,
            expiryTimeLabel: "May 18, 21:15 PDT",
            strike: 71_100,
            strikeRaw: 71_100_000_000,
            strikeLabel: "$71,100",
            status: "active",
          },
        ],
      },
      { nowMs },
    );
    const calls: string[] = [];

    const quote = await loadTradeQuote({
      apiBaseUrl: "https://api.hot-hands.test/",
      market,
      side: "UP",
      spendUsd: 25,
      fetcher: async (url) => {
        calls.push(String(url));

        return Response.json({
          source: "live_testnet",
          market: "BTC-USD",
          oracleId: "0xoracle15",
          expiry: "1779165900000",
          strike: "71100000000",
          side: "UP",
          requestedSpendUsd: 25,
          cost: "24980000",
          costUsd: 24.98,
          quantity: "49960000",
          payoutUsd: 49.96,
          maxProfitUsd: 24.98,
          redeemPayout: "24100000",
          redeemPayoutUsd: 24.1,
          effectivePrice: 0.5,
          quoteStatus: "ready",
        });
      },
    });

    expect(calls).toEqual([
      "https://api.hot-hands.test/testnet/quote?oracleId=0xoracle15&expiry=1779165900000&strike=71100000000&side=UP&spendUsd=25",
    ]);
    expect(quote).toEqual({
      source: "live_testnet",
      market: "BTC-USD",
      oracleId: "0xoracle15",
      expiry: "1779165900000",
      strike: "71100000000",
      side: "UP",
      requestedSpendUsd: 25,
      cost: "24980000",
      costUsd: 24.98,
      quantity: "49960000",
      payoutUsd: 49.96,
      maxProfitUsd: 24.98,
      redeemPayout: "24100000",
      redeemPayoutUsd: 24.1,
      effectivePrice: 0.5,
      quoteStatus: "ready",
    });
  });

  test("returns null when trade quote requests fail or time out", async () => {
    const nowMs = 1_779_165_000_000;
    const expiryMs = nowMs + 15 * 60_000;
    const [market] = buildTradeMarketLadder(
      {
        ...buildMarketHeatPreview([], 8, {
          marketPrice: {
            market: "BTC-USD",
            price: 71_050,
            source: "live_testnet",
          },
          nowMs,
        }),
        availableMarkets: [
          {
            id: "0xoracle15-1779165900000",
            oracleId: "0xoracle15",
            pairLabel: "BTC/USD",
            intervalLabel: "15m",
            expiry: 1_779_165_900_000,
            expiryMs,
            expiryTimeLabel: "May 18, 21:15 PDT",
            strike: 71_100,
            strikeRaw: 71_100_000_000,
            strikeLabel: "$71,100",
            status: "active",
          },
        ],
      },
      { nowMs },
    );
    const failedQuote = await loadTradeQuote({
      apiBaseUrl: "https://api.hot-hands.test/",
      market,
      side: "UP",
      spendUsd: 25,
      fetcher: async () => {
        throw new Error("upstream unavailable");
      },
    });
    let aborted = false;
    const timedOutQuote = await loadTradeQuote({
      apiBaseUrl: "https://api.hot-hands.test/",
      market,
      side: "UP",
      spendUsd: 25,
      timeoutMs: 1,
      fetcher: ((_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => {
              aborted = true;
              reject(new Error("aborted"));
            },
            { once: true },
          );
        })) as typeof fetch,
    });

    expect(failedQuote).toBeNull();
    expect(timedOutQuote).toBeNull();
    expect(aborted).toBe(true);
  });

  test("builds trade ladder rows with market activity and moneyness", () => {
    const nowMs = 1_779_165_000_000;
    const expiryMs = nowMs + 15 * 60_000;
    const preview = {
      ...buildMarketHeatPreview(
        [
          {
            id: "mint-a",
            oracleId: "0xoracle15",
            wallet: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            manager: "manager-a",
            market: "BTC-USD",
            side: "UP" as const,
            strike: 71_000,
            expiryMs,
            intervalLabel: "15m",
            observedAtMs: nowMs - 60_000,
            heatScore: 90,
            status: "copy_ready" as const,
            quantity: 30_000_000,
            costUsd: 14.25,
          },
          {
            id: "mint-b",
            oracleId: "0xoracle15",
            wallet: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            manager: "manager-b",
            market: "BTC-USD",
            side: "DOWN" as const,
            strike: 70_900,
            expiryMs,
            intervalLabel: "15m",
            observedAtMs: nowMs - 2 * 60_000,
            heatScore: 80,
            status: "copy_ready" as const,
            quantity: 20_000_000,
            cost: 9_500_000,
          },
        ],
        8,
        {
          marketPrice: {
            market: "BTC-USD",
            price: 71_050,
            source: "live_testnet",
          },
          nowMs,
          timeZone: "America/Los_Angeles",
        },
      ),
      availableMarkets: [
        {
          id: "0xoracle15-1779165900000",
          oracleId: "0xoracle15",
          pairLabel: "BTC/USD",
          intervalLabel: "15m",
          expiry: expiryMs,
          expiryMs,
          expiryTimeLabel: "May 18, 21:15 PDT",
          strike: 71_100,
          strikeRaw: 71_100_000_000,
          strikeLabel: "$71,100",
          status: "active",
        },
      ],
    };

    expect(buildTradeMarketLadder(preview, { nowMs })).toEqual([
      {
        id: "0xoracle15-1779165900000",
        oracleId: "0xoracle15",
        pairLabel: "BTC/USD",
        intervalLabel: "15m",
        roundLabel: "15m round",
        expiry: expiryMs,
        expiryMs,
        expiryTimeLabel: "May 18, 21:15 PDT",
        timeRemainingLabel: "15m left",
        strike: 71_100,
        strikeRaw: 71_100_000_000,
        strikeLabel: "$71,100",
        moneynessLabel: "+$50 vs spot",
        activityLabel: "2 wallets · 2 trades · $23.75",
        uniqueWalletCount: 2,
        tradeCount: 2,
        distinctStrikeCount: 2,
        strikeOptions: [
          {
            strike: 70_900,
            strikeRaw: 70_900_000_000,
            strikeLabel: "$70,900",
          },
          {
            strike: 71_000,
            strikeRaw: 71_000_000_000,
            strikeLabel: "$71,000",
          },
          {
            strike: 71_100,
            strikeRaw: 71_100_000_000,
            strikeLabel: "$71,100",
          },
        ],
        volumeUsd: 23.75,
        volumeLabel: "$23.75",
        up: {
          walletCount: 1,
          tradeCount: 1,
          volumeUsd: 14.25,
          volumeLabel: "$14.25",
          estimatedPrice: 0.475,
        },
        down: {
          walletCount: 1,
          tradeCount: 1,
          volumeUsd: 9.5,
          volumeLabel: "$9.50",
          estimatedPrice: 0.475,
        },
      },
    ]);
  });

  test("resolves a copy-ready feed row to a trade market using the observed strike", async () => {
    const nowMs = 1_779_165_000_000;
    const expiryMs = nowMs + 15 * 60_000;
    const preview = {
      ...buildMarketHeatPreview(
        [
          {
            id: "mint-a",
            oracleId: "0xoracle15",
            wallet: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            manager: "manager-a",
            market: "BTC-USD",
            side: "UP" as const,
            strike: 71_000,
            strikeRaw: 71_000_123_456,
            expiryMs,
            intervalLabel: "15m",
            observedAtMs: nowMs - 60_000,
            heatScore: 90,
            status: "copy_ready" as const,
            quantity: 30_000_000,
            costUsd: 14.25,
          },
          {
            id: "mint-b",
            oracleId: "0xoracle15",
            wallet: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            manager: "manager-b",
            market: "BTC-USD",
            side: "UP" as const,
            strike: 71_120,
            strikeRaw: 71_120_000_000,
            expiryMs,
            intervalLabel: "15m",
            observedAtMs: nowMs - 90_000,
            heatScore: 88,
            status: "copy_ready" as const,
            quantity: 10_000_000,
            costUsd: 7.5,
          },
        ],
        8,
        {
          marketPrice: {
            market: "BTC-USD",
            price: 71_050,
            source: "live_testnet",
          },
          nowMs,
        },
      ),
      availableMarkets: [
        {
          id: "0xoracle15-1779165900000",
          oracleId: "0xoracle15",
          pairLabel: "BTC/USD",
          intervalLabel: "15m",
          expiry: expiryMs,
          expiryMs,
          expiryTimeLabel: "May 18, 21:15 PDT",
          strike: 71_100,
          strikeRaw: 71_100_000_000,
          strikeLabel: "$71,100",
          status: "active",
        },
      ],
    };

    const copyTrade = buildTradeMarketForMarketHeatRow(preview, "mint-a", { nowMs });
    expect(copyTrade).toEqual({
      row: expect.objectContaining({
        id: "mint-a",
        side: "UP",
      }),
      market: expect.objectContaining({
        oracleId: "0xoracle15",
        expiry: expiryMs,
        strike: 71_000,
        strikeRaw: 71_000_123_456,
        strikeLabel: "$71,000",
        moneynessLabel: "-$50 vs spot",
        up: expect.objectContaining({
          estimatedPrice: 0.475,
        }),
      }),
    });

    const calls: string[] = [];
    await loadTradeQuote({
      apiBaseUrl: "https://api.hot-hands.test/",
      market: copyTrade!.market,
      side: copyTrade!.row.side,
      spendUsd: 25,
      fetcher: async (url) => {
        calls.push(String(url));

        return Response.json({
          source: "live_testnet",
          market: "BTC-USD",
          oracleId: "0xoracle15",
          expiry: String(expiryMs),
          strike: "71000123456",
          side: "UP",
          requestedSpendUsd: 25,
          cost: "24980000",
          costUsd: 24.98,
          quantity: "49960000",
          payoutUsd: 49.96,
          maxProfitUsd: 24.98,
          redeemPayout: "24100000",
          redeemPayoutUsd: 24.1,
          effectivePrice: 0.5,
          quoteStatus: "ready",
        });
      },
    });

    expect(calls).toEqual([
      `https://api.hot-hands.test/testnet/quote?oracleId=0xoracle15&expiry=${expiryMs}&strike=71000123456&side=UP&spendUsd=25&estimatedPrice=0.475`,
    ]);
  });

  test("uses raw atomic cost for dust copy rows whose display cost rounds to zero", async () => {
    const nowMs = 1_779_165_000_000;
    const expiryMs = nowMs + 24 * 60 * 60_000;
    const preview = {
      ...buildMarketHeatPreview(
        [
          {
            id: "mint-dust",
            oracleId: "0xoracle-dust",
            wallet: "0xa9f24640b32f33fcfa8582791e84a542251398acfc3b696f382a08a768b6ddbf",
            manager: "manager-dust",
            market: "BTC-USD",
            side: "UP" as const,
            strike: 61_882,
            strikeRaw: 61_882_000_000,
            expiryMs,
            intervalLabel: "23d",
            observedAtMs: nowMs - 60_000,
            heatScore: 16,
            status: "copy_ready" as const,
            quantity: 2,
            cost: 1,
            costUsd: 0.000001,
          },
        ],
        8,
        {
          marketPrice: {
            market: "BTC-USD",
            price: 61_800,
            source: "indexed_testnet",
          },
          nowMs,
        },
      ),
      availableMarkets: [
        {
          id: "0xoracle-dust-1779258000000",
          oracleId: "0xoracle-dust",
          pairLabel: "BTC/USD",
          intervalLabel: "23d",
          expiry: expiryMs,
          expiryMs,
          expiryTimeLabel: "May 19, 21:15 PDT",
          strike: 61_882,
          strikeRaw: 61_882_000_000,
          strikeLabel: "$61,882",
          status: "active",
        },
      ],
    };

    const copyTrade = buildTradeMarketForMarketHeatRow(preview, "mint-dust", { nowMs });

    expect(copyTrade?.market.up.estimatedPrice).toBe(0.5);

    const calls: string[] = [];
    await loadTradeQuote({
      apiBaseUrl: "https://api.hot-hands.test/",
      market: copyTrade!.market,
      side: copyTrade!.row.side,
      spendUsd: 25,
      fetcher: async (url) => {
        calls.push(String(url));

        return Response.json({
          source: "live_testnet",
          market: "BTC-USD",
          oracleId: "0xoracle-dust",
          expiry: String(expiryMs),
          strike: "61882000000",
          side: "UP",
          requestedSpendUsd: 25,
          cost: "25000000",
          costUsd: 25,
          quantity: "50000000",
          payoutUsd: 50,
          maxProfitUsd: 25,
          redeemPayout: "24500000",
          redeemPayoutUsd: 24.5,
          effectivePrice: 0.5,
          quoteStatus: "ready",
        });
      },
    });

    expect(calls).toEqual([
      `https://api.hot-hands.test/testnet/quote?oracleId=0xoracle-dust&expiry=${expiryMs}&strike=61882000000&side=UP&spendUsd=25&estimatedPrice=0.5`,
    ]);
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

  test("keeps older active open rows when newer expired rows fill the feed candidate set", async () => {
    const nowMs = 1_779_165_000_000;
    const rows = [
      ...Array.from({ length: 110 }, (_, index) => ({
        id: `expired-candidate-${index}`,
        wallet: `0x${String(index % 10).repeat(40)}`,
        manager: `manager-expired-${index}`,
        market: "BTC-USD",
        side: index % 2 === 0 ? ("UP" as const) : ("DOWN" as const),
        strike: 70_000 + index,
        expiryMs: nowMs - 60_000,
        intervalLabel: "15m",
        observedAtMs: nowMs - index * 1_000,
        heatScore: 80,
        status: "copy_ready" as const,
      })),
      {
        id: "active-open-older",
        wallet: "0x905346ba566a0e930be3185d6b4dd3da82f580cb3a9cc0db915128e590d23a6b",
        manager: "manager-open",
        market: "BTC-USD",
        side: "UP" as const,
        strike: 62_500,
        expiryMs: nowMs + 24 * 60 * 60 * 1000,
        intervalLabel: "23d",
        observedAtMs: nowMs - 10 * 24 * 60 * 60 * 1000,
        heatScore: 25,
        status: "copy_ready" as const,
      },
    ];
    const preview = await loadMarketHeatPreview({
      apiBaseUrl: "https://api.hot-hands.test/",
      nowMs,
      fetcher: async () =>
        Response.json({
          mode: "testnet",
          source: "indexed_testnet",
          rows,
        }),
    });

    expect(preview.rows.some((row) => row.id === "active-open-older")).toBe(true);
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

  test("builds and applies market duration filters across feed and trade markets", () => {
    const preview = buildMarketHeatPreview(MARKET_HEAT_PREVIEW_ROWS, 8, {
      nowMs: 1_779_150_000_000,
    });

    expect(buildMarketDurationOptions(preview, { nowMs: 1_779_150_000_000 })).toEqual([
      { count: 1, label: "15m", value: "15m" },
      { count: 1, label: "1h", value: "1h" },
      { count: 1, label: "1d", value: "1d" },
    ]);
    expect(
      selectVisibleMarketHeatRows(preview.rows, {
        intervalLabel: "1h",
        nowMs: 1_779_150_000_000,
        showExpired: false,
        sortMode: "latest",
      }).map((row) => row.intervalLabel),
    ).toEqual(["1h"]);
    expect(
      buildTradeMarketLadder(preview, {
        intervalLabel: "1d",
        nowMs: 1_779_150_000_000,
      }).map((row) => row.intervalLabel),
    ).toEqual(["1d"]);
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
      actionLabel: "Copy now",
      statusLabel: "just now",
    });
  });

  test("preserves indexed multi-day market intervals in product duration filters", async () => {
    const preview = await loadMarketHeatPreview({
      apiBaseUrl: "https://api.hot-hands.test/",
      nowMs: 1_779_165_000_000,
      fetcher: async () =>
        Response.json({
          mode: "testnet",
          source: "indexed_testnet",
          marketPrice: {
            market: "BTC-USD",
            price: 60910,
            source: "indexed_testnet",
          },
          markets: [
            {
              oracleId: "0xabc",
              market: "BTC-USD",
              expiryMs: 1_780_732_800_000,
              intervalLabel: "4d",
              strikeCandidatePrice: 60910,
              status: "active",
            },
            {
              oracleId: "0xdef",
              market: "BTC-USD",
              expiryMs: 1_781_251_200_000,
              intervalLabel: "23d",
              strikeCandidatePrice: 60910,
              status: "active",
            },
          ],
          rows: [
            {
              id: "indexed-long",
              wallet: "0x3333444455556666777788889999000011112222",
              manager: "manager 0xabcd...0003",
              market: "BTC-USD",
              side: "UP",
              strike: 69000,
              expiryMs: 1_781_251_200_000,
              intervalLabel: "23d",
              observedAtMs: 1_779_165_000_000,
              heatScore: 88,
              status: "copy_ready",
            },
          ],
        }),
    });

    expect(preview.sourceLabel).toBe("Indexed Testnet");
    expect(preview.rows.map((row) => row.intervalLabel)).toEqual(["23d"]);
    expect(preview.availableMarkets?.map((market) => market.intervalLabel)).toEqual([
      "4d",
      "23d",
    ]);
    expect(buildMarketDurationOptions(preview, { nowMs: 1_779_165_000_000 })).toEqual([
      { count: 1, label: "4d", value: "4d" },
      { count: 1, label: "23d", value: "23d" },
    ]);
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

  test("can seed captured fallback rows with SuiNS-style demo names", async () => {
    const nowMs = Date.UTC(2026, 5, 1, 12, 0, 0);
    const preview = await loadMarketHeatPreview({
      apiBaseUrl: "",
      nowMs,
      useDemoDisplayNames: true,
    });

    expect(preview.rows[0]?.displayName).toMatch(/\.sui$/);
    expect(preview.rows[0]?.displayNameSource).toBe("demo_seed");
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
