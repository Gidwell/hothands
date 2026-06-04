import { describe, expect, test } from "bun:test";
import {
  DEEPBOOK_PREDICT_TESTNET_CONFIG,
  type PredictIndexerReader
} from "@hot-hands/indexer";
import worker, { type Env } from "../src/index";
import { getTestnetMarketHeat } from "../src/market-heat";
import { getTestnetOraclePrices } from "../src/oracle-prices";

describe("testnet market heat endpoint", () => {
  test("returns live testnet market heat from injected Predict reads", async () => {
    const response = await worker.fetch(
      new Request("https://api.hot-hands.test/testnet/market-heat"),
      { fetch: createLivePredictFetch() } as unknown as Env
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("content-type")).toContain("application/json");

    const body = await response.json();
    expect(body.source).toBe("live_testnet");
    expect(typeof body.title).toBe("string");
    expect(body.mode).toBe("testnet");
    expect(typeof body.detail).toBe("string");
    expect(body.marketPrice).toEqual({
      market: "BTC-USD",
      price: 72000,
      source: "live_testnet"
    });
    expect(body.markets[0]).toEqual({
      oracleId: "btc-live",
      market: "BTC-USD",
      expiry: 1_779_158_400,
      expiryMs: 1_779_158_400_000,
      intervalLabel: "15m",
      active: true,
      status: "active",
      strikeCandidate: 72_000_000_000,
      strikeCandidatePrice: 72000,
      latestPrice: 72000,
      latestPriceLabel: "$72,000"
    });
    expect(body.rows).toBeArray();
    expect(body.rows[0].id).toContain("live-");
    expect(body.rows[0].wallet).toBe("0xtrader-hot");
    expect(body.rows[0].manager).toBe("manager-btc-72k");
    expect(body.rows[0].market).toBe("BTC-USD");
    expect(body.rows[0].side).toBe("UP");
    expect(typeof body.rows[0].strike).toBe("number");
    expect(typeof body.rows[0].strikeRaw).toBe("number");
    expect(typeof body.rows[0].expiryMs).toBe("number");
    expect(typeof body.rows[0].intervalLabel).toBe("string");
    expect(body.rows[0].observedAtMs).toBe(1_779_070_800_000);
    expect(typeof body.rows[0].heatScore).toBe("number");
    expect(body.rows[0].status).toMatch(/^(copy_ready|watching)$/);
    expect(body.rows[0].strike).toBeGreaterThan(0);
    expect(body.rows[0].heatScore).toBeGreaterThan(0);
    expect(body.rows[0]).toMatchObject({
      oracleId: "btc-live",
      quantity: 3,
      cost: 1_200_000,
      costUsd: 1.2,
      strikeRaw: 72_000_000_000
    });
    expect(body.rows.find((row: { wallet: string }) => row.wallet === "0xtrader-warm")).toMatchObject({
      heatScore: 15,
      intervalLabel: "15m",
      quantity: 1,
      cost: 400_000,
      costUsd: 0.4,
      status: "copy_ready"
    });
  });

  test("exposes active BTC Predict trade markets for the PWA Trade tab", async () => {
    const projection = await getTestnetMarketHeat({
      fetchImpl: createLivePredictFetch({ includeExtraActiveMarket: true })
    });

    expect(projection.source).toBe("live_testnet");
    expect(projection.markets).toEqual([
      {
        oracleId: "btc-live-short",
        market: "BTC-USD",
        expiry: 1_779_158_100,
        expiryMs: 1_779_158_100_000,
        intervalLabel: "10m",
        active: true,
        status: "active",
        strikeCandidate: 71_500_000_000,
        strikeCandidatePrice: 71500,
        latestPrice: 71500,
        latestPriceLabel: "$71,500"
      },
      {
        oracleId: "btc-live",
        market: "BTC-USD",
        expiry: 1_779_158_400,
        expiryMs: 1_779_158_400_000,
        intervalLabel: "15m",
        active: true,
        status: "active",
        strikeCandidate: 72_000_000_000,
        strikeCandidatePrice: 72000,
        latestPrice: 72000,
        latestPriceLabel: "$72,000"
      }
    ]);
  });

  test("prefers injected indexed market heat with latest rows and active trade markets", async () => {
    let publicPredictFetchCount = 0;
    const projection = await getTestnetMarketHeat({
      reader: createIndexedMarketHeatReader(),
      fetchImpl: async () => {
        publicPredictFetchCount += 1;
        throw new Error("public Predict should not be read when indexed market heat exists");
      }
    });

    expect(publicPredictFetchCount).toBe(0);
    expect(projection.source).toBe("indexed_testnet");
    expect(projection.marketPrice).toEqual({
      market: "BTC-USD",
      price: 72125,
      source: "indexed_testnet"
    });
    expect(projection.markets).toEqual([
      {
        oracleId: "btc-indexed-short",
        market: "BTC-USD",
        expiry: 1_779_158_100_000,
        expiryMs: 1_779_158_100_000,
        intervalLabel: "10m",
        active: true,
        status: "active",
        strikeCandidate: 71_500_000_000,
        strikeCandidatePrice: 71500,
        latestPrice: 71500,
        latestPriceLabel: "$71,500"
      },
      {
        oracleId: "btc-indexed-long",
        market: "BTC-USD",
        expiry: 1_779_158_400_000,
        expiryMs: 1_779_158_400_000,
        intervalLabel: "15m",
        active: true,
        status: "active",
        strikeCandidate: 72_125_000_000,
        strikeCandidatePrice: 72125,
        latestPrice: 72125,
        latestPriceLabel: "$72,125"
      }
    ]);
    expect(projection.rows.slice(0, 3).map((row) => row.wallet)).toEqual([
      "0xtrader-new",
      "0xtrader-mid",
      "0xtrader-hot"
    ]);
    expect(projection.rows.slice(0, 3).map((row) => row.observedAtMs)).toEqual([
      1_779_071_200_000,
      1_779_071_100_000,
      1_779_070_000_000
    ]);
    expect(projection.rows[0]).toMatchObject({
      id: expect.stringContaining("indexed-"),
      wallet: "0xtrader-new",
      manager: "manager-new",
      oracleId: "btc-indexed-long",
      side: "DOWN",
      quantity: 1,
      cost: 100_000,
      costUsd: 0.1,
      strike: 72125,
      strikeRaw: 72_125_000_000,
      status: "copy_ready"
    });
    expect(
      projection.rows.find((row) => row.wallet === "0xtrader-hot")?.heatScore
    ).toBeGreaterThan(projection.rows[0].heatScore);
  });

  test("returns indexed wallet leaderboards from an injected reader", async () => {
    const response = await worker.fetch(
      new Request("https://api.hot-hands.test/testnet/wallet-leaderboards?limit=5"),
      { indexerReader: createIndexedMarketHeatReader() } as unknown as Env
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");

    const body = await response.json();
    expect(body.source).toBe("indexed_testnet");
    expect(body.leaderboards.longestWinningStreak[0]).toMatchObject({
      wallet: "0xtrader-hot",
      totalPnl: 3_000_000,
      closedCount: 1,
      winCount: 1,
      longestWinningStreak: 1
    });
    expect(body.leaderboards.highestPnl[0]).toMatchObject({
      wallet: "0xtrader-hot",
      totalPnl: 3_000_000
    });
  });

  test("requires an indexer reader for worker wallet leaderboards", async () => {
    const response = await worker.fetch(
      new Request("https://api.hot-hands.test/testnet/wallet-leaderboards"),
      {} as Env
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "indexer_unavailable"
    });
  });

  test("returns oracle settlement details for portfolio claim previews", async () => {
    const response = await worker.fetch(
      new Request(
        "https://api.hot-hands.test/testnet/oracle-settlement?oracleId=btc-settled"
      ),
      { fetch: createOracleSettlementFetch() } as unknown as Env
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");

    await expect(response.json()).resolves.toEqual({
      source: "live_testnet",
      oracleId: "btc-settled",
      status: "settled",
      settlementPrice: 70_255_724_491_985,
      settledAtMs: 1_780_366_507_716
    });
  });

  test("returns normalized oracle price history for BTC charting", async () => {
    const response = await worker.fetch(
      new Request(
        "https://api.hot-hands.test/testnet/oracle-prices?oracleId=btc-live"
      ),
      { fetch: createOraclePriceHistoryFetch() } as unknown as Env
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");

    await expect(response.json()).resolves.toEqual({
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
          checkpoint: 101
        },
        {
          timestampMs: 1_779_070_860_000,
          price: 72050,
          forwardPrice: 72070,
          checkpoint: 102
        }
      ]
    });
  });

  test("prefers injected indexed oracle price history with full range metadata", async () => {
    const indexedRequests: unknown[] = [];
    const projection = await getTestnetOraclePrices({
      fetchImpl: async () => {
        throw new Error("public Predict should not be read when indexed history exists");
      },
      indexedOraclePriceHistoryLoader: async (request) => {
        indexedRequests.push(request);

        return {
          points: [
            {
              timestampMs: 1_779_070_800_000,
              price: 72000,
              checkpoint: 101
            },
            {
              timestampMs: 1_779_071_100_000,
              price: 72075,
              checkpoint: 106
            },
            {
              timestampMs: 1_779_071_400_000,
              price: 72100,
              checkpoint: 111
            }
          ],
          totalPointCount: 86_400,
          startTimestampMs: 1_778_985_000_000,
          endTimestampMs: 1_779_071_400_000,
          downsampled: true
        };
      },
      maxPoints: 10_000,
      oracleId: "btc-indexed"
    });

    expect(indexedRequests).toEqual([
      {
        market: "BTC-USD",
        maxPoints: 10_000,
        oracleId: "btc-indexed"
      }
    ]);
    expect(projection).toEqual({
      source: "indexed_testnet",
      market: "BTC-USD",
      oracleId: "btc-indexed",
      title: "DeepBook BTC oracle price",
      detail: "DeepBook Predict oracle price used for BTC market settlement.",
      latestPrice: 72100,
      historyRange: {
        startTimestampMs: 1_778_985_000_000,
        endTimestampMs: 1_779_071_400_000,
        totalPointCount: 86_400,
        returnedPointCount: 3,
        maxPoints: 10_000,
        downsampled: true
      },
      points: [
        {
          timestampMs: 1_779_070_800_000,
          price: 72000,
          checkpoint: 101
        },
        {
          timestampMs: 1_779_071_100_000,
          price: 72075,
          checkpoint: 106
        },
        {
          timestampMs: 1_779_071_400_000,
          price: 72100,
          checkpoint: 111
        }
      ]
    });
  });

  test("quotes redeem value for an open portfolio position", async () => {
    const inspectedQuantities: string[] = [];
    const response = await worker.fetch(
      new Request(
        "https://api.hot-hands.test/testnet/redeem-quote?oracleId=0xabc123&expiry=1779158400000&strike=72000000000&side=DOWN&quantity=4000000"
      ),
      {
        inspectPredictQuoteQuantity: async ({ quantity }) => {
          inspectedQuantities.push(quantity.toString());

          return {
            cost: quantity / 2n,
            redeemPayout: quantity / 3n
          };
        }
      } as unknown as Env
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");

    const body = await response.json();
    expect(inspectedQuantities).toEqual(["4000000"]);
    expect(body).toMatchObject({
      source: "live_testnet",
      market: "BTC-USD",
      oracleId: "0xabc123",
      expiry: "1779158400000",
      strike: "72000000000",
      side: "DOWN",
      quantity: "4000000",
      redeemPayout: "1333333",
      redeemPayoutUsd: 1.333333,
      quoteStatus: "ready"
    });
  });

  test("falls back to captured read-only market heat when live Predict reads fail", async () => {
    const projection = await getTestnetMarketHeat({
      fetchImpl: async () => {
        throw new Error("network unavailable");
      }
    });

    expect(projection.source).toBe("captured_testnet");
    expect(projection.rows.length).toBeGreaterThanOrEqual(2);
  });

  test("uses recent public positions when the active oracle trade feed is quiet", async () => {
    const projection = await getTestnetMarketHeat({
      fetchImpl: createLivePredictFetch({ quietOracleTrades: true })
    });

    expect(projection.source).toBe("live_testnet");
    expect(projection.rows[0]).toMatchObject({
      wallet: "0xtrader-position",
      manager: "manager-btc-positions",
      market: "BTC-USD",
      side: "DOWN"
    });
    expect(projection.rows[0].strike).toBeGreaterThan(0);
  });

  test("keeps recent lower-heat positions available for latest ordering", async () => {
    const projection = await getTestnetMarketHeat({
      fetchImpl: createLivePredictFetch({
        extraOlderHotTradeCount: 12,
        includeRecentPosition: true,
        positionCost: "200000"
      })
    });

    expect(projection.source).toBe("live_testnet");
    expect(projection.rows[0]).toMatchObject({
      wallet: "0xtrader-position",
      heatScore: expect.any(Number)
    });
    expect(projection.rows.some((row) => row.wallet === "0xtrader-position")).toBe(true);
  });

  test("keeps repeat trader mints as separate latest activity rows", async () => {
    const projection = await getTestnetMarketHeat({
      fetchImpl: createLivePredictFetch({
        includeRepeatTraderMints: true
      })
    });

    expect(projection.source).toBe("live_testnet");
    expect(projection.rows.slice(0, 2).map((row) => row.id)).toEqual([
      expect.stringContaining("mint:0xrepeat-newer:10"),
      expect.stringContaining("mint:0xrepeat-older:9")
    ]);
    expect(projection.rows.slice(0, 2)).toEqual([
      expect.objectContaining({
        wallet: "0xtrader-repeat",
        manager: "manager-btc-repeat",
        observedAtMs: 1_779_071_050_000,
        strike: 71_500,
        status: "copy_ready"
      }),
      expect.objectContaining({
        wallet: "0xtrader-repeat",
        manager: "manager-btc-repeat",
        observedAtMs: 1_779_071_000_000,
        strike: 71_400,
        status: "copy_ready"
      })
    ]);
  });

  test("normalizes high precision live strikes into readable BTC prices", async () => {
    const projection = await getTestnetMarketHeat({
      fetchImpl: createLivePredictFetch({
        quietOracleTrades: true,
        positionStrike: "78098000000000",
        positionCost: "8000000"
      })
    });

    expect(projection.source).toBe("live_testnet");
    expect(projection.rows[0].strike).toBe(78098);
    expect(projection.rows[0].strikeRaw).toBe(78_098_000_000_000);
    expect(projection.rows[0]).toMatchObject({
      quantity: 2,
      cost: 8_000_000,
      costUsd: 8
    });
    expect(projection.rows[0].heatScore).toBeLessThanOrEqual(99);
  });

  test("keeps a captured read-only market heat projection shape for the PWA", async () => {
    const projection = await getTestnetMarketHeat({
      fetchImpl: async () => jsonResponse([], 500)
    });

    expect(projection.source).toBe("captured_testnet");
    expect(typeof projection.title).toBe("string");
    expect(typeof projection.mode).toBe("string");
    expect(typeof projection.detail).toBe("string");
    expect(projection.marketPrice).toEqual({
      market: "BTC-USD",
      price: 102480,
      source: "captured_testnet"
    });
    expect(projection.markets).toEqual([]);
    expect(projection.rows).toBeArray();
    expect(projection.rows.length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(projection.rows[0]).sort()).toEqual([
      "cost",
      "costUsd",
      "expiryMs",
      "heatScore",
      "id",
      "intervalLabel",
      "manager",
      "market",
      "observedAtMs",
      "oracleId",
      "quantity",
      "side",
      "status",
      "strike",
      "wallet"
    ]);
    expect(projection.rows[0]).toEqual({
      id: expect.any(String),
      wallet: expect.any(String),
      manager: expect.any(String),
      market: expect.any(String),
      oracleId: expect.any(String),
      side: expect.stringMatching(/^(UP|DOWN)$/),
      quantity: expect.any(Number),
      cost: expect.any(Number),
      costUsd: expect.any(Number),
      expiryMs: expect.any(Number),
      intervalLabel: expect.any(String),
      observedAtMs: expect.any(Number),
      heatScore: expect.any(Number),
      strike: expect.any(Number),
      status: expect.stringMatching(/^(copy_ready|watching)$/)
    });
  });

  test("worker falls back to captured read-only market heat when live Predict reads fail", async () => {
    const response = await worker.fetch(
      new Request("https://api.hot-hands.test/testnet/market-heat"),
      {
        fetch: async () => {
          throw new Error("network unavailable");
        }
      } as unknown as Env
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("content-type")).toContain("application/json");

    const body = await response.json();
    expect(body.source).toBe("captured_testnet");
    expect(typeof body.title).toBe("string");
    expect(typeof body.mode).toBe("string");
    expect(typeof body.detail).toBe("string");
    expect(body.marketPrice).toEqual({
      market: "BTC-USD",
      price: 102480,
      source: "captured_testnet"
    });
    expect(body.markets).toEqual([]);
    expect(body.rows).toBeArray();
    expect(body.rows.length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(body.rows[0]).sort()).toEqual([
      "cost",
      "costUsd",
      "expiryMs",
      "heatScore",
      "id",
      "intervalLabel",
      "manager",
      "market",
      "observedAtMs",
      "oracleId",
      "quantity",
      "side",
      "status",
      "strike",
      "wallet"
    ]);
    expect(body.rows[0]).toEqual({
      id: expect.any(String),
      wallet: expect.any(String),
      manager: expect.any(String),
      market: expect.any(String),
      oracleId: expect.any(String),
      side: expect.stringMatching(/^(UP|DOWN)$/),
      quantity: expect.any(Number),
      cost: expect.any(Number),
      costUsd: expect.any(Number),
      expiryMs: expect.any(Number),
      intervalLabel: expect.any(String),
      observedAtMs: expect.any(Number),
      heatScore: expect.any(Number),
      strike: expect.any(Number),
      status: expect.stringMatching(/^(copy_ready|watching)$/)
    });
  });

  test("answers CORS preflight for local PWA reads", async () => {
    const response = await worker.fetch(
      new Request("https://api.hot-hands.test/testnet/market-heat", {
        method: "OPTIONS"
      }),
      {} as Env
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toContain("GET");
  });

  test("quotes a selected trade amount from DeepBook Predict dev-inspect reads", async () => {
    const inspectedQuantities: string[] = [];
    const response = await worker.fetch(
      new Request(
        "https://api.hot-hands.test/testnet/quote?oracleId=0xabc123&expiry=1779158400000&strike=72000000000&side=UP&spendUsd=25&estimatedPrice=0.5"
      ),
      {
        inspectPredictQuoteQuantity: async ({ quantity }) => {
          inspectedQuantities.push(quantity.toString());

          return {
            cost: quantity / 2n,
            redeemPayout: quantity / 3n
          };
        }
      } as unknown as Env
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");

    const body = await response.json();
    expect(inspectedQuantities.length).toBeGreaterThan(0);
    expect(body).toMatchObject({
      source: "live_testnet",
      market: "BTC-USD",
      oracleId: "0xabc123",
      expiry: "1779158400000",
      strike: "72000000000",
      side: "UP",
      requestedSpendUsd: 25,
      costUsd: 25,
      payoutUsd: 50,
      maxProfitUsd: 25,
      effectivePrice: 0.5,
      quoteStatus: "ready"
    });
  });

  test("rejects malformed testnet quote requests without inspecting Predict", async () => {
    let inspectCount = 0;
    const response = await worker.fetch(
      new Request(
        "https://api.hot-hands.test/testnet/quote?oracleId=not-an-id&expiry=1779158400000&strike=72000000000&side=UP&spendUsd=25"
      ),
      {
        inspectPredictQuoteQuantity: async () => {
          inspectCount += 1;
          return { cost: 1n, redeemPayout: 1n };
        }
      } as unknown as Env
    );

    expect(response.status).toBe(400);
    expect(inspectCount).toBe(0);

    const body = await response.json();
    expect(body).toMatchObject({
      error: "quote_failed"
    });
  });
});

function createLivePredictFetch(
  {
    quietOracleTrades = false,
    extraOlderHotTradeCount = 0,
    includeRecentPosition = false,
    includeRepeatTraderMints = false,
    includeExtraActiveMarket = false,
    positionStrike = "73000000000",
    positionCost = "800000"
  }: {
    quietOracleTrades?: boolean;
    extraOlderHotTradeCount?: number;
    includeRecentPosition?: boolean;
    includeRepeatTraderMints?: boolean;
    includeExtraActiveMarket?: boolean;
    positionStrike?: string;
    positionCost?: string;
  } = {}
): typeof fetch {
  return async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.endsWith("/status")) {
      return jsonResponse({
        status: "OK",
        latest_onchain_checkpoint: 100,
        max_checkpoint_lag: 2
      });
    }

    if (url.endsWith("/state")) {
      return jsonResponse({
        predict_id: DEEPBOOK_PREDICT_TESTNET_CONFIG.predictObjectId,
        quote_assets: [DEEPBOOK_PREDICT_TESTNET_CONFIG.quoteAssetType]
      });
    }

    if (url.endsWith("/oracles")) {
      return jsonResponse([
        ...(includeExtraActiveMarket
          ? [
              btcOracle({
                oracle_id: "btc-live-short",
                expiry: 1_779_158_100,
                activated_at: 1_779_157_500,
                status: "active"
              })
            ]
          : []),
        btcOracle({
          oracle_id: "btc-live",
          expiry: 1_779_158_400,
          activated_at: 1_779_157_500,
          status: "active"
        })
      ]);
    }

    const latestPriceMatch = url.match(/\/oracles\/([^/]+)\/prices\/latest$/);
    if (latestPriceMatch) {
      const oracleId = decodeURIComponent(latestPriceMatch[1]);
      return jsonResponse({
        oracle_id: oracleId,
        spot: oracleId === "btc-live-short" ? 71_500_000_000 : 72_000_000_000,
        checkpoint: 101
      });
    }

    if (url.endsWith("/trades/btc-live")) {
      if (quietOracleTrades) {
        return jsonResponse([]);
      }

      return jsonResponse([
        ...(includeRepeatTraderMints
          ? [
              liveTrade({
                digest: "0xrepeat-newer",
                event_seq: 10,
                kind: "minted",
                trader: "0xtrader-repeat",
                manager_id: "manager-btc-repeat",
                strike: "71500000000",
                is_up: true,
                quantity: "1",
                cost: "200000",
                timestamp_ms: "1779071050000"
              }),
              liveTrade({
                digest: "0xrepeat-older",
                event_seq: 9,
                kind: "minted",
                trader: "0xtrader-repeat",
                manager_id: "manager-btc-repeat",
                strike: "71400000000",
                is_up: false,
                quantity: "1",
                cost: "200000",
                timestamp_ms: "1779071000000"
              })
            ]
          : []),
        liveTrade({
          digest: "0xmintdigest",
          event_seq: 7,
          kind: "minted",
          trader: "0xtrader-hot",
          manager_id: "manager-btc-72k",
          strike: "72000000000",
          is_up: true,
          quantity: "3",
          cost: "1200000",
          timestamp_ms: "1779070800000"
        }),
        liveTrade({
          digest: "0xwarmer",
          event_seq: 8,
          kind: "minted",
          trader: "0xtrader-warm",
          manager_id: "manager-btc-70k",
          strike: "70000000000",
          is_up: false,
          quantity: "1",
          cost: "400000",
          timestamp_ms: "1779070700000"
        }),
        ...Array.from({ length: extraOlderHotTradeCount }, (_, index) =>
          liveTrade({
            digest: `0xextrahot${index}`,
            event_seq: 20 + index,
            kind: "minted",
            trader: `0xtrader-hot-${index}`,
            manager_id: `manager-btc-extra-hot-${index}`,
            strike: "72000000000",
            is_up: true,
            quantity: "5",
            cost: "2000000",
            timestamp_ms: String(1_779_060_000_000 - index * 1000)
          })
        )
      ]);
    }

    if (url.endsWith("/positions/minted")) {
      if (quietOracleTrades || includeRecentPosition) {
        return jsonResponse([
          liveTrade({
            digest: "0xpositionmint",
            event_seq: 9,
            trader: "0xtrader-position",
            manager_id: "manager-btc-positions",
            oracle_id: "btc-quiet-position",
            strike: positionStrike,
            is_up: false,
            quantity: "2",
            cost: positionCost,
            timestamp_ms: "1779071000000"
          })
        ]);
      }

      return jsonResponse([]);
    }

    if (url.endsWith("/positions/redeemed")) {
      return jsonResponse([]);
    }

    return jsonResponse({ error: "not_found" }, 404);
  };
}

function createIndexedMarketHeatReader(): PredictIndexerReader {
  const latestPrices = new Map([
    [
      "btc-indexed-short",
      {
        eventId: "price:btc-indexed-short:1",
        oracleId: "btc-indexed-short",
        spot: 71_500_000_000,
        checkpoint: 101,
        timestampMs: 1_779_071_000_000,
        source: "oracles/prices" as const
      }
    ],
    [
      "btc-indexed-long",
      {
        eventId: "price:btc-indexed-long:1",
        oracleId: "btc-indexed-long",
        spot: 72_125_000_000,
        checkpoint: 102,
        timestampMs: 1_779_071_200_000,
        source: "oracles/prices" as const
      }
    ]
  ]);

  return {
    listBtcOracles: async () => [
      btcIndexedOracle({
        oracle_id: "btc-indexed-long",
        expiry: 1_779_158_400_000,
        activated_at: 1_779_157_500_000,
        status: "active"
      }),
      btcIndexedOracle({
        oracle_id: "btc-indexed-settled",
        expiry: 1_779_157_000_000,
        activated_at: 1_779_156_100_000,
        status: "settled"
      }),
      btcIndexedOracle({
        oracle_id: "btc-indexed-short",
        expiry: 1_779_158_100_000,
        activated_at: 1_779_157_500_000,
        status: "active"
      })
    ],
    listRecentTradeEvents: async () => [
      indexedTradeEvent({
        eventId: "mint:newer:1",
        actor: "0xtrader-new",
        managerId: "manager-new",
        oracleId: "btc-indexed-long",
        strike: 72_125_000_000,
        isUp: false,
        quantity: 1,
        cost: 100_000,
        timestampMs: 1_779_071_200_000
      }),
      indexedTradeEvent({
        eventId: "mint:mid:1",
        actor: "0xtrader-mid",
        managerId: "manager-mid",
        oracleId: "btc-indexed-short",
        strike: 71_500_000_000,
        quantity: 1,
        cost: 200_000,
        timestampMs: 1_779_071_100_000
      }),
      indexedTradeEvent({
        eventId: "mint:hot-older:1",
        actor: "0xtrader-hot",
        managerId: "manager-hot",
        oracleId: "btc-indexed-long",
        strike: 72_000_000_000,
        quantity: 6,
        cost: 4_000_000,
        timestampMs: 1_779_070_000_000
      })
    ],
    listPositionSummaries: async () => [
      {
        id: "position-hot-win",
        owner: "0xtrader-hot",
        managerId: "manager-hot",
        oracleId: "btc-indexed-long",
        expiryMs: 1_779_158_400_000,
        strike: 72_000_000_000,
        isUp: true,
        mintedQuantity: 6,
        redeemedQuantity: 6,
        openQuantity: 0,
        cost: 5_000_000,
        payout: 8_000_000,
        realizedPnl: 3_000_000,
        lastEventMs: 1_779_070_000_000,
        status: "closed"
      }
    ],
    listOraclePrices: async ({ oracleId }) => {
      const price = latestPrices.get(oracleId);

      return price ? [price] : [];
    },
    getLatestOraclePrice: async (oracleId) => latestPrices.get(oracleId) ?? null,
    getOraclePriceStats: async () => null
  };
}

function btcIndexedOracle(overrides: Record<string, unknown>) {
  return {
    predict_id: DEEPBOOK_PREDICT_TESTNET_CONFIG.predictObjectId,
    oracle_id: "btc-indexed",
    underlying_asset: "BTC",
    expiry: 1_779_158_400_000,
    activated_at: 1_779_157_500_000,
    min_strike: 50_000_000_000,
    tick_size: 1_000_000,
    status: "active",
    ...overrides
  };
}

function indexedTradeEvent(overrides: Record<string, unknown>) {
  return {
    eventId: "mint:indexed:1",
    kind: "mint",
    actor: "0xtrader-indexed",
    managerId: "manager-indexed",
    oracleId: "btc-indexed-long",
    expiryMs: 1_779_158_400_000,
    strike: 72_000_000_000,
    isUp: true,
    quantity: 1,
    cost: 100_000,
    timestampMs: 1_779_071_000_000,
    source: "trades/oracle",
    ...overrides
  };
}

function createOracleSettlementFetch(): typeof fetch {
  return async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.endsWith("/oracles")) {
      return jsonResponse([
        btcOracle({
          oracle_id: "btc-active",
          status: "active",
          settlement_price: null,
          settled_at: null
        }),
        btcOracle({
          oracle_id: "btc-settled",
          status: "settled",
          settlement_price: 70_255_724_491_985,
          settled_at: 1_780_366_507_716
        })
      ]);
    }

    return jsonResponse({ error: "not_found" }, 404);
  };
}

function createOraclePriceHistoryFetch(): typeof fetch {
  return async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes("/oracles/btc-live/prices")) {
      return jsonResponse({
        prices: [
          {
            oracle_id: "btc-live",
            spot: "72000000000",
            checkpoint: "101",
            checkpoint_timestamp_ms: "1779070800000"
          },
          {
            oracle_id: "btc-live",
            spot: "72050000000",
            forward: "72070000000",
            checkpoint: "102",
            checkpoint_timestamp_ms: "1779070860000"
          }
        ]
      });
    }

    return jsonResponse({ error: "not_found" }, 404);
  };
}

function btcOracle(overrides: Record<string, unknown>) {
  return {
    predict_id: DEEPBOOK_PREDICT_TESTNET_CONFIG.predictObjectId,
    oracle_id: "btc-live",
    underlying_asset: "BTC",
    expiry: 1,
    min_strike: 50_000_000_000,
    tick_size: 1_000_000,
    status: "settled",
    ...overrides
  };
}

function liveTrade(overrides: Record<string, unknown>) {
  return {
    oracle_id: "btc-live",
    expiry: "1779158400",
    checkpoint: "4242",
    ...overrides
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
