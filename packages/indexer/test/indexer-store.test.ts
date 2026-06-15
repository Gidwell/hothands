import { describe, expect, test } from "bun:test";
import {
  createInMemoryPredictIndexerStore,
  runDeepBookPredictBackfill,
  summarizePredictPositions,
} from "../src";
import {
  DEEPBOOK_PREDICT_TESTNET_CONFIG,
  normalizePredictTradeRow,
  type PredictOracleState,
} from "../src/deepbook-predict";

describe("Predict indexer store", () => {
  test("upserts raw DeepBook Predict observations idempotently", async () => {
    const store = createInMemoryPredictIndexerStore();
    const oracle = btcOracle({ oracle_id: "btc-15m" });
    const mint = normalizePredictTradeRow(mintedRow({ digest: "0xmint1" }));
    const redeem = normalizePredictTradeRow(redeemedRow({ digest: "0xredeem1" }));
    const price = {
      eventId: "price:0xprice1:2",
      oracleId: "btc-15m",
      spot: 64_000_000_000,
      forward: 64_100_000_000,
      checkpoint: 12,
      timestampMs: 1_779_070_801_000,
      source: "oracles/prices" as const,
    };

    await store.upsertOracles([oracle, oracle]);
    await store.upsertTradeEvents([mint, redeem, mint]);
    await store.upsertOraclePrices([price, price]);

    expect(store.snapshot()).toMatchObject({
      oracles: [oracle],
      tradeEvents: [mint, redeem],
      oraclePrices: [price],
      oracleSvi: [],
      positionSummaries: [],
    });
  });

  test("summarizes position lifecycle, cost, payout, and realized PnL", () => {
    const events = [
      normalizePredictTradeRow(mintedRow({ digest: "0xmint1", cost: "1200000", quantity: "3" })),
      normalizePredictTradeRow(mintedRow({ digest: "0xmint2", cost: "400000", quantity: "1" })),
      normalizePredictTradeRow(redeemedRow({ digest: "0xredeem1", payout: "2200000", quantity: "4" })),
    ];

    expect(summarizePredictPositions(events)).toEqual([
      {
        id: "manager-btc:btc-15m:1779158400000:72000000000:UP",
        owner: "0xtrader",
        managerId: "manager-btc",
        oracleId: "btc-15m",
        expiryMs: 1_779_158_400_000,
        strike: 72_000_000_000,
        isUp: true,
        mintedQuantity: 4,
        redeemedQuantity: 4,
        openQuantity: 0,
        cost: 1_600_000,
        payout: 2_200_000,
        realizedPnl: 600_000,
        lastEventMs: 1_779_070_900_000,
        status: "closed",
      },
    ]);
  });
});

