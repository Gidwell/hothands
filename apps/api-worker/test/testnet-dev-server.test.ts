import { describe, expect, test } from "bun:test";
import type { PredictIndexerReader } from "@hot-hands/indexer";
import { createTestnetDevServerFetch } from "../src/testnet-dev-server";

describe("testnet API dev server harness", () => {
  test("serves market heat through the live-first projection with deterministic fallback", async () => {
    const fetchHandler = createTestnetDevServerFetch({
      fetchImpl: async () => {
        throw new Error("local testnet offline");
      }
    });

    const response = await fetchHandler(
      new Request("http://127.0.0.1:8789/testnet/market-heat")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("content-type")).toContain("application/json");

    const body = await response.json();
    expect(body.source).toBe("captured_testnet");
    expect(body.mode).toBe("testnet");
    expect(body.rows).toBeArray();
    expect(body.rows.length).toBeGreaterThan(0);
  });

  test("serves market heat from an injected indexer reader before public Predict", async () => {
    let publicPredictFetchCount = 0;
    const fetchHandler = createTestnetDevServerFetch({
      fetchImpl: async () => {
        publicPredictFetchCount += 1;
        throw new Error("public Predict should not be used when indexer has rows");
      },
      indexerReader: createTestIndexerReader()
    });

    const response = await fetchHandler(
      new Request("http://127.0.0.1:8789/testnet/market-heat")
    );

    expect(response.status).toBe(200);
    expect(publicPredictFetchCount).toBe(0);

    await expect(response.json()).resolves.toMatchObject({
      source: "indexed_testnet",
      marketPrice: {
        market: "BTC-USD",
        price: 72000,
        source: "indexed_testnet"
      },
      rows: [
        expect.objectContaining({
          wallet: "0xindexed",
          status: "copy_ready"
        })
      ]
    });
  });

  test("serves testnet quotes through the local PWA harness", async () => {
    const fetchHandler = createTestnetDevServerFetch({
      inspectPredictQuoteQuantity: async ({ quantity }) => ({
        cost: quantity / 2n,
        redeemPayout: quantity / 3n
      })
    });

    const response = await fetchHandler(
      new Request(
        "http://127.0.0.1:8789/testnet/quote?oracleId=0xabc123&expiry=1779158400000&strike=72000000000&side=UP&spendUsd=25"
      )
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");

    const body = await response.json();
    expect(body).toMatchObject({
      source: "live_testnet",
      requestedSpendUsd: 25,
      costUsd: 25,
      payoutUsd: 50,
      maxProfitUsd: 25
    });
  });

  test("serves redeem quotes for local Portfolio close previews", async () => {
    const fetchHandler = createTestnetDevServerFetch({
      inspectPredictQuoteQuantity: async ({ quantity }) => ({
        cost: quantity / 2n,
        redeemPayout: quantity / 4n
      })
    });

    const response = await fetchHandler(
      new Request(
        "http://127.0.0.1:8789/testnet/redeem-quote?oracleId=0xabc123&expiry=1779158400000&strike=72000000000&side=UP&quantity=4000000"
      )
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");

    await expect(response.json()).resolves.toMatchObject({
      source: "live_testnet",
      quantity: "4000000",
      redeemPayout: "1000000",
      redeemPayoutUsd: 1
    });
  });

  test("serves indexed portfolio events for a PredictManager", async () => {
    const fetchHandler = createTestnetDevServerFetch({
      indexerReader: createTestIndexerReader()
    });

    const response = await fetchHandler(
      new Request(
        "http://127.0.0.1:8789/testnet/portfolio-events?managerId=manager-indexed&eventType=mint&limit=25"
      )
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");

    await expect(response.json()).resolves.toEqual({
      data: [
        {
          id: {
            txDigest: "indexed",
            eventSeq: "1",
          },
          parsedJson: {
            manager_id: "manager-indexed",
            oracle_id: "btc-indexed",
            expiry: 1_779_158_400_000,
            strike: 72_000_000_000,
            is_up: true,
            quantity: 1,
            cost: 100_000,
          },
          timestampMs: 1_779_070_800_000,
        },
      ],
      hasNextPage: false,
      nextCursor: null,
    });
  });

  test("requires an indexer reader for indexed portfolio events", async () => {
    const fetchHandler = createTestnetDevServerFetch();

    const response = await fetchHandler(
      new Request(
        "http://127.0.0.1:8789/testnet/portfolio-events?managerId=manager-indexed&eventType=mint"
      )
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "indexer_unavailable",
    });
  });

  test("serves read-only indexer freshness status from the injected reader", async () => {
    const fetchHandler = createTestnetDevServerFetch({
      indexerReader: createTestIndexerReader(),
      nowMs: () => 1_779_070_802_000
    });

    const response = await fetchHandler(
      new Request("http://127.0.0.1:8789/testnet/indexer-status")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");

    await expect(response.json()).resolves.toEqual({
      ok: true,
      source: "indexed_testnet",
      staleJobCount: 0,
      jobs: [
        {
          jobName: "predict.prices",
          source: "oracles/prices/latest",
          pollIntervalMs: 1000,
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
          observedUpdateGapMs: 1000,
          lagMs: 1200,
          updatedAtMs: 1_779_070_801_200,
          stale: false,
        },
        {
          jobName: "predict.positions.minted",
          source: "positions/minted",
          pollIntervalMs: 1000,
          status: "ok",
          lastPollStartedAtMs: 1_779_070_801_000,
          lastPollCompletedAtMs: 1_779_070_801_200,
          lastSuccessAtMs: 1_779_070_801_200,
          lastNewDataAtMs: 1_779_070_000_000,
          lastSourceTimestampMs: 1_779_070_000_000,
          lastCheckpoint: 4000,
          rowsFetched: 0,
          rowsWritten: 0,
          totalRowsWritten: 12,
          consecutiveErrorCount: 0,
          lagMs: 801200,
          updatedAtMs: 1_779_070_801_200,
          stale: false,
        },
      ],
    });
  });

  test("requires an indexer reader for freshness status", async () => {
    const fetchHandler = createTestnetDevServerFetch();

    const response = await fetchHandler(
      new Request("http://127.0.0.1:8789/testnet/indexer-status")
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "indexer_unavailable",
    });
  });

  test("serves oracle price history for the local BTC chart", async () => {
    const fetchHandler = createTestnetDevServerFetch({
      fetchImpl: async (input) => {
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
      }
    });

    const response = await fetchHandler(
      new Request(
        "http://127.0.0.1:8789/testnet/oracle-prices?oracleId=btc-live&maxPoints=10000"
      )
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");

    await expect(response.json()).resolves.toMatchObject({
      source: "live_testnet",
      market: "BTC-USD",
      oracleId: "btc-live",
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
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function createTestIndexerReader(): PredictIndexerReader {
  return {
    listBtcOracles: async () => [
      {
        predict_id: "predict",
        oracle_id: "btc-indexed",
        underlying_asset: "BTC",
        expiry: 1_779_158_400_000,
        activated_at: 1_779_157_500_000,
        min_strike: 50_000_000_000,
        tick_size: 1_000_000,
        status: "active",
      },
    ],
    listRecentTradeEvents: async () => [
      {
        eventId: "mint:indexed:1",
        kind: "mint",
        actor: "0xindexed",
        managerId: "manager-indexed",
        oracleId: "btc-indexed",
        expiryMs: 1_779_158_400_000,
        strike: 72_000_000_000,
        isUp: true,
        quantity: 1,
        cost: 100_000,
        timestampMs: 1_779_070_800_000,
        source: "positions/minted",
      },
    ],
    listPositionSummaries: async () => [],
    listOraclePrices: async () => [],
    getLatestOraclePrice: async () => ({
      eventId: "price:indexed:1",
      oracleId: "btc-indexed",
      spot: 72_000_000_000,
      checkpoint: 101,
      timestampMs: 1_779_070_800_000,
      source: "oracles/prices",
    }),
    getOraclePriceStats: async () => null,
    listIndexerJobStatuses: async () => [
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
      {
        jobName: "predict.positions.minted",
        source: "positions/minted",
        pollIntervalMs: 1_000,
        status: "ok",
        lastPollStartedAtMs: 1_779_070_801_000,
        lastPollCompletedAtMs: 1_779_070_801_200,
        lastSuccessAtMs: 1_779_070_801_200,
        lastNewDataAtMs: 1_779_070_000_000,
        lastSourceTimestampMs: 1_779_070_000_000,
        lastCheckpoint: 4_000,
        rowsFetched: 0,
        rowsWritten: 0,
        totalRowsWritten: 12,
        consecutiveErrorCount: 0,
        lagMs: 801_200,
        updatedAtMs: 1_779_070_801_200,
      },
    ],
  };
}
