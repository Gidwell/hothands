import { describe, expect, test } from "bun:test";
import {
  DEEPBOOK_PREDICT_TESTNET_CONFIG,
  computeLiveIndexerNextPollDelayMs,
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
          HOT_HANDS_INDEXER_SVI_POLL_MS: "1000",
          HOT_HANDS_INDEXER_POSITIONS_POLL_MS: "1500",
          HOT_HANDS_INDEXER_ORACLES_POLL_MS: "30000",
          HOT_HANDS_INDEXER_TRADES_POLL_MS: "2000",
        },
      }),
    ).toMatchObject({
      backoff: {
        jitterRatio: 0.2,
        maxDelayMs: 120_000,
        rateLimitFloorMs: 5_000,
      },
      databaseUrl: "postgres://example",
      once: true,
      startupPriceBackfill: undefined,
      tradeLimit: 25,
      oracleTradeLimit: 12,
      intervals: {
        oracles: 30_000,
        prices: 1_000,
        svi: 1_000,
        positions: 1_500,
        oracleTrades: 2_000,
      },
    });
  });

  test("parses live indexer backoff config from environment", () => {
    expect(
      parseLiveIndexerCliOptions({
        argv: [],
        env: {
          DATABASE_URL: "postgres://example",
          HOT_HANDS_INDEXER_BACKOFF_JITTER_RATIO: "0.1",
          HOT_HANDS_INDEXER_BACKOFF_MAX_MS: "45000",
          HOT_HANDS_INDEXER_RATE_LIMIT_BACKOFF_FLOOR_MS: "3000",
        },
      }),
    ).toMatchObject({
      backoff: {
        jitterRatio: 0.1,
        maxDelayMs: 45_000,
        rateLimitFloorMs: 3_000,
      },
    });
  });

  test("backs off 429 polling errors with jitter and a bounded cap", () => {
    const status = indexerErrorStatus({
      consecutiveErrorCount: 3,
      lastError:
        "Predict server request failed (429) for https://predict-server.testnet.mystenlabs.com/positions/minted?limit=250.",
    });

    expect(
      computeLiveIndexerNextPollDelayMs({
        backoff: { jitterRatio: 0, maxDelayMs: 120_000, rateLimitFloorMs: 5_000 },
        baseIntervalMs: 1_000,
        status,
      }),
    ).toBe(20_000);
    expect(
      computeLiveIndexerNextPollDelayMs({
        backoff: {
          jitterRatio: 0.2,
          maxDelayMs: 120_000,
          random: () => 1,
          rateLimitFloorMs: 5_000,
        },
        baseIntervalMs: 1_000,
        status,
      }),
    ).toBe(24_000);
    expect(
      computeLiveIndexerNextPollDelayMs({
        backoff: { jitterRatio: 0, maxDelayMs: 60_000, rateLimitFloorMs: 5_000 },
        baseIntervalMs: 1_000,
        status: indexerErrorStatus({
          consecutiveErrorCount: 10,
          lastError: "Predict server request failed (429).",
        }),
      }),
    ).toBe(60_000);
  });

  test("keeps successful polling near the base interval with jitter", () => {
    expect(
      computeLiveIndexerNextPollDelayMs({
        backoff: { jitterRatio: 0.2, random: () => 0.5 },
        baseIntervalMs: 1_000,
        status: {
          ...indexerOkStatus(),
          consecutiveErrorCount: 0,
        },
      }),
    ).toBe(1_000);
    expect(
      computeLiveIndexerNextPollDelayMs({
        backoff: { jitterRatio: 0.2, random: () => 0 },
        baseIntervalMs: 1_000,
        status: indexerOkStatus(),
      }),
    ).toBe(800);
  });

  test("parses optional startup price history backfill config", () => {
    expect(
      parseLiveIndexerCliOptions({
        argv: [],
        env: {
          DATABASE_URL: "postgres://example",
          HOT_HANDS_INDEXER_STARTUP_PRICE_BACKFILL_DAYS: "3",
          HOT_HANDS_INDEXER_STARTUP_PRICE_SAMPLE_MS: "60000",
          HOT_HANDS_INDEXER_STARTUP_PRICE_WINDOW_CONCURRENCY: "3",
          HOT_HANDS_INDEXER_STARTUP_PRICE_WINDOW_MS: "1800000",
        },
      }),
    ).toMatchObject({
      startupPriceBackfill: {
        priceSampleMs: 60_000,
        priceWindowConcurrency: 3,
        priceWindowDays: 3,
        priceWindowMs: 1_800_000,
      },
    });
  });

  test("uses small latest-page trade defaults for live polling", () => {
    expect(
      parseLiveIndexerCliOptions({
        argv: [],
        env: {
          DATABASE_URL: "postgres://example",
        },
      }),
    ).toMatchObject({
      tradeLimit: 250,
      oracleTradeLimit: 50,
      intervals: {
        positions: 5_000,
        oracleTrades: 1_000,
        prices: 1_000,
      },
    });
  });

  test("uses one-second startup chart backfill buckets by default", () => {
    expect(
      parseLiveIndexerCliOptions({
        argv: [],
        env: {
          DATABASE_URL: "postgres://example",
          HOT_HANDS_INDEXER_STARTUP_PRICE_BACKFILL_DAYS: "3",
        },
      }),
    ).toMatchObject({
      startupPriceBackfill: {
        priceSampleMs: 1_000,
        priceWindowConcurrency: 2,
        priceWindowDays: 3,
        priceWindowMs: 60 * 60_000,
      },
    });
  });

  test("enables bounded expired series pruning by default", () => {
    expect(
      parseLiveIndexerCliOptions({
        argv: [
          "--maintenance-poll-ms",
          "30000",
          "--prune-batch-oracle-limit=25",
          "--prune-max-batches",
          "4",
          "--prune-retention-ms",
          "60000",
          "--prune-vacuum",
        ],
        env: {
          DATABASE_URL: "postgres://example",
        },
      }),
    ).toMatchObject({
      expiredSeriesPrune: {
        batchOracleLimit: 25,
        maxBatches: 4,
        retentionMs: 60_000,
        vacuum: true,
      },
      intervals: {
        maintenance: 30_000,
      },
    });

    expect(
      parseLiveIndexerCliOptions({
        argv: ["--skip-prune-expired-series"],
        env: { DATABASE_URL: "postgres://example" },
      }),
    ).toMatchObject({
      expiredSeriesPrune: undefined,
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

        if (url.endsWith("/oracles/btc-fast/svi?limit=1")) {
          return jsonResponse([
            {
              event_digest: "0xsvi",
              event_index: 2,
              oracle_id: "btc-fast",
              a: "43176",
              b: "2305586",
              rho: "812089434",
              rho_negative: true,
              m: "4328013",
              m_negative: true,
              sigma: "5248731",
              checkpoint: "49",
              checkpoint_timestamp_ms: "1779070800500",
            },
          ]);
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
        svi: 1_000,
        positions: 1_000,
        oracleTrades: 1_000,
      },
      tradeLimit: 9,
      oracleTradeLimit: 7,
    });

    expect(summary.jobs.map((job) => job.jobName)).toEqual([
      "predict.oracles",
      "predict.prices",
      "predict.svi",
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
    expect(requests).toContain(
      `${DEEPBOOK_PREDICT_TESTNET_CONFIG.serverUrl}/oracles/btc-fast/svi?limit=1`,
    );
    expect(store.snapshot().oracles).toHaveLength(1);
    expect(store.snapshot().oracleSvi).toHaveLength(1);
    expect(store.snapshot().tradeEvents).toHaveLength(3);
    expect(refreshCount).toBe(3);
  });

  test("skips duplicate global position pages after live watermarks", async () => {
    const store = createInMemoryPredictIndexerStore();
    const tradeBatchSizes: number[] = [];
    let refreshCount = 0;
    let nowMs = 1_779_070_801_000;

    const options = {
      fetchImpl: liveIndexerFetchFixture,
      nowMs: () => {
        nowMs += 100;
        return nowMs;
      },
      reader: {
        listBtcOracles: async () => [btcOracle()],
        listIndexerJobStatuses: async () => store.listIndexerJobStatuses(),
      },
      writer: {
        upsertOracles: (oracles: Parameters<typeof store.upsertOracles>[0]) =>
          store.upsertOracles(oracles),
        upsertTradeEvents: (events: Parameters<typeof store.upsertTradeEvents>[0]) => {
          tradeBatchSizes.push(events.length);
          return store.upsertTradeEvents(events);
        },
        upsertOraclePrices: (points: Parameters<typeof store.upsertOraclePrices>[0]) =>
          store.upsertOraclePrices(points),
        upsertOracleSvi: (points: Parameters<typeof store.upsertOracleSvi>[0]) =>
          store.upsertOracleSvi(points),
        upsertPositionSummaries: (
          summaries: Parameters<typeof store.upsertPositionSummaries>[0],
        ) => store.upsertPositionSummaries(summaries),
        refreshPositionSummaries: async () => {
          refreshCount += 1;
          return store.refreshPositionSummaries();
        },
        upsertIndexerJobStatus: (status: PredictIndexerJobStatus) =>
          store.upsertIndexerJobStatus(status),
      },
      tradeLimit: 9,
      oracleTradeLimit: 7,
    };

    await runDeepBookPredictLiveIndexerOnce(options);
    expect(tradeBatchSizes).toEqual([1, 1, 1]);
    expect(refreshCount).toBe(3);

    tradeBatchSizes.length = 0;
    refreshCount = 0;
    await runDeepBookPredictLiveIndexerOnce(options);

    expect(tradeBatchSizes).toEqual([0, 0, 1]);
    expect(refreshCount).toBe(0);
    await expect(
      store.listIndexerJobStatuses().then((statuses) =>
        statuses.find((status) => status.jobName === "predict.positions.minted"),
      ),
    ).resolves.toMatchObject({
      lastSourceTimestampMs: 1_779_070_800_000,
      rowsFetched: 1,
      rowsWritten: 0,
    });
  });

  test("runs expired price and SVI pruning as a live maintenance job when provided", async () => {
    const store = createInMemoryPredictIndexerStore();
    let pruneCount = 0;
    let nowMs = 1_779_070_801_000;

    const summary = await runDeepBookPredictLiveIndexerOnce({
      fetchImpl: liveIndexerFetchFixture,
      nowMs: () => {
        nowMs += 100;
        return nowMs;
      },
      pruneExpiredSeries: async () => {
        pruneCount += 1;
        return {
          dryRun: false,
          cutoffMs: nowMs,
          prices: {
            tableName: "predict_oracle_prices",
            batchOracleLimit: 100,
            batchesRun: 1,
            candidateRows: 0,
            rowsDeleted: 70,
            stoppedBecause: "max_batches",
          },
          svi: {
            tableName: "predict_oracle_svi",
            batchOracleLimit: 100,
            batchesRun: 1,
            candidateRows: 0,
            rowsDeleted: 8,
            stoppedBecause: "empty",
          },
          vacuumedTables: [],
        };
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
        refreshPositionSummaries: () => store.refreshPositionSummaries(),
        upsertIndexerJobStatus: (status) => store.upsertIndexerJobStatus(status),
      },
    });

    expect(pruneCount).toBe(1);
    expect(summary.jobs.at(-1)).toMatchObject({
      jobName: "predict.maintenance.prune_expired_series",
      source: "postgres/expired-oracle-series",
      rowsFetched: 2,
      rowsWritten: 78,
      status: "ok",
    });
  });
});