describe("DeepBook Predict backfill runner", () => {
  test("loads oracles, high-limit trade history, selected price history, and SVI", async () => {
    const store = createInMemoryPredictIndexerStore();
    const requests: string[] = [];
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);

      if (url.endsWith("/status")) {
        return jsonResponse({ status: "OK" });
      }

      if (url.endsWith("/state")) {
        return jsonResponse({
          predict_id: DEEPBOOK_PREDICT_TESTNET_CONFIG.predictObjectId,
          quote_assets: [DEEPBOOK_PREDICT_TESTNET_CONFIG.quoteAssetType],
        });
      }

      if (url.endsWith("/oracles")) {
        return jsonResponse([
          btcOracle({ oracle_id: "btc-15m", expiry: 1_779_158_400, status: "active" }),
          btcOracle({ oracle_id: "btc-settled", expiry: 1_779_150_000, status: "settled" }),
        ]);
      }

      if (url.endsWith("/oracles/btc-15m/prices/latest")) {
        return jsonResponse({
          oracle_id: "btc-15m",
          spot: 72_000_000_000,
          checkpoint: 100,
        });
      }

      if (url.endsWith("/positions/minted?limit=5000")) {
        return jsonResponse([mintedRow({ digest: "0xmint1" })]);
      }

      if (url.endsWith("/positions/redeemed?limit=5000")) {
        return jsonResponse([redeemedRow({ digest: "0xredeem1" })]);
      }

      if (url.endsWith("/trades/btc-15m?limit=5000")) {
        return jsonResponse([mintedRow({ digest: "0xoraclemint", kind: "minted" })]);
      }

      if (url.endsWith("/oracles/btc-15m/prices?limit=10000")) {
        return jsonResponse([
          {
            event_digest: "0xprice1",
            event_index: 2,
            oracle_id: "btc-15m",
            spot: "72000000000",
            forward: "72050000000",
            checkpoint: "101",
            checkpoint_timestamp_ms: "1779070801000",
          },
        ]);
      }

      if (url.endsWith("/oracles/btc-15m/svi?limit=1000")) {
        return jsonResponse([
          {
            event_digest: "0xsvi1",
            event_index: 3,
            oracle_id: "btc-15m",
            a: "1",
            b: "2",
            rho: "3",
            rho_negative: "4",
            m: "5",
            m_negative: "6",
            sigma: "7",
            checkpoint_timestamp_ms: "1779070802000",
          },
        ]);
      }

      return jsonResponse({ error: "not_found" }, 404);
    };

    const summary = await runDeepBookPredictBackfill({
      store,
      fetchImpl,
      oracleIds: ["btc-15m"],
      tradeLimit: 5_000,
      priceLimit: 10_000,
      sviLimit: 1_000,
      includeSvi: true,
    });

    expect(summary).toEqual({
      oracleCount: 2,
      tradeEventCount: 3,
      oraclePriceCount: 1,
      oracleSviCount: 1,
      positionSummaryCount: 1,
      selectedPriceOracleIds: ["btc-15m"],
      selectedOracleIds: ["btc-15m"],
    });
    expect(store.snapshot()).toMatchObject({
      oracles: expect.arrayContaining([
        expect.objectContaining({ oracle_id: "btc-15m" }),
        expect.objectContaining({ oracle_id: "btc-settled" }),
      ]),
      tradeEvents: expect.arrayContaining([
        expect.objectContaining({ eventId: "mint:0xmint1:1" }),
        expect.objectContaining({ eventId: "redeem:0xredeem1:1" }),
        expect.objectContaining({ eventId: "mint:0xoraclemint:1" }),
      ]),
      oraclePrices: [
        expect.objectContaining({
          eventId: "price:0xprice1:2",
          oracleId: "btc-15m",
        }),
      ],
      oracleSvi: [
        expect.objectContaining({
          eventId: "svi:0xsvi1:3",
          oracleId: "btc-15m",
        }),
      ],
      positionSummaries: [
        expect.objectContaining({
          id: "manager-btc:btc-15m:1779158400000:72000000000:UP",
          openQuantity: 2,
          status: "open",
        }),
      ],
    });
    expect(requests).toContain(
      `${DEEPBOOK_PREDICT_TESTNET_CONFIG.serverUrl}/positions/minted?limit=5000`,
    );
    expect(requests).toContain(
      `${DEEPBOOK_PREDICT_TESTNET_CONFIG.serverUrl}/oracles/btc-15m/prices?limit=10000`,
    );
  });

  test("loads oracle price history through chunked time windows", async () => {
    const baseStore = createInMemoryPredictIndexerStore();
    const priceWriteSizes: number[] = [];
    const store = Object.assign(Object.create(baseStore), {
      upsertOraclePrices: async (
        points: Parameters<typeof baseStore.upsertOraclePrices>[0],
      ) => {
        priceWriteSizes.push(points.length);
        return baseStore.upsertOraclePrices(points);
      },
    });
    const requests: string[] = [];
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);

      if (url.endsWith("/status")) {
        return jsonResponse({ status: "OK" });
      }

      if (url.endsWith("/state")) {
        return jsonResponse({
          predict_id: DEEPBOOK_PREDICT_TESTNET_CONFIG.predictObjectId,
          quote_assets: [DEEPBOOK_PREDICT_TESTNET_CONFIG.quoteAssetType],
        });
      }

      if (url.endsWith("/oracles")) {
        return jsonResponse([
          btcOracle({ oracle_id: "btc-15m", expiry: 1_779_158_400, status: "active" }),
        ]);
      }

      if (url.endsWith("/oracles/btc-15m/prices/latest")) {
        return jsonResponse({
          oracle_id: "btc-15m",
          spot: 72_000_000_000,
          checkpoint: 100,
        });
      }

      if (
        url.endsWith(
          "/oracles/btc-15m/prices?start_time=1779070800000&end_time=1779070860000",
        )
      ) {
        return jsonResponse([
          {
            event_digest: "0xprice-window-1",
            event_index: 1,
            oracle_id: "btc-15m",
            spot: "72000000000",
            checkpoint_timestamp_ms: "1779070801000",
          },
          {
            event_digest: "0xprice-window-1b",
            event_index: 2,
            oracle_id: "btc-15m",
            spot: "72005000000",
            checkpoint_timestamp_ms: "1779070820000",
          },
        ]);
      }

      if (
        url.endsWith(
          "/oracles/btc-15m/prices?start_time=1779070860001&end_time=1779070920000",
        )
      ) {
        return jsonResponse([
          {
            event_digest: "0xprice-window-2",
            event_index: 1,
            oracle_id: "btc-15m",
            spot: "72010000000",
            checkpoint_timestamp_ms: "1779070861000",
          },
        ]);
      }

      return jsonResponse({ error: "not_found" }, 404);
    };

    const summary = await runDeepBookPredictBackfill({
      store,
      fetchImpl,
      oracleIds: ["btc-15m"],
      includePositions: false,
      includeOracleTrades: false,
      priceRangeStartMs: 1_779_070_800_000,
      priceRangeEndMs: 1_779_070_920_000,
      priceSampleMs: 60_000,
      priceWindowMs: 60_000,
    });

    expect(summary).toMatchObject({
      oracleCount: 1,
      tradeEventCount: 0,
      oraclePriceCount: 3,
      positionSummaryCount: 0,
      selectedOracleIds: ["btc-15m"],
      selectedPriceOracleIds: ["btc-15m"],
    });
    expect(priceWriteSizes).toEqual([2, 1]);
    expect(baseStore.snapshot().oraclePrices.map((price) => price.eventId)).toEqual([
      "price:0xprice-window-1:1",
      "price:0xprice-window-1b:2",
      "price:0xprice-window-2:1",
    ]);
    expect(requests).toContain(
      `${DEEPBOOK_PREDICT_TESTNET_CONFIG.serverUrl}/oracles/btc-15m/prices?start_time=1779070800000&end_time=1779070860000`,
    );
    expect(requests).toContain(
      `${DEEPBOOK_PREDICT_TESTNET_CONFIG.serverUrl}/oracles/btc-15m/prices?start_time=1779070860001&end_time=1779070920000`,
    );
  });

  test("does not backfill expired oracle price or SVI series", async () => {
    const store = createInMemoryPredictIndexerStore();
    const requests: string[] = [];
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);

      if (url.endsWith("/status")) {
        return jsonResponse({ status: "OK" });
      }

      if (url.endsWith("/state")) {
        return jsonResponse({
          predict_id: DEEPBOOK_PREDICT_TESTNET_CONFIG.predictObjectId,
          quote_assets: [DEEPBOOK_PREDICT_TESTNET_CONFIG.quoteAssetType],
        });
      }

      if (url.endsWith("/oracles")) {
        return jsonResponse([
          btcOracle({ oracle_id: "btc-15m", expiry: 1_779_158_400, status: "active" }),
          btcOracle({ oracle_id: "btc-expired", expiry: 1_779_150_000, status: "settled" }),
        ]);
      }

      if (url.endsWith("/oracles/btc-15m/prices/latest")) {
        return jsonResponse({
          oracle_id: "btc-15m",
          spot: 72_000_000_000,
          checkpoint: 100,
        });
      }

      if (url.endsWith("/oracles/btc-15m/prices?limit=10000")) {
        return jsonResponse([
          {
            event_digest: "0xactive-price",
            event_index: 1,
            oracle_id: "btc-15m",
            spot: "72000000000",
            checkpoint_timestamp_ms: "1779070801000",
          },
        ]);
      }

      if (url.endsWith("/oracles/btc-15m/svi?limit=1000")) {
        return jsonResponse([
          {
            event_digest: "0xactive-svi",
            event_index: 1,
            oracle_id: "btc-15m",
            a: "1",
            b: "2",
            rho: "3",
            rho_negative: "4",
            m: "5",
            m_negative: "6",
            sigma: "7",
            checkpoint_timestamp_ms: "1779070802000",
          },
        ]);
      }

      return jsonResponse({ error: "not_found" }, 404);
    };

    const summary = await runDeepBookPredictBackfill({
      store,
      fetchImpl,
      oracleIds: ["btc-15m", "btc-expired"],
      includeOracleTrades: false,
      includePositions: false,
      includeSvi: true,
    });

    expect(summary).toMatchObject({
      oracleCount: 2,
      oraclePriceCount: 1,
      oracleSviCount: 1,
      selectedOracleIds: ["btc-15m", "btc-expired"],
      selectedPriceOracleIds: ["btc-15m"],
    });
    expect(requests).toContain(
      `${DEEPBOOK_PREDICT_TESTNET_CONFIG.serverUrl}/oracles/btc-15m/prices?limit=10000`,
    );
    expect(requests).toContain(
      `${DEEPBOOK_PREDICT_TESTNET_CONFIG.serverUrl}/oracles/btc-15m/svi?limit=1000`,
    );
    expect(requests).not.toContain(
      `${DEEPBOOK_PREDICT_TESTNET_CONFIG.serverUrl}/oracles/btc-expired/prices?limit=10000`,
    );
    expect(requests).not.toContain(
      `${DEEPBOOK_PREDICT_TESTNET_CONFIG.serverUrl}/oracles/btc-expired/svi?limit=1000`,
    );
  });
});

