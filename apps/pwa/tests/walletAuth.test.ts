import { describe, expect, test } from "bun:test";
import {
  clearStoredWalletAuthSession,
  deleteFollowedWalletFromApi,
  loadAuthenticatedWalletProfileFromApi,
  loadFollowedWalletsFromApi,
  readStoredWalletAuthSession,
  recordCopyReceiptToApi,
  requestWalletAuthSession,
  saveWalletProfileToApi,
  saveFollowedWalletToApi,
  writeStoredWalletAuthSession,
  type WalletAuthStorage,
} from "../src/walletAuth";

describe("wallet auth client", () => {
  test("signs a server challenge once and stores the returned wallet session", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const storage = createMemoryStorage();
    const signedMessages: string[] = [];
    const session = await requestWalletAuthSession({
      apiBaseUrl: "http://127.0.0.1:8792",
      wallet: "0xwallet",
      storage,
      nowMs: () => 1_000,
      signPersonalMessage: async (message) => {
        signedMessages.push(new TextDecoder().decode(message));
        return { signature: "signed-message" };
      },
      fetchImpl: async (input, init) => {
        calls.push({ url: String(input), init });
        if (String(input).endsWith("/app/auth/challenge")) {
          return Response.json({
            wallet: "0xwallet",
            nonce: "nonce-1",
            message: "Sign in to Hot Hands\nNonce: nonce-1",
            expiresAtMs: 2_000,
          });
        }

        return Response.json({
          wallet: "0xwallet",
          token: "session-token",
          expiresAtMs: 3_000,
        });
      },
    });

    expect(session).toEqual({
      wallet: "0xwallet",
      token: "session-token",
      expiresAtMs: 3_000,
    });
    expect(signedMessages).toEqual(["Sign in to Hot Hands\nNonce: nonce-1"]);
    expect(calls.map((call) => call.url)).toEqual([
      "http://127.0.0.1:8792/app/auth/challenge",
      "http://127.0.0.1:8792/app/auth/session",
    ]);
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({
      wallet: "0xwallet",
      nonce: "nonce-1",
      signature: "signed-message",
    });
    expect(readStoredWalletAuthSession(storage, "0xwallet", 1_000)).toEqual(session);
  });

  test("reuses an unexpired stored session for the same wallet", async () => {
    const storage = createMemoryStorage();
    writeStoredWalletAuthSession(storage, {
      wallet: "0xwallet",
      token: "cached-token",
      expiresAtMs: 10_000,
    });

    const session = await requestWalletAuthSession({
      apiBaseUrl: "http://127.0.0.1:8792",
      wallet: "0xwallet",
      storage,
      nowMs: () => 1_000,
      signPersonalMessage: async () => {
        throw new Error("should not sign");
      },
      fetchImpl: async () => {
        throw new Error("should not fetch");
      },
    });

    expect(session.token).toBe("cached-token");
  });

  test("loads and mutates followed wallets with bearer auth", async () => {
    const requests: Array<{ url: string; authorization: string | null; method: string }> = [];
    const session = {
      wallet: "0xwallet",
      token: "session-token",
      expiresAtMs: 10_000,
    };
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        url: String(input),
        authorization: new Headers(init?.headers).get("authorization"),
        method: init?.method ?? "GET",
      });
      return Response.json({
        wallet: "0xwallet",
        follows: [
          {
            followerWallet: "0xwallet",
            leaderWallet: "0xleader",
            leaderDisplayName: "leader.sui",
            createdAtMs: 1_000,
            updatedAtMs: 2_000,
          },
        ],
      });
    };

    await expect(loadFollowedWalletsFromApi({ apiBaseUrl: "http://api", session, fetchImpl }))
      .resolves.toEqual([
        {
          displayName: "leader.sui",
          wallet: "0xleader",
        },
      ]);
    await saveFollowedWalletToApi({
      apiBaseUrl: "http://api",
      session,
      wallet: { wallet: "0xleader", displayName: "leader.sui" },
      fetchImpl,
    });
    await deleteFollowedWalletFromApi({
      apiBaseUrl: "http://api",
      session,
      leaderWallet: "0xleader",
      fetchImpl,
    });

    expect(requests).toEqual([
      {
        url: "http://api/app/follows",
        authorization: "Bearer session-token",
        method: "GET",
      },
      {
        url: "http://api/app/follows",
        authorization: "Bearer session-token",
        method: "POST",
      },
      {
        url: "http://api/app/follows?leaderWallet=0xleader",
        authorization: "Bearer session-token",
        method: "DELETE",
      },
    ]);
  });

  test("records copy and fade receipts with bearer auth", async () => {
    const bodies: unknown[] = [];
    const session = {
      wallet: "0xwallet",
      token: "session-token",
      expiresAtMs: 10_000,
    };

    await recordCopyReceiptToApi({
      apiBaseUrl: "http://api",
      session,
      receipt: {
        receiptId: "receipt-1",
        sourceWallet: "0xleader",
        sourcePositionId: "source-position",
        copiedPositionId: "copied-position",
        mode: "fade",
        status: "submitted",
        sourceSide: "UP",
        executionSide: "DOWN",
        amountUsd: 25,
        transactionDigest: "0xdigest",
      },
      fetchImpl: async (_input, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return Response.json({ ok: true });
      },
    });

    expect(bodies).toEqual([
      {
        receiptId: "receipt-1",
        sourceWallet: "0xleader",
        sourcePositionId: "source-position",
        copiedPositionId: "copied-position",
        mode: "fade",
        status: "submitted",
        sourceSide: "UP",
        executionSide: "DOWN",
        amountUsd: 25,
        transactionDigest: "0xdigest",
      },
    ]);
  });

  test("loads and saves authenticated wallet profile settings", async () => {
    const requests: Array<{
      url: string;
      authorization: string | null;
      method: string;
      body?: unknown;
    }> = [];
    const session = {
      wallet: "0xwallet",
      token: "session-token",
      expiresAtMs: 10_000,
    };
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({
        url: String(input),
        authorization: new Headers(init?.headers).get("authorization"),
        method: init?.method ?? "GET",
        ...(body === undefined ? {} : { body }),
      });

      if ((init?.method ?? "GET") === "PATCH") {
        return Response.json({
          wallet: "0xwallet",
          profile: {
            wallet: "0xwallet",
            displayName: "Signal Mom",
            defaultStakeAmountUsd: 37.5,
            createdAtMs: 1_000,
            updatedAtMs: 2_000,
          },
        });
      }

      return Response.json({
        wallet: "0xwallet",
        profile: {
          wallet: "0xwallet",
          displayName: "Signal Mom",
          defaultStakeAmountUsd: 25,
          createdAtMs: 1_000,
          updatedAtMs: 1_500,
        },
      });
    };

    await expect(
      loadAuthenticatedWalletProfileFromApi({ apiBaseUrl: "http://api", session, fetchImpl }),
    ).resolves.toEqual({
      wallet: "0xwallet",
      displayName: "Signal Mom",
      defaultStakeAmountUsd: 25,
      createdAtMs: 1_000,
      updatedAtMs: 1_500,
    });
    await expect(
      saveWalletProfileToApi({
        apiBaseUrl: "http://api",
        session,
        profile: {
          displayName: "Signal Mom",
          defaultStakeAmountUsd: 37.5,
        },
        fetchImpl,
      }),
    ).resolves.toEqual({
      wallet: "0xwallet",
      displayName: "Signal Mom",
      defaultStakeAmountUsd: 37.5,
      createdAtMs: 1_000,
      updatedAtMs: 2_000,
    });

    expect(requests).toEqual([
      {
        url: "http://api/app/me",
        authorization: "Bearer session-token",
        method: "GET",
      },
      {
        url: "http://api/app/me/profile",
        authorization: "Bearer session-token",
        method: "PATCH",
        body: {
          displayName: "Signal Mom",
          defaultStakeAmountUsd: 37.5,
        },
      },
    ]);
  });

  test("clears malformed or expired stored sessions", () => {
    const storage = createMemoryStorage();
    storage.setItem("hot-hands-wallet-auth-session", "{bad json");
    expect(readStoredWalletAuthSession(storage, "0xwallet", 1_000)).toBeNull();

    writeStoredWalletAuthSession(storage, {
      wallet: "0xwallet",
      token: "expired",
      expiresAtMs: 1_000,
    });
    expect(readStoredWalletAuthSession(storage, "0xwallet", 1_000)).toBeNull();

    clearStoredWalletAuthSession(storage);
    expect(storage.getItem("hot-hands-wallet-auth-session")).toBeNull();
  });
});

function createMemoryStorage(): WalletAuthStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    removeItem: (key) => {
      map.delete(key);
    },
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}
