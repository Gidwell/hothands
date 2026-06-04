import { describe, expect, test } from "bun:test";
import {
  DEEPBOOK_PREDICT_TESTNET_CONFIG,
  createInMemoryPredictIndexerStore,
  parseLiveIndexerCliOptions,
  runDeepBookPredictLiveIndexerOnce,
  type PredictIndexerJobStatus,
  type PredictOracleState,
} from "../src";

describe("DeepBook Predict live indexer", () => {
  test("parses live polling config from args and environment", () => {
    expect(
      parseLiveIndexerCliOptions({
        argv: ["--once", "--trade-limit", "25", "--oracle-trade-limit=12"],
        env: {
          DATABASE_URL: "postgres://example",
          HOT_HANDS_INDEXER_PRICE_POLL_MS: "1000",
          HOT_HANDS_INDEXER_POSITIONS_POLL_MS: "1500",
          HOT_HANDS_INDEXER_ORACLES_POLL_MS: "30000",
          HOT_HANDS_INDEXER_TRADES_POLL_MS: "2000",
        },
      }),
    ).toMatchObject({
      databaseUrl: "postgres://example",
      once: true,
      tradeLimit: 25,
      oracleTradeLimit: 12,
      intervals: {
        oracles: 30_000,
        prices: 1_000,
        positions: 1_500,
        oracleTrades: 2_000,
      },
    });
  });

  test("runs every live ingestion job once and records freshness", async () => {
    const requests: string[] = [];
    const statuses: PredictIndexerJobStatus[] = [];
    const store = createInMemoryPredictIndexerStore();
    let refreshCount = 0;
    let nowMs = 1_779_070_801_000;

    const summary = await runDeepBookPredictLiveIndexerOnce({
      fetchImpl: async (input: RequestInfo | URL) => {
        const url = String(input);
        requests.push(url);

        if (url.endsWith("/status")) {
          return jsonResponse({ status: "OK", latest_onchain_checkpoint: 50 });
        }

        if (url.endsWith(`/predicts/${DEEPBOOK_PREDICT_TESTNET_CONFIG.predictObjectId}/state`)) {
          return jsonResponse({
            predict_id: DEEPBOOK_PREDICT_TESTNET_CONFIG.predictObjectId,
            quote_assets: [DEEPBOOK_PREDICT_TESTNET_CONFIG.quoteAssetType],
          });
        }

        if (url.endsWith(`/predicts/${DEEPBOOK_PREDICT_TESTNET_CONFIG.predictObjectId}/oracles`)) {
          return jsonResponse([btcOracle()]);
        }

        if (url.endsWith("/oracles/btc-fast/prices/latest")) {
          return jsonResponse({
            event_digest: "0xprice",
            event_index: 1,
            oracle_id: "btc-fast",
            spot: "72000000000",
            checkpoint: "48",
            checkpoint_timestamp_ms: "1779070800000",
          });
        }

        if (url.includes("/positions/minted")) {
          return jsonResponse([mintedRow()]);
        }

        if (url.includes("/positions/redeemed")) {
          return jsonResponse([redeemedRow()]);
        }

        if (url.includes("/trades/btc-fast")) {
          return jsonResponse([mintedRow({ event_digest: "0xoracletrade", digest: "0xoracletrade" })]);
        }

        return jsonResponse({ error: "not_found" }, 404);
      },
      nowMs: () => {
        nowMs += 100;
        return nowMs;
      },
      reader: {
        listBtcOracles: async () => [btcOracle()],
        listIndexerJobStatuses: async () => store.listIndexerJobStatuses(),
      },
      writer: {
        upsertOracles: (oracles) => store.upsertOracles(oracles),
        upsertTradeEvents: (events) => store.upsertTradeEvents(events),
        upsertOraclePrices: (points) => store.upsertOraclePrices(points),
        upsertOracleSvi: (points) => store.upsertOracleSvi(points),
        upsertPositionSummaries: (summaries) => store.upsertPositionSummaries(summaries),
        refreshPositionSummaries: async () => {
          refreshCount += 1;
          return store.refreshPositionSummaries();
        },
        upsertIndexerJobStatus: async (status) => {
          statuses.push(status);
          return 1;
        },
      },
      intervals: {
        oracles: 30_000,
        prices: 1_000,
        positions: 1_000,
        oracleTrades: 1_000,
      },
      tradeLimit: 9,
      oracleTradeLimit: 7,
    });

    expect(summary.jobs.map((job) => job.jobName)).toEqual([
      "predict.oracles",
      "predict.prices",
      "predict.positions.minted",
      "predict.positions.redeemed",
      "predict.trades.active_oracles",
    ]);
    expect(statuses.map((status) => status.jobName)).toEqual(summary.jobs.map((job) => job.jobName));
    expect(statuses.every((status) => status.status === "ok")).toBe(true);
    expect(statuses.find((status) => status.jobName === "predict.prices")).toMatchObject({
      rowsFetched: 1,
      rowsWritten: 1,
      lastSourceTimestampMs: 1_779_070_800_000,
      lastCheckpoint: 48,
      lagMs: 1_400,
    });
    expect(requests).toContain(
      `${DEEPBOOK_PREDICT_TESTNET_CONFIG.serverUrl}/positions/minted?limit=9`,
    );
    expect(requests).toContain(
      `${DEEPBOOK_PREDICT_TESTNET_CONFIG.serverUrl}/trades/btc-fast?limit=7`,
    );
    expect(store.snapshot().oracles).toHaveLength(1);
    expect(store.snapshot().tradeEvents).toHaveLength(3);
    expect(refreshCount).toBe(3);
  });
});

function btcOracle(overrides: Partial<PredictOracleState> = {}): PredictOracleState {
  return {
    predict_id: DEEPBOOK_PREDICT_TESTNET_CONFIG.predictObjectId,
    oracle_id: "btc-fast",
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
    oracle_id: "btc-fast",
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
    event_index: 2,
    owner: "0xtrader",
    manager_id: "manager-btc",
    oracle_id: "btc-fast",
    expiry_ms: "1779158400000",
    strike: "72000000000",
    is_up: true,
    quantity: "1",
    payout: "700000",
    checkpoint: "4244",
    checkpoint_timestamp_ms: "1779070801000",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
