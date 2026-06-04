import { describe, expect, test } from "bun:test";
import {
  createPostgresPredictIndexerStore,
  type SqlExecutor,
} from "../src/postgres-store";
import {
  DEEPBOOK_PREDICT_TESTNET_CONFIG,
  normalizePredictTradeRow,
  type PredictOraclePricePoint,
  type PredictOracleSviPoint,
  type PredictOracleState,
} from "../src/deepbook-predict";
import { summarizePredictPositions } from "../src/store";

describe("Postgres Predict indexer store", () => {
  test("upserts every durable raw table with parameterized SQL", async () => {
    const calls: SqlCall[] = [];
    const execute: SqlExecutor = async (statement, params = []) => {
      calls.push({ statement, params });
      return { rows: [{ inserted: 1 }], rowCount: 1 };
    };
    const store = createPostgresPredictIndexerStore({ execute });
    const oracle = btcOracle();
    const mint = normalizePredictTradeRow(mintedRow());
    const price: PredictOraclePricePoint = {
      oracleId: "btc-15m",
      spot: 72_100_000_000,
      checkpoint: 101,
      timestampMs: 1_779_070_801_000,
      source: "oracles/prices",
    };
    const svi: PredictOracleSviPoint = {
      eventId: "svi:0xsvi1:0",
      oracleId: "btc-15m",
      a: 1,
      b: 2,
      rho: 3,
      rhoNegative: 4,
      m: 5,
      mNegative: 6,
      sigma: 7,
      checkpoint: 102,
      timestampMs: 1_779_070_802_000,
      source: "oracles/svi",
    };

    await store.upsertOracles([oracle]);
    await store.upsertTradeEvents([mint]);
    await store.upsertOraclePrices([price]);
    await store.upsertOracleSvi([svi]);
    await store.upsertPositionSummaries(summarizePredictPositions([mint]));

    expect(calls).toHaveLength(5);
    expect(calls[0]?.statement).toContain("insert into predict_oracles");
    expect(calls[0]?.statement).toContain("on conflict (oracle_id) do update");
    expect(calls[0]?.statement).toContain("indexed_at = now()");
    expect(calls[0]?.params.slice(0, 9)).toEqual([
      "btc-15m",
      DEEPBOOK_PREDICT_TESTNET_CONFIG.predictObjectId,
      null,
      "BTC",
      1_779_158_400_000,
      50_000_000_000,
      1_000_000,
      "active",
      1_779_157_500_000,
    ]);

    expect(calls[1]?.statement).toContain("insert into predict_trade_events");
    expect(calls[1]?.params.slice(0, 12)).toEqual([
      "mint:0xmint:1",
      "mint",
      "0xtrader",
      "0xtrader",
      "manager-btc",
      "btc-15m",
      1_779_158_400_000,
      72_000_000_000,
      true,
      3,
      1_200_000,
      null,
    ]);

    expect(calls[2]?.statement).toContain("insert into predict_oracle_prices");
    expect(calls[2]?.params.slice(0, 3)).toEqual([
      "price:btc-15m:101:1779070801000:72100000000:no-forward",
      "btc-15m",
      72_100_000_000,
    ]);
    expect(calls[3]?.statement).toContain("insert into predict_oracle_svi");
    expect(calls[4]?.statement).toContain("insert into predict_position_summaries");
    expect(calls[4]?.statement).toContain("materialized_at = now()");

    for (const call of calls) {
      expect(call.statement).toContain("returning 1");
      expect(call.statement).not.toContain("0xtrader");
    }
  });

  test("returns touched row counts from the SQL executor", async () => {
    const execute: SqlExecutor = async () => ({ rows: [{ inserted: 1 }, { inserted: 1 }] });
    const store = createPostgresPredictIndexerStore({ execute });

    await expect(store.upsertTradeEvents([
      normalizePredictTradeRow(mintedRow({ digest: "0xone" })),
      normalizePredictTradeRow(mintedRow({ digest: "0xtwo" })),
    ])).resolves.toBe(2);
  });
});

type SqlCall = {
  statement: string;
  params: readonly unknown[];
};

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
