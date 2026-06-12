import { describe, expect, test } from "bun:test";
import {
  createPostgresHotHandsAppStore,
  type HotHandsAppStore,
  type SqlQueryExecutor,
} from "../src/app-storage";

describe("Hot Hands app storage", () => {
  test("writes wallet auth, follows, copy receipts, and heat snapshots with parameterized SQL", async () => {
    const calls: SqlCall[] = [];
    const store = createStoreWithCalls(calls);

    await store.createWalletAuthChallenge({
      challengeId: "challenge-1",
      wallet: "0xwallet",
      nonce: "nonce-1",
      message: "Sign in to Hot Hands\nNonce: nonce-1",
      issuedAtMs: 1_800,
      expiresAtMs: 2_800,
    });
    await store.upsertWalletSession({
      sessionId: "session-1",
      wallet: "0xwallet",
      tokenHash: "token-hash",
      issuedAtMs: 1_900,
      expiresAtMs: 3_900,
    });
    await store.upsertWalletFollow({
      followerWallet: "0xwallet",
      leaderWallet: "0xleader",
      leaderDisplayName: "0xlead...ader",
      nowMs: 2_000,
    });
    await store.recordCopyReceipt({
      receiptId: "receipt-1",
      copierWallet: "0xwallet",
      sourceWallet: "0xleader",
      sourcePositionId: "0xleader:oracle:123:70000:UP",
      copiedPositionId: "manager:oracle:123:70000:DOWN",
      mode: "fade",
      status: "submitted",
      oracleId: "oracle",
      expiryMs: 123,
      strike: 70_000_000_000,
      sourceSide: "UP",
      executionSide: "DOWN",
      amountUsd: 25,
      quoteCost: 24.92,
      transactionDigest: "0xdigest",
      createdAtMs: 2_100,
      updatedAtMs: 2_100,
      raw: { source: "feed" },
    });
    await store.upsertWalletHeatSnapshot({
      wallet: "0xwallet",
      scoredAtMs: 2_200,
      heatScore: 91,
      source: "indexed_testnet",
      components: { roi: 0.42, confidence: 0.8 },
    });

    expect(calls).toHaveLength(5);
    expect(calls[0]?.statement).toContain("insert into app_wallet_auth_challenges");
    expect(calls[0]?.params).toEqual([
      "challenge-1",
      "0xwallet",
      "nonce-1",
      "Sign in to Hot Hands\nNonce: nonce-1",
      1_800,
      2_800,
    ]);
    expect(calls[1]?.statement).toContain("insert into app_wallet_sessions");
    expect(calls[1]?.statement).toContain("on conflict (session_id) do update");
    expect(calls[2]?.statement).toContain("insert into app_wallet_follows");
    expect(calls[2]?.statement).toContain("deleted_at_ms = null");
    expect(calls[3]?.statement).toContain("insert into app_copy_receipts");
    expect(calls[3]?.params).toContain("fade");
    expect(calls[3]?.params).toContain("submitted");
    expect(calls[3]?.params).toContain(JSON.stringify({ source: "feed" }));
    expect(calls[4]?.statement).toContain("insert into app_wallet_heat_snapshots");
    expect(calls[4]?.params).toContain(JSON.stringify({ roi: 0.42, confidence: 0.8 }));

    for (const call of calls) {
      expect(call.statement).toContain("returning 1");
      expect(call.statement).not.toContain("0xwallet");
      expect(call.statement).not.toContain("0xleader");
    }
  });

  test("consumes a live auth challenge and reads an active session", async () => {
    const calls: SqlCall[] = [];
    const execute: SqlQueryExecutor = async (statement, params = []) => {
      calls.push({ statement, params });
      if (statement.includes("app_wallet_auth_challenges")) {
        return {
          rows: [
            {
              challenge_id: "challenge-1",
              wallet: "0xwallet",
              nonce: "nonce-1",
              message: "message",
              issued_at_ms: 1_000,
              expires_at_ms: 2_000,
              consumed_at_ms: 1_500,
            },
          ],
        };
      }

      return {
        rows: [
          {
            session_id: "session-1",
            wallet: "0xwallet",
            token_hash: "token-hash",
            issued_at_ms: 1_500,
            expires_at_ms: 3_000,
            revoked_at_ms: null,
          },
        ],
      };
    };
    const store = createPostgresHotHandsAppStore({ execute });

    await expect(
      store.consumeWalletAuthChallenge({
        wallet: "0xwallet",
        nonce: "nonce-1",
        consumedAtMs: 1_500,
      }),
    ).resolves.toMatchObject({
      challengeId: "challenge-1",
      wallet: "0xwallet",
      nonce: "nonce-1",
      consumedAtMs: 1_500,
    });
    await expect(
      store.getWalletSessionByTokenHash({
        tokenHash: "token-hash",
        nowMs: 2_000,
      }),
    ).resolves.toMatchObject({
      sessionId: "session-1",
      wallet: "0xwallet",
      expiresAtMs: 3_000,
    });

    expect(calls[0]?.statement).toContain("update app_wallet_auth_challenges");
    expect(calls[0]?.statement).toContain("consumed_at_ms is null");
    expect(calls[0]?.statement).toContain("expires_at_ms >=");
    expect(calls[0]?.params).toEqual(["0xwallet", "nonce-1", 1_500]);
    expect(calls[1]?.statement).toContain("from app_wallet_sessions");
    expect(calls[1]?.statement).toContain("revoked_at_ms is null");
    expect(calls[1]?.params).toEqual(["token-hash", 2_000]);
  });

  test("lists active follows and copy receipts from rows", async () => {
    const execute: SqlQueryExecutor = async (statement) => {
      if (statement.includes("app_wallet_follows")) {
        return {
          rows: [
            {
              follower_wallet: "0xwallet",
              leader_wallet: "0xleader",
              leader_display_name: "leader.sui",
              created_at_ms: 1_000,
              updated_at_ms: 2_000,
            },
          ],
        };
      }

      return {
        rows: [
          {
            receipt_id: "receipt-1",
            copier_wallet: "0xwallet",
            source_wallet: "0xleader",
            source_position_id: "source-position",
            copied_position_id: "copied-position",
            mode: "copy",
            status: "submitted",
            oracle_id: "oracle",
            expiry_ms: 123,
            strike: "70000000000",
            source_side: "UP",
            execution_side: "UP",
            amount_usd: "25",
            quote_cost: "24.95",
            transaction_digest: "0xdigest",
            created_at_ms: 2_100,
            updated_at_ms: 2_100,
            raw: { source: "feed" },
          },
        ],
      };
    };
    const store = createPostgresHotHandsAppStore({ execute });

    await expect(store.listWalletFollows("0xwallet")).resolves.toEqual([
      {
        followerWallet: "0xwallet",
        leaderWallet: "0xleader",
        leaderDisplayName: "leader.sui",
        createdAtMs: 1_000,
        updatedAtMs: 2_000,
      },
    ]);
    await expect(
      store.listCopyReceipts({
        sourcePositionId: "source-position",
        limit: 10,
      }),
    ).resolves.toMatchObject([
      {
        receiptId: "receipt-1",
        copierWallet: "0xwallet",
        mode: "copy",
        amountUsd: 25,
        quoteCost: 24.95,
      },
    ]);
  });
});

type SqlCall = {
  statement: string;
  params: readonly unknown[];
};

function createStoreWithCalls(calls: SqlCall[]): HotHandsAppStore {
  return createPostgresHotHandsAppStore({
    execute: async (statement, params = []) => {
      calls.push({ statement, params });
      return { rows: [{ inserted: 1 }], rowCount: 1 };
    },
  });
}