function btcOracle(overrides: Partial<PredictOracleState> = {}): PredictOracleState {
  return {
    predict_id: DEEPBOOK_PREDICT_TESTNET_CONFIG.predictObjectId,
    oracle_id: "btc-15m",
    underlying_asset: "BTC",
    expiry: 1_779_158_400,
    min_strike: 50_000_000_000,
    tick_size: 1_000_000,
    status: "active",
    activated_at: 1_779_157_500,
    ...overrides,
  };
}

function mintedRow(overrides: Record<string, unknown> = {}) {
  return {
    event_digest: "0xmint",
    digest: "0xmint",
    event_index: 1,
    trader: "0xtrader",
    manager_id: "manager-btc",
    oracle_id: "btc-15m",
    expiry_ms: "1779158400000",
    strike: "72000000000",
    is_up: true,
    quantity: "3",
    cost: "1200000",
    checkpoint: "4242",
    checkpoint_timestamp_ms: "1779070800000",
    ...overrides,
  };
}

function redeemedRow(overrides: Record<string, unknown> = {}) {
  return {
    event_digest: "0xredeem",
    digest: "0xredeem",
    event_index: 1,
    owner: "0xtrader",
    executor: "0xtrader",
    manager_id: "manager-btc",
    oracle_id: "btc-15m",
    expiry_ms: "1779158400000",
    strike: "72000000000",
    is_up: true,
    quantity: "4",
    payout: "2200000",
    checkpoint: "4250",
    checkpoint_timestamp_ms: "1779070900000",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