async function liveIndexerFetchFixture(input: RequestInfo | URL) {
  const url = String(input);

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

  if (url.endsWith("/oracles/btc-fast/svi?limit=1")) {
    return jsonResponse([
      {
        event_digest: "0xsvi",
        event_index: 2,
        oracle_id: "btc-fast",
        a: "43176",
        b: "2305586",
        rho: "812089434",
        rho_negative: true,
        m: "4328013",
        m_negative: true,
        sigma: "5248731",
        checkpoint: "49",
        checkpoint_timestamp_ms: "1779070800500",
      },
    ]);
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
}

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

function indexerOkStatus(
  overrides: Partial<PredictIndexerJobStatus> = {},
): PredictIndexerJobStatus {
  return {
    jobName: "predict.positions.minted",
    source: "positions/minted",
    pollIntervalMs: 1_000,
    status: "ok",
    lastPollStartedAtMs: 1_000,
    lastPollCompletedAtMs: 1_100,
    lastSuccessAtMs: 1_100,
    rowsFetched: 1,
    rowsWritten: 1,
    totalRowsWritten: 1,
    consecutiveErrorCount: 0,
    updatedAtMs: 1_100,
    ...overrides,
  };
}

function indexerErrorStatus(
  overrides: Partial<PredictIndexerJobStatus> = {},
): PredictIndexerJobStatus {
  return {
    ...indexerOkStatus(),
    status: "error",
    rowsFetched: 0,
    rowsWritten: 0,
    consecutiveErrorCount: 1,
    lastError: "Predict server request failed.",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
