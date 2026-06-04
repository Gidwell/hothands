import { describe, expect, test } from "bun:test";
import { createIndexerReadersFromSqlClient } from "../src/indexer-readers";
import type { PostgresSqlClient } from "@hot-hands/indexer/src/postgres-client";

describe("API indexer readers", () => {
  test("loads indexed oracle price history with full range metadata", async () => {
    const calls: string[] = [];
    const client: PostgresSqlClient = {
      execute: async (statement, params = []) => {
        calls.push(statement);

        if (statement.includes("count(*) as total_point_count")) {
          expect(params).toEqual(["btc-15m"]);
          return {
            rows: [
              {
                total_point_count: "86400",
                start_timestamp_ms: "1778985000000",
                end_timestamp_ms: "1779071400000",
              },
            ],
            rowCount: 1,
          };
        }

        if (statement.includes("order by timestamp_ms desc")) {
          expect(params).toEqual(["btc-15m"]);
          return {
            rows: [
              {
                event_id: "price:latest",
                oracle_id: "btc-15m",
                spot: "72050000000",
                forward: null,
                checkpoint: 102,
                timestamp_ms: 1_779_071_400_000,
                source: "oracles/prices",
              },
            ],
            rowCount: 1,
          };
        }

        expect(params).toEqual(["btc-15m", 10_000]);
        return {
          rows: [
            {
              event_id: "price:old",
              oracle_id: "btc-15m",
              spot: "72000000000",
              forward: null,
              checkpoint: 101,
              timestamp_ms: 1_779_070_800_000,
              source: "oracles/prices",
            },
            {
              event_id: "price:new",
              oracle_id: "btc-15m",
              spot: "72050000000",
              forward: "72070000000",
              checkpoint: 102,
              timestamp_ms: 1_779_071_400_000,
              source: "oracles/prices",
            },
          ],
          rowCount: 2,
        };
      },
      close: async () => {},
    };

    const readers = createIndexerReadersFromSqlClient(client);
    const history = await readers.indexedOraclePriceHistoryLoader({
      market: "BTC-USD",
      oracleId: "btc-15m",
      maxPoints: 10_000,
    });

    expect(history).toEqual({
      latestPrice: 72050,
      startTimestampMs: 1_778_985_000_000,
      endTimestampMs: 1_779_071_400_000,
      totalPointCount: 86_400,
      downsampled: true,
      points: [
        {
          timestampMs: 1_779_070_800_000,
          price: 72000,
          checkpoint: 101,
        },
        {
          timestampMs: 1_779_071_400_000,
          price: 72050,
          forwardPrice: 72070,
          checkpoint: 102,
        },
      ],
    });
    expect(calls).toHaveLength(3);
  });
});
