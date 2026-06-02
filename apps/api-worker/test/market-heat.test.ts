import { describe, expect, test } from "bun:test";
import { DEEPBOOK_PREDICT_TESTNET_CONFIG } from "@hot-hands/indexer";
import worker, { type Env } from "../src/index";
import { getTestnetMarketHeat } from "../src/market-heat";

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
      costUsd: 1.2
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
