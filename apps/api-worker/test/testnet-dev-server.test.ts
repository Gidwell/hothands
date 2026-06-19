import { describe, expect, test } from "bun:test";
import type { PredictIndexerReader } from "@hot-hands/indexer";
import type {
  CopyReceipt,
  HotHandsAppStore,
  UpsertWalletFollowInput,
  UpsertWalletProfileInput,
  WalletAuthChallenge,
  WalletFollow,
  WalletProfile,
  WalletSession,
} from "../src/app-storage";
import { createTestnetDevServerFetch } from "../src/testnet-dev-server";
import {
  clearMainnetSuinsNameCacheForTest,
  getMainnetSuinsNames,
} from "../src/suins-names";

describe("testnet API dev server harness", () => {
  test("creates wallet auth challenges and sessions with signed personal messages", async () => {
    const wallet =
      "0x00000000000000000000000000000000000000000000000000000000000000a1";
    const challenges: WalletAuthChallenge[] = [];
    const sessions: WalletSession[] = [];
    const verifierCalls: unknown[] = [];
    const fetchHandler = createTestnetDevServerFetch({
      appStore: createTestAppStore({
        challenges,
        sessions,
      }),
      createSessionToken: () => "test-session-token",
      randomId: () => "test-random-id",
      verifyWalletSignature: async (input) => {
        verifierCalls.push(input);
      },
      nowMs: () => 1_000,
    });

    const challengeResponse = await fetchHandler(
      new Request("http://127.0.0.1:8789/app/auth/challenge", {
        method: "POST",
        body: JSON.stringify({ wallet }),
      }),
    );

    expect(challengeResponse.status).toBe(200);
    expect(challengeResponse.headers.get("access-control-allow-headers")).toContain(
      "authorization",
    );
    const challengeBody = await challengeResponse.json();
    expect(challengeBody).toMatchObject({
      wallet,
      nonce: "test-random-id",
      expiresAtMs: 301_000,
    });
    expect(challenges[0]).toMatchObject({
      challengeId: "test-random-id",
      wallet,
      nonce: "test-random-id",
      expiresAtMs: 301_000,
    });
    expect(challengeBody.message).toBe(
      [
        "Sign in to Hot Hands",
        "",
        `Wallet: ${wallet}`,
        "Nonce: test-random-id",
        "Issued: 1970-01-01T00:00:01.000Z",
      ].join("\n"),
    );
    expect(challengeBody.message).not.toContain("This signature only authenticates");

    const sessionResponse = await fetchHandler(
      new Request("http://127.0.0.1:8789/app/auth/session", {
        method: "POST",
        body: JSON.stringify({
          wallet,
          nonce: "test-random-id",
          signature: "signed-message",
        }),
      }),
    );

    expect(sessionResponse.status).toBe(200);
    await expect(sessionResponse.json()).resolves.toMatchObject({
      wallet,
      token: "test-session-token",
      expiresAtMs: 2_592_001_000,
    });
    expect(verifierCalls).toEqual([
      {
        wallet,
        message: challenges[0]?.message,
        signature: "signed-message",
      },
    ]);
    expect(sessions[0]).toMatchObject({
      sessionId: "test-random-id",
      wallet,
      issuedAtMs: 1_000,
      expiresAtMs: 2_592_001_000,
    });
    expect(sessions[0]?.tokenHash).not.toBe("test-session-token");
  });

  test("persists followed wallets and copy receipts behind wallet auth", async () => {
    const wallet =
      "0x00000000000000000000000000000000000000000000000000000000000000a1";
    const leaderWallet =
      "0x00000000000000000000000000000000000000000000000000000000000000b2";
    const follows: WalletFollow[] = [];
    const followWrites: UpsertWalletFollowInput[] = [];
    const receipts: CopyReceipt[] = [];
    const fetchHandler = createTestnetDevServerFetch({
      appStore: createTestAppStore({
        follows,
        followWrites,
        receipts,
        session: {
          sessionId: "session-1",
          wallet,
          tokenHash: "hash",
          issuedAtMs: 1_000,
          expiresAtMs: 5_000,
        },
      }),
      nowMs: () => 2_000,
    });

    const followResponse = await fetchHandler(
      new Request("http://127.0.0.1:8789/app/follows", {
        method: "POST",
        headers: { authorization: "Bearer session-token" },
        body: JSON.stringify({
          leaderWallet,
          leaderDisplayName: "leader.sui",
        }),
      }),
    );

    expect(followResponse.status).toBe(200);
    await expect(followResponse.json()).resolves.toEqual({
      wallet,
      follows: [
        {
          followerWallet: wallet,
          leaderWallet,
          leaderDisplayName: "leader.sui",
          createdAtMs: 2_000,
          updatedAtMs: 2_000,
        },
      ],
    });
    expect(followWrites).toEqual([
      {
        followerWallet: wallet,
        leaderWallet,
        leaderDisplayName: "leader.sui",
        nowMs: 2_000,
      },
    ]);

    const receiptResponse = await fetchHandler(
      new Request("http://127.0.0.1:8789/app/copy-receipts", {
        method: "POST",
        headers: { authorization: "Bearer session-token" },
        body: JSON.stringify({
          receiptId: "receipt-1",
          sourceWallet: leaderWallet,
          sourcePositionId: "source-position",
          copiedPositionId: "copied-position",
          mode: "fade",
          status: "submitted",
          sourceSide: "UP",
          executionSide: "DOWN",
          amountUsd: 25,
          transactionDigest: "0xdigest",
        }),
      }),
    );

    expect(receiptResponse.status).toBe(200);
    await expect(receiptResponse.json()).resolves.toMatchObject({
      receipt: {
        receiptId: "receipt-1",
        copierWallet: wallet,
        sourceWallet: leaderWallet,
        mode: "fade",
        executionSide: "DOWN",
      },
    });
    expect(receipts[0]).toMatchObject({
      receiptId: "receipt-1",
      copierWallet: wallet,
      sourceWallet: leaderWallet,
      mode: "fade",
      status: "submitted",
      createdAtMs: 2_000,
      updatedAtMs: 2_000,
    });
  });

  test("reads public profile follows without wallet auth", async () => {
    const profileWallet =
      "0x00000000000000000000000000000000000000000000000000000000000000a1";
    const leaderWallet =
      "0x00000000000000000000000000000000000000000000000000000000000000b2";
    const otherWallet =
      "0x00000000000000000000000000000000000000000000000000000000000000c3";
    const fetchHandler = createTestnetDevServerFetch({
      appStore: createTestAppStore({
        follows: [
          {
            followerWallet: profileWallet,
            leaderWallet,
            leaderDisplayName: "leader.sui",
            createdAtMs: 1_000,
            updatedAtMs: 2_000,
          },
          {
            followerWallet: otherWallet,
            leaderWallet: profileWallet,
            createdAtMs: 1_000,
            updatedAtMs: 2_000,
          },
        ],
      }),
      nowMs: () => 2_000,
    });

    const response = await fetchHandler(
      new Request(`http://127.0.0.1:8789/app/follows?wallet=${profileWallet}`),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      wallet: profileWallet,
      follows: [
        {
          followerWallet: profileWallet,
          leaderWallet,
          leaderDisplayName: "leader.sui",
          createdAtMs: 1_000,
          updatedAtMs: 2_000,
        },
      ],
    });
  });

  test("claims and updates wallet profiles behind wallet auth", async () => {
    const wallet =
      "0x00000000000000000000000000000000000000000000000000000000000000a1";
    const profiles: WalletProfile[] = [];
    const profileWrites: UpsertWalletProfileInput[] = [];
    const fetchHandler = createTestnetDevServerFetch({
      appStore: createTestAppStore({
        profiles,
        profileWrites,
        session: {
          sessionId: "session-1",
          wallet,
          tokenHash: "hash",
          issuedAtMs: 1_000,
          expiresAtMs: 10_000,
        },
      }),
      nowMs: () => 2_000,
    });

    const meResponse = await fetchHandler(
      new Request("http://127.0.0.1:8789/app/me", {
        headers: { authorization: "Bearer session-token" },
      }),
    );

    expect(meResponse.status).toBe(200);
    await expect(meResponse.json()).resolves.toMatchObject({
      wallet,
      profile: {
        wallet,
        createdAtMs: 2_000,
        updatedAtMs: 2_000,
      },
    });

    const updateResponse = await fetchHandler(
      new Request("http://127.0.0.1:8789/app/me/profile", {
        method: "PATCH",
        headers: { authorization: "Bearer session-token" },
        body: JSON.stringify({
          displayName: "Alice",
          defaultStakeAmountUsd: 42.5,
        }),
      }),
    );

    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toMatchObject({
      profile: {
        wallet,
        displayName: "Alice",
        defaultStakeAmountUsd: 42.5,
        updatedAtMs: 2_000,
      },
    });
    expect(profileWrites.at(-1)).toMatchObject({
      wallet,
      displayName: "Alice",
      defaultStakeAmountUsd: 42.5,
      nowMs: 2_000,
    });

    const publicResponse = await fetchHandler(
      new Request(`http://127.0.0.1:8789/app/profiles?wallet=${wallet}&wallet=not-a-wallet`),
    );

    expect(publicResponse.status).toBe(200);
    const publicPayload = await publicResponse.json();
    expect(publicPayload).toMatchObject({
      profiles: [
        {
          wallet,
          displayName: "Alice",
        },
      ],
      skipped: ["not-a-wallet"],
    });
    expect(publicPayload.profiles[0]).not.toHaveProperty("defaultStakeAmountUsd");
  });

  test("rejects app social writes without an active wallet session", async () => {
    const fetchHandler = createTestnetDevServerFetch({
      appStore: createTestAppStore(),
      nowMs: () => 2_000,
    });

    const response = await fetchHandler(
      new Request("http://127.0.0.1:8789/app/follows", {
        method: "POST",
        body: JSON.stringify({
          leaderWallet:
            "0x00000000000000000000000000000000000000000000000000000000000000b2",
        }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "auth_required",
    });
  });

  test("serves mainnet SuiNS names as a display-only testnet overlay", async () => {
    clearMainnetSuinsNameCacheForTest();

    const wallet =
      "0x00000000000000000000000000000000000000000000000000000000000000a1";
    const calls: unknown[] = [];
    const fetchHandler = createTestnetDevServerFetch({
      fetchImpl: async (_input, init) => {
        calls.push(JSON.parse(String(init?.body)));

        return Response.json({
          result: {
            data: ["alice.sui"],
            hasNextPage: false,
            nextCursor: null,
          },
        });
      },
    });

    const response = await fetchHandler(
      new Request(
        `http://127.0.0.1:8789/testnet/mainnet-suins-names?wallet=${wallet}&wallet=not-a-wallet`,
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(calls).toEqual([
      {
        jsonrpc: "2.0",
        id: wallet,
        method: "suix_resolveNameServiceNames",
        params: [wallet, null, 1],
      },
    ]);
    await expect(response.json()).resolves.toEqual({
      source: "mainnet_suins",
      network: "mainnet",
      names: [
        {
          wallet,
          name: "alice.sui",
          source: "mainnet_suins",
        },
      ],
      missing: [],
      skipped: ["not-a-wallet"],
      failed: [],
    });
  });

  test("backs off failed mainnet SuiNS lookups", async () => {
    clearMainnetSuinsNameCacheForTest();

    let now = 1_000;
    let calls = 0;
    const wallet =
      "0x00000000000000000000000000000000000000000000000000000000000000b2";
    const url = new URL(
      `http://127.0.0.1:8789/testnet/mainnet-suins-names?wallet=${wallet}`,
    );
    const fetchImpl = async () => {
      calls += 1;
      return new Response("mainnet unavailable", { status: 503 });
    };

    await expect(
      getMainnetSuinsNames(url, { fetchImpl, nowMs: () => now }),
    ).resolves.toMatchObject({
      failed: [wallet],
      missing: [],
      names: [],
    });

    now += 1_000;
    await expect(
      getMainnetSuinsNames(url, { fetchImpl, nowMs: () => now }),
    ).resolves.toMatchObject({
      failed: [wallet],
      missing: [],
      names: [],
    });
    expect(calls).toBe(1);

    now += 61_000;
    await getMainnetSuinsNames(url, { fetchImpl, nowMs: () => now });
    expect(calls).toBe(2);
  });

  test("applies mainnet SuiNS lookup limits after validation and dedupe", async () => {
    clearMainnetSuinsNameCacheForTest();

    const wallet =
      "0x00000000000000000000000000000000000000000000000000000000000000c3";
    const url = new URL("http://127.0.0.1:8789/testnet/mainnet-suins-names");
    for (let index = 0; index < 50; index += 1) {
      url.searchParams.append("wallet", `not-a-wallet-${index}`);
    }
    url.searchParams.append("wallet", wallet);
    url.searchParams.append("wallet", wallet);

    const calls: unknown[] = [];
    const response = await getMainnetSuinsNames(url, {
      fetchImpl: async (_input, init) => {
        calls.push(JSON.parse(String(init?.body)));

        return Response.json({
          result: {
            data: ["limit-test.sui"],
            hasNextPage: false,
            nextCursor: null,
          },
        });
      },
    });

    expect(calls).toHaveLength(1);
    expect(response.skipped).toHaveLength(50);
    expect(response.names).toEqual([
      {
        wallet,
        name: "limit-test.sui",
        source: "mainnet_suins",
      },
    ]);
  });

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
      indexerReader: createTestIndexerReader(),
      nowMs: () => 1_779_070_802_000
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

  test("passes includeExpired market heat requests to the local indexer reader", async () => {
    const tradeEventRequests: unknown[] = [];
    const baseReader = createTestIndexerReader();
    const fetchHandler = createTestnetDevServerFetch({
      fetchImpl: async () => {
        throw new Error("public Predict should not be used when indexer has rows");
      },
      indexerReader: createTestIndexerReader({
        listRecentTradeEvents: async (options) => {
          tradeEventRequests.push(options);
          return baseReader.listRecentTradeEvents(options);
        }
      })
    });

    const response = await fetchHandler(
      new Request("http://127.0.0.1:8789/testnet/market-heat?includeExpired=true")
    );

    expect(response.status).toBe(200);
    expect(tradeEventRequests).toEqual([
      {
        limit: expect.any(Number)
      }
    ]);
  });

  test("caches indexed market heat for a short read-through window", async () => {
    let now = 1_779_070_802_000;
    const oracleRequests: unknown[] = [];
    const reader = createTestIndexerReader({
      listBtcOracles: async (options) => {
        oracleRequests.push(options);
        return [
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
        ];
      }
    });
    const fetchHandler = createTestnetDevServerFetch({
      indexerReader: reader,
      nowMs: () => now
    });

    const first = await fetchHandler(
      new Request("http://127.0.0.1:8789/testnet/market-heat")
    );
    const second = await fetchHandler(
      new Request("http://127.0.0.1:8789/testnet/market-heat")
    );
    now += 1_001;
    const third = await fetchHandler(
      new Request("http://127.0.0.1:8789/testnet/market-heat")
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(200);
    expect(oracleRequests).toEqual([
      { includeSettled: false },
      { includeSettled: true },
      { includeSettled: false },
      { includeSettled: true }
    ]);
  });

  test("serves a lightweight indexed price snapshot without loading feed rows", async () => {
    let tradeEventReads = 0;
    let positionSummaryReads = 0;
    const fetchHandler = createTestnetDevServerFetch({
      indexerReader: createTestIndexerReader({
        listRecentTradeEvents: async () => {
          tradeEventReads += 1;
          return [];
        },
        listPositionSummaries: async () => {
          positionSummaryReads += 1;
          return [];
        }
      }),
      nowMs: () => 1_779_070_802_000
    });

    const response = await fetchHandler(
      new Request("http://127.0.0.1:8789/testnet/price-snapshot")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      source: "indexed_testnet",
      marketPrice: {
        market: "BTC-USD",
        price: 72000,
        source: "indexed_testnet"
      },
      markets: [
        {
          oracleId: "btc-indexed",
          latestPrice: 72000,
          latestPriceLabel: "$72,000",
          latestPriceTimestampMs: 1_779_070_800_000,
          latestPriceCheckpoint: 101
        }
      ]
    });
    expect(tradeEventReads).toBe(0);
    expect(positionSummaryReads).toBe(0);
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

  test("serves indexed portfolio events for a wallet profile", async () => {
    const calls: unknown[] = [];
    const fetchHandler = createTestnetDevServerFetch({
      indexerReader: createTestIndexerReader({
        listRecentTradeEvents: async (options) => {
          calls.push(options);
          return [
            {
              eventId: "redeem:indexed-wallet:2",
              kind: "redeem",
              actor: "0xwallet",
              trader: "0xwallet",
              managerId: "manager-wallet",
              oracleId: "btc-indexed",
              expiryMs: 1_779_158_400_000,
              strike: 72_000_000_000,
              isUp: true,
              quantity: 1,
              payout: 250_000,
              timestampMs: 1_779_070_900_000,
              source: "positions/redeemed",
            },
          ];
        },
      }),
    });

    const response = await fetchHandler(
      new Request(
        "http://127.0.0.1:8789/testnet/portfolio-events?wallet=0xwallet&eventType=redeem&limit=12"
      )
    );

    expect(response.status).toBe(200);
    expect(calls).toEqual([
      {
        kind: "redeem",
        limit: 12,
        managerId: undefined,
        owner: "0xwallet",
      },
    ]);
    await expect(response.json()).resolves.toMatchObject({
      data: [
        {
          parsedJson: {
            manager_id: "manager-wallet",
            payout: 250_000,
          },
        },
      ],
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

  test("serves wallet leaderboards from indexed position summaries", async () => {
    const fetchHandler = createTestnetDevServerFetch({
      indexerReader: createTestIndexerReader()
    });

    const response = await fetchHandler(
      new Request("http://127.0.0.1:8789/testnet/wallet-leaderboards?limit=5")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");

    const body = await response.json();

    expect(body.source).toBe("indexed_testnet");
    expect(body.leaderboards.longestWinningStreak[0]).toMatchObject({
      wallet: "0xalpha",
      totalPnl: 300_000,
      closedCount: 2,
      winCount: 2,
      lossCount: 0,
      longestWinningStreak: 2,
      currentStreakType: "win",
      currentStreakLength: 2
    });
    expect(body.leaderboards.longestLosingStreak[0]).toMatchObject({
      wallet: "0xbeta",
      totalPnl: -300_000,
      closedCount: 2,
      winCount: 0,
      lossCount: 2,
      longestLosingStreak: 2,
      currentStreakType: "loss",
      currentStreakLength: 2
    });
    expect(body.leaderboards.currentWinningStreak[0]).toMatchObject({
      wallet: "0xalpha",
      totalPnl: 300_000,
      currentStreakType: "win",
      currentStreakLength: 2
    });
    expect(body.leaderboards.currentLosingStreak[0]).toMatchObject({
      wallet: "0xbeta",
      totalPnl: -300_000,
      currentStreakType: "loss",
      currentStreakLength: 2
    });
    expect(body.leaderboards.highestPnl[0]).toMatchObject({
      wallet: "0xalpha",
      totalPnl: 300_000
    });
    expect(body.leaderboards.worstPnl[0]).toMatchObject({
      wallet: "0xbeta",
      totalPnl: -300_000
    });
  });

  test("serves targeted wallet performance outside leaderboard rank slices", async () => {
    const wallet =
      "0x00000000000000000000000000000000000000000000000000000000000000aa";
    const fetchHandler = createTestnetDevServerFetch({
      indexerReader: createTestIndexerReader({
        listPositionSummaries: async ({ owner } = {}) => [
          {
            id: "target-win-1",
            owner: owner ?? wallet,
            managerId: "manager-target",
            oracleId: "btc-indexed",
            expiryMs: 1_779_158_400_000,
            strike: 72_000_000_000,
            isUp: true,
            mintedQuantity: 1,
            redeemedQuantity: 1,
            openQuantity: 0,
            cost: 100_000,
            payout: 300_000,
            realizedPnl: 200_000,
            lastEventMs: 1_779_070_700_000,
            status: "closed" as const,
          },
        ].filter((position) => owner === undefined || position.owner === owner),
      })
    });

    const response = await fetchHandler(
      new Request(`http://127.0.0.1:8789/testnet/wallet-performance?wallet=${wallet}`)
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.source).toBe("indexed_testnet");
    expect(body.wallet).toBe(wallet);
    expect(body.entry).toMatchObject({
      wallet,
      totalPnl: 200_000,
      closedCount: 1,
      winCount: 1,
      currentStreakType: "win",
      currentStreakLength: 1,
    });
    expect(body.entry.heatScore).toBeGreaterThan(0);
  });

  test("requires an indexer reader for targeted wallet performance", async () => {
    const fetchHandler = createTestnetDevServerFetch();

    const response = await fetchHandler(
      new Request(
        "http://127.0.0.1:8789/testnet/wallet-performance?wallet=0x00000000000000000000000000000000000000000000000000000000000000aa"
      )
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "indexer_unavailable",
    });
  });

  test("requires an indexer reader for wallet leaderboards", async () => {
    const fetchHandler = createTestnetDevServerFetch();

    const response = await fetchHandler(
      new Request("http://127.0.0.1:8789/testnet/wallet-leaderboards")
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

function createTestAppStore({
  challenges = [],
  follows = [],
  followWrites = [],
  profiles = [],
  profileWrites = [],
  receipts = [],
  session,
  sessions = [],
}: {
  challenges?: WalletAuthChallenge[];
  follows?: WalletFollow[];
  followWrites?: UpsertWalletFollowInput[];
  profiles?: WalletProfile[];
  profileWrites?: UpsertWalletProfileInput[];
  receipts?: CopyReceipt[];
  session?: WalletSession | null;
  sessions?: WalletSession[];
} = {}): HotHandsAppStore {
  return {
    createWalletAuthChallenge: async (challenge) => {
      challenges.push(challenge);
      return 1;
    },
    consumeWalletAuthChallenge: async ({ wallet, nonce, consumedAtMs }) => {
      const challenge = challenges.find(
        (candidate) => candidate.wallet === wallet && candidate.nonce === nonce,
      );

      if (!challenge) {
        return null;
      }

      const consumed = { ...challenge, consumedAtMs };
      challenges.splice(challenges.indexOf(challenge), 1, consumed);
      return consumed;
    },
    upsertWalletSession: async (nextSession) => {
      sessions.push(nextSession);
      return 1;
    },
    getWalletSessionByTokenHash: async () => session ?? null,
    revokeWalletSession: async () => 1,
    upsertWalletProfile: async (profile) => {
      profileWrites.push(profile);
      const existingIndex = profiles.findIndex(
        (candidate) => candidate.wallet === profile.wallet,
      );
      const existing = existingIndex >= 0 ? profiles[existingIndex] : null;
      const nextProfile: WalletProfile = {
        wallet: profile.wallet,
        ...(existing?.displayName || profile.displayName
          ? { displayName: profile.displayName ?? existing?.displayName }
          : {}),
        ...(existing?.bio || profile.bio ? { bio: profile.bio ?? existing?.bio } : {}),
        ...(existing?.avatarUrl || profile.avatarUrl
          ? { avatarUrl: profile.avatarUrl ?? existing?.avatarUrl }
          : {}),
        ...(existing?.xHandle || profile.xHandle
          ? { xHandle: profile.xHandle ?? existing?.xHandle }
          : {}),
        ...(existing?.defaultStakeAmountUsd || profile.defaultStakeAmountUsd
          ? {
              defaultStakeAmountUsd:
                profile.defaultStakeAmountUsd ?? existing?.defaultStakeAmountUsd,
            }
          : {}),
        createdAtMs: existing?.createdAtMs ?? profile.nowMs,
        updatedAtMs: profile.nowMs,
      };

      if (existingIndex >= 0) {
        profiles.splice(existingIndex, 1, nextProfile);
      } else {
        profiles.push(nextProfile);
      }
      return 1;
    },
    getWalletProfile: async (wallet) =>
      profiles.find((profile) => profile.wallet === wallet) ?? null,
    upsertWalletFollow: async (follow) => {
      followWrites.push(follow);
      follows.splice(0, follows.length, {
        followerWallet: follow.followerWallet,
        leaderWallet: follow.leaderWallet,
        ...(follow.leaderDisplayName ? { leaderDisplayName: follow.leaderDisplayName } : {}),
        createdAtMs: follow.nowMs,
        updatedAtMs: follow.nowMs,
      });
      return 1;
    },
    deleteWalletFollow: async ({ followerWallet, leaderWallet }) => {
      const index = follows.findIndex(
        (follow) =>
          follow.followerWallet === followerWallet && follow.leaderWallet === leaderWallet,
      );
      if (index >= 0) {
        follows.splice(index, 1);
      }
      return index >= 0 ? 1 : 0;
    },
    listWalletFollows: async (followerWallet) =>
      follows.filter((follow) => follow.followerWallet === followerWallet),
    recordCopyReceipt: async (receipt) => {
      receipts.push(receipt);
      return 1;
    },
    listCopyReceipts: async () => receipts,
    upsertWalletHeatSnapshot: async () => 1,
    listLatestWalletHeatSnapshots: async () => [],
  };
}

function createTestIndexerReader(
  overrides: Partial<PredictIndexerReader> = {}
): PredictIndexerReader {
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
    listPositionSummaries: async ({ owner } = {}) => {
      const positions = [
        {
          id: "alpha-win-1",
          owner: "0xalpha",
          managerId: "manager-alpha",
          oracleId: "btc-indexed",
          expiryMs: 1_779_158_400_000,
          strike: 72_000_000_000,
          isUp: true,
          mintedQuantity: 1,
          redeemedQuantity: 1,
          openQuantity: 0,
          cost: 100_000,
          payout: 250_000,
          realizedPnl: 150_000,
          lastEventMs: 1_779_070_700_000,
          status: "closed" as const,
        },
        {
          id: "alpha-win-2",
          owner: "0xalpha",
          managerId: "manager-alpha",
          oracleId: "btc-indexed",
          expiryMs: 1_779_158_500_000,
          strike: 72_100_000_000,
          isUp: true,
          mintedQuantity: 1,
          redeemedQuantity: 1,
          openQuantity: 0,
          cost: 100_000,
          payout: 250_000,
          realizedPnl: 150_000,
          lastEventMs: 1_779_070_800_000,
          status: "closed" as const,
        },
        {
          id: "beta-loss-1",
          owner: "0xbeta",
          managerId: "manager-beta",
          oracleId: "btc-indexed",
          expiryMs: 1_779_158_400_000,
          strike: 72_000_000_000,
          isUp: false,
          mintedQuantity: 1,
          redeemedQuantity: 1,
          openQuantity: 0,
          cost: 100_000,
          payout: 0,
          realizedPnl: -100_000,
          lastEventMs: 1_779_070_710_000,
          status: "closed" as const,
        },
        {
          id: "beta-loss-2",
          owner: "0xbeta",
          managerId: "manager-beta",
          oracleId: "btc-indexed",
          expiryMs: 1_779_158_500_000,
          strike: 72_100_000_000,
          isUp: false,
          mintedQuantity: 1,
          redeemedQuantity: 1,
          openQuantity: 0,
          cost: 200_000,
          payout: 0,
          realizedPnl: -200_000,
          lastEventMs: 1_779_070_810_000,
          status: "closed" as const,
        },
      ];

      return positions.filter((position) => owner === undefined || position.owner === owner);
    },
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
    ...overrides,
  };
}
