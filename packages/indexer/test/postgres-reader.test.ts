import { describe, expect, test } from "bun:test";
import {
  createPostgresPredictIndexerReader,
  type SqlQueryExecutor,
} from "../src/postgres-reader";

describe("Postgres Predict indexer reader", () => {
  test("reads full indexed oracle price history with range filters and downsampling", async () => {
    const calls: SqlCall[] = [];
    const execute: SqlQueryExecutor = async (statement, params = []) => {
      calls.push({ statement, params });
      return {
        rows: Array.from({ length: 7 }, (_, index) => ({
          event_id: `price:${index}`,
          oracle_id: "btc-15m",
          spot: String(70_000_000_000 + index * 1_000_000),
          forward: index === 6 ? "70010000000" : null,
          checkpoint: 100 + index,
          timestamp_ms: 1_779_070_800_000 + index * 1_000,
          source: "oracles/prices",
        })),
      };
    };
    const reader = createPostgresPredictIndexerReader({ execute });

    const points = await reader.listOraclePrices({
      oracleId: "btc-15m",
      fromMs: 1_779_070_800_000,
      toMs: 1_779_070_900_000,
      maxRawPoints: 50_000,
      maxPoints: 4,
    });

    expect(points.map((point) => point.eventId)).toEqual([
      "price:0",
      "price:2",
      "price:4",
      "price:6",
    ]);
    expect(points.at(-1)).toMatchObject({
      oracleId: "btc-15m",
      spot: 70_006_000_000,
      forward: 70_010_000_000,
      checkpoint: 106,
      timestampMs: 1_779_070_806_000,
      source: "oracles/prices",
    });
    expect(calls[0]?.statement).toContain("from predict_oracle_prices");
    expect(calls[0]?.statement).toContain("timestamp_ms >= $2");
    expect(calls[0]?.statement).toContain("timestamp_ms <= $3");
    expect(calls[0]?.statement).toContain("generate_series");
    expect(calls[0]?.statement).toContain("least($4, stats.total_count)");
    expect(calls[0]?.params).toEqual([
      "btc-15m",
      1_779_070_800_000,
      1_779_070_900_000,
      4,
    ]);
  });

  test("reads market heat inputs from indexed raw tables", async () => {
    const execute: SqlQueryExecutor = async (statement) => {
      if (statement.includes("from predict_oracles")) {
        return {
          rows: [
            {
              oracle_id: "btc-15m",
              predict_id: "predict",
              underlying_asset: "BTC",
              expiry_ms: 1_779_158_400_000,
              min_strike: "50000000000",
              tick_size: "1000000",
              status: "active",
              activated_at_ms: 1_779_157_500_000,
              settlement_price: null,
              settled_at_ms: null,
              created_checkpoint: 12,
            },
          ],
        };
      }

      if (statement.includes("from predict_trade_events")) {
        return {
          rows: [
            {
              event_id: "mint:0xabc:1",
              kind: "mint",
              actor: "0xtrader",
              trader: "0xtrader",
              manager_id: "manager",
              oracle_id: "btc-15m",
              expiry_ms: 1_779_158_400_000,
              strike: "72000000000",
              is_up: true,
              quantity: "3",
              cost: "1200000",
              payout: null,
              transaction_digest: "0xabc",
              checkpoint: 100,
              timestamp_ms: 1_779_070_800_000,
              source: "positions/minted",
            },
          ],
        };
      }

      if (statement.includes("from predict_position_summaries")) {
        return {
          rows: [
            {
              position_id: "manager:btc-15m:1779158400000:72000000000:UP",
              owner: "0xtrader",
              manager_id: "manager",
              oracle_id: "btc-15m",
              expiry_ms: 1_779_158_400_000,
              strike: "72000000000",
              is_up: true,
              minted_quantity: "3",
              redeemed_quantity: "0",
              open_quantity: "3",
              cost: "1200000",
              payout: "0",
              realized_pnl: "-1200000",
              status: "open",
              last_event_ms: 1_779_070_800_000,
            },
          ],
        };
      }

      return { rows: [] };
    };
    const reader = createPostgresPredictIndexerReader({ execute });

    await expect(reader.listBtcOracles({ includeSettled: true })).resolves.toEqual([
      {
        predict_id: "predict",
        oracle_id: "btc-15m",
        underlying_asset: "BTC",
        expiry: 1_779_158_400_000,
        min_strike: 50_000_000_000,
        tick_size: 1_000_000,
        status: "active",
        activated_at: 1_779_157_500_000,
        created_checkpoint: 12,
      },
    ]);
    await expect(reader.listRecentTradeEvents({ limit: 1 })).resolves.toEqual([
      {
        eventId: "mint:0xabc:1",
        kind: "mint",
        actor: "0xtrader",
        trader: "0xtrader",
        managerId: "manager",
        oracleId: "btc-15m",
        expiryMs: 1_779_158_400_000,
        strike: 72_000_000_000,
        isUp: true,
        quantity: 3,
        cost: 1_200_000,
        transactionDigest: "0xabc",
        checkpoint: 100,
        timestampMs: 1_779_070_800_000,
        source: "positions/minted",
      },
    ]);
    await expect(reader.listPositionSummaries({ limit: 1 })).resolves.toEqual([
      {
        id: "manager:btc-15m:1779158400000:72000000000:UP",
        owner: "0xtrader",
        managerId: "manager",
        oracleId: "btc-15m",
        expiryMs: 1_779_158_400_000,
        strike: 72_000_000_000,
        isUp: true,
        mintedQuantity: 3,
        redeemedQuantity: 0,
        openQuantity: 3,
        cost: 1_200_000,
        payout: 0,
        realizedPnl: -1_200_000,
        lastEventMs: 1_779_070_800_000,
        status: "open",
      },
    ]);
  });

  test("filters indexed trade events by manager and kind for portfolio reads", async () => {
    const calls: SqlCall[] = [];
    const execute: SqlQueryExecutor = async (statement, params = []) => {
      calls.push({ statement, params });
      return { rows: [] };
    };
    const reader = createPostgresPredictIndexerReader({ execute });

    await reader.listRecentTradeEvents({
      kind: "mint",
      limit: 25,
      managerId: "manager-btc",
    });

    expect(calls[0]?.statement).toContain("manager_id = $1");
    expect(calls[0]?.statement).toContain("kind = $2");
    expect(calls[0]?.statement).toContain("limit $3");
    expect(calls[0]?.params).toEqual(["manager-btc", "mint", 25]);
  });

  test("reads the latest indexed oracle price without using ascending history order", async () => {
    const calls: SqlCall[] = [];
    const execute: SqlQueryExecutor = async (statement, params = []) => {
      calls.push({ statement, params });
      return {
        rows: [
          {
            event_id: "price:latest",
            oracle_id: "btc-15m",
            spot: "72050000000",
            forward: null,
            checkpoint: 102,
            timestamp_ms: 1_779_070_860_000,
            source: "oracles/prices",
          },
        ],
      };
    };
    const reader = createPostgresPredictIndexerReader({ execute });

    await expect(reader.getLatestOraclePrice("btc-15m")).resolves.toMatchObject({
      eventId: "price:latest",
      oracleId: "btc-15m",
      spot: 72_050_000_000,
      timestampMs: 1_779_070_860_000,
    });
    expect(calls[0]?.statement).toContain("order by timestamp_ms desc");
    expect(calls[0]?.params).toEqual(["btc-15m"]);
  });

  test("reads indexed oracle price range statistics for full-history chart metadata", async () => {
    const execute: SqlQueryExecutor = async () => ({
      rows: [
        {
          total_point_count: "86400",
          start_timestamp_ms: "1778985000000",
          end_timestamp_ms: "1779071400000",
        },
      ],
    });
    const reader = createPostgresPredictIndexerReader({ execute });

    await expect(reader.getOraclePriceStats("btc-15m")).resolves.toEqual({
      totalPointCount: 86_400,
      startTimestampMs: 1_778_985_000_000,
      endTimestampMs: 1_779_071_400_000,
    });
  });

  test("reads live indexer job freshness ordered by job name", async () => {
    const calls: SqlCall[] = [];
    const execute: SqlQueryExecutor = async (statement, params = []) => {
      calls.push({ statement, params });
      return {
        rows: [
          {
            job_name: "predict.prices",
            source: "oracles/prices/latest",
            poll_interval_ms: "1000",
            status: "ok",
            last_poll_started_at_ms: "1779070801000",
            last_poll_completed_at_ms: "1779070801200",
            last_success_at_ms: "1779070801200",
            last_new_data_at_ms: "1779070801200",
            last_source_timestamp_ms: "1779070800000",
            last_checkpoint: "4242",
            rows_fetched: "3",
            rows_written: "2",
            total_rows_written: "12",
            consecutive_error_count: "0",
            last_error: null,
            observed_update_gap_ms: "1000",
            lag_ms: "1200",
            updated_at_ms: "1779070801200",
          },
        ],
      };
    };
    const reader = createPostgresPredictIndexerReader({ execute });

    await expect(reader.listIndexerJobStatuses()).resolves.toEqual([
      {
        jobName: "predict.prices",
        source: "oracles/prices/latest",
        pollIntervalMs: 1_000,
        status: "ok",
        lastPollStartedAtMs: 1_779_070_801_000,
        lastPollCompletedAtMs: 1_779_070_801_200,
        lastSuccessAtMs: 1_779_070_801_200,
        lastNewDataAtMs: 1_779_070_801_200,
        lastSourceTimestampMs: 1_779_070_800_000,
        lastCheckpoint: 4242,
        rowsFetched: 3,
        rowsWritten: 2,
        totalRowsWritten: 12,
        consecutiveErrorCount: 0,
        observedUpdateGapMs: 1_000,
        lagMs: 1_200,
        updatedAtMs: 1_779_070_801_200,
      },
    ]);
    expect(calls[0]?.statement).toContain("from predict_indexer_jobs");
    expect(calls[0]?.statement).toContain("order by job_name asc");
    expect(calls[0]?.params).toEqual([]);
  });
});

type SqlCall = {
  statement: string;
  params: readonly unknown[];
};
