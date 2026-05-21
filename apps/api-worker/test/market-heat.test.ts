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
    expect(body.rows.find((row: { wallet: string }) => row.wallet === "0xtrader-warm")).toMatchObject({
      heatScore: 15,
      intervalLabel: "15m",
      status: "copy_ready"
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
    expect(projection.rows.some((row) => row.wallet === "0xtrader-position")).toBe(true);
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
    expect(projection.rows).toBeArray();
    expect(projection.rows.length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(projection.rows[0]).sort()).toEqual([
      "expiryMs",
      "heatScore",
      "id",
      "intervalLabel",
      "manager",
      "market",
      "observedAtMs",
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
      side: expect.stringMatching(/^(UP|DOWN)$/),
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
    expect(body.rows).toBeArray();
    expect(body.rows.length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(body.rows[0]).sort()).toEqual([
      "expiryMs",
      "heatScore",
      "id",
      "intervalLabel",
      "manager",
      "market",
      "observedAtMs",
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
      side: expect.stringMatching(/^(UP|DOWN)$/),
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
});

function createLivePredictFetch(
  {
    quietOracleTrades = false,
    extraOlderHotTradeCount = 0,
    includeRecentPosition = false,
    positionStrike = "73000000000",
    positionCost = "800000"
  }: {
    quietOracleTrades?: boolean;
    extraOlderHotTradeCount?: number;
    includeRecentPosition?: boolean;
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
        btcOracle({
          oracle_id: "btc-live",
          expiry: 1_779_158_400,
          activated_at: 1_779_157_500,
          status: "active"
        })
      ]);
    }

    if (url.endsWith("/prices/latest")) {
      return jsonResponse({
        oracle_id: "btc-live",
        spot: 72_000_000_000,
        checkpoint: 101
      });
    }

    if (url.endsWith("/trades/btc-live")) {
      if (quietOracleTrades) {
        return jsonResponse([]);
      }

      return jsonResponse([
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
