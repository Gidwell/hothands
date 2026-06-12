export const WALLET_AUTH_STORAGE_KEY = "hot-hands-wallet-auth-session";

export type WalletAuthStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export type WalletAuthSession = {
  wallet: string;
  token: string;
  expiresAtMs: number;
};

export type SignPersonalMessage = (
  message: Uint8Array,
) => Promise<{ signature: string }>;

export type FollowedWalletRecord = {
  wallet: string;
  displayName?: string;
};

export type CopyReceiptApiInput = {
  receiptId: string;
  sourceWallet: string;
  sourcePositionId: string;
  copiedPositionId?: string;
  mode: "copy" | "fade";
  status: "prepared" | "submitted" | "failed";
  oracleId?: string;
  expiryMs?: number;
  strike?: number;
  sourceSide?: "UP" | "DOWN";
  executionSide?: "UP" | "DOWN";
  amountUsd: number;
  quoteCost?: number;
  transactionDigest?: string;
  raw?: Record<string, unknown>;
};

const encoder = new TextEncoder();

export async function requestWalletAuthSession({
  apiBaseUrl,
  fetchImpl = fetch,
  nowMs = Date.now,
  signPersonalMessage,
  storage,
  wallet,
}: {
  apiBaseUrl: string | undefined;
  fetchImpl?: typeof fetch;
  nowMs?: () => number;
  signPersonalMessage: SignPersonalMessage;
  storage: WalletAuthStorage | null | undefined;
  wallet: string;
}): Promise<WalletAuthSession> {
  const cached = readStoredWalletAuthSession(storage, wallet, nowMs());
  if (cached) {
    return cached;
  }

  const challenge = await postJson<WalletAuthChallengeResponse>({
    apiBaseUrl,
    fetchImpl,
    path: "/app/auth/challenge",
    body: { wallet },
  });
  const signed = await signPersonalMessage(encoder.encode(challenge.message));
  const session = await postJson<WalletAuthSession>({
    apiBaseUrl,
    fetchImpl,
    path: "/app/auth/session",
    body: {
      wallet,
      nonce: challenge.nonce,
      signature: signed.signature,
    },
  });

  writeStoredWalletAuthSession(storage, session);
  return session;
}

export function readStoredWalletAuthSession(
  storage: WalletAuthStorage | null | undefined,
  wallet: string,
  nowMs: number,
): WalletAuthSession | null {
  if (!storage) {
    return null;
  }

  try {
    const parsed = JSON.parse(storage.getItem(WALLET_AUTH_STORAGE_KEY) ?? "null");
    const session = parseWalletAuthSession(parsed);
    if (!session) {
      return null;
    }

    if (session.wallet.toLowerCase() !== wallet.toLowerCase() || session.expiresAtMs <= nowMs) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export function writeStoredWalletAuthSession(
  storage: WalletAuthStorage | null | undefined,
  session: WalletAuthSession,
): void {
  if (!storage) {
    return;
  }

  storage.setItem(WALLET_AUTH_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredWalletAuthSession(
  storage: WalletAuthStorage | null | undefined,
): void {
  storage?.removeItem(WALLET_AUTH_STORAGE_KEY);
}

export async function loadFollowedWalletsFromApi({
  apiBaseUrl,
  fetchImpl = fetch,
  session,
}: {
  apiBaseUrl: string | undefined;
  fetchImpl?: typeof fetch;
  session: WalletAuthSession;
}): Promise<FollowedWalletRecord[]> {
  const response = await fetchJson<FollowedWalletsResponse>({
    apiBaseUrl,
    fetchImpl,
    path: "/app/follows",
    headers: authHeaders(session),
  });

  return response.follows.map((follow) => ({
    wallet: follow.leaderWallet,
    ...(follow.leaderDisplayName ? { displayName: follow.leaderDisplayName } : {}),
  }));
}

export async function saveFollowedWalletToApi({
  apiBaseUrl,
  fetchImpl = fetch,
  session,
  wallet,
}: {
  apiBaseUrl: string | undefined;
  fetchImpl?: typeof fetch;
  session: WalletAuthSession;
  wallet: FollowedWalletRecord;
}): Promise<FollowedWalletRecord[]> {
  const response = await postJson<FollowedWalletsResponse>({
    apiBaseUrl,
    fetchImpl,
    path: "/app/follows",
    headers: authHeaders(session),
    body: {
      leaderWallet: wallet.wallet,
      leaderDisplayName: wallet.displayName,
    },
  });

  return response.follows.map((follow) => ({
    wallet: follow.leaderWallet,
    ...(follow.leaderDisplayName ? { displayName: follow.leaderDisplayName } : {}),
  }));
}

export async function deleteFollowedWalletFromApi({
  apiBaseUrl,
  fetchImpl = fetch,
  leaderWallet,
  session,
}: {
  apiBaseUrl: string | undefined;
  fetchImpl?: typeof fetch;
  leaderWallet: string;
  session: WalletAuthSession;
}): Promise<FollowedWalletRecord[]> {
  const url = buildApiUrl(apiBaseUrl, "/app/follows");
  url.searchParams.set("leaderWallet", leaderWallet);
  const response = await fetchJson<FollowedWalletsResponse>({
    fetchImpl,
    headers: authHeaders(session),
    method: "DELETE",
    url,
  });

  return response.follows.map((follow) => ({
    wallet: follow.leaderWallet,
    ...(follow.leaderDisplayName ? { displayName: follow.leaderDisplayName } : {}),
  }));
}

export async function recordCopyReceiptToApi({
  apiBaseUrl,
  fetchImpl = fetch,
  receipt,
  session,
}: {
  apiBaseUrl: string | undefined;
  fetchImpl?: typeof fetch;
  receipt: CopyReceiptApiInput;
  session: WalletAuthSession;
}): Promise<void> {
  await postJson({
    apiBaseUrl,
    fetchImpl,
    path: "/app/copy-receipts",
    headers: authHeaders(session),
    body: receipt,
  });
}

type WalletAuthChallengeResponse = {
  wallet: string;
  nonce: string;
  message: string;
  expiresAtMs: number;
};

type WalletFollowApiRecord = {
  followerWallet: string;
  leaderWallet: string;
  leaderDisplayName?: string;
  createdAtMs: number;
  updatedAtMs: number;
};

type FollowedWalletsResponse = {
  wallet: string;
  follows: WalletFollowApiRecord[];
};

async function postJson<T = unknown>({
  apiBaseUrl,
  body,
  fetchImpl,
  headers,
  path,
}: {
  apiBaseUrl: string | undefined;
  body: unknown;
  fetchImpl: typeof fetch;
  headers?: HeadersInit;
  path: string;
}): Promise<T> {
  return fetchJson<T>({
    apiBaseUrl,
    body,
    fetchImpl,
    headers,
    method: "POST",
    path,
  });
}

async function fetchJson<T = unknown>({
  apiBaseUrl,
  body,
  fetchImpl,
  headers,
  method = "GET",
  path,
  url,
}: {
  apiBaseUrl?: string;
  body?: unknown;
  fetchImpl: typeof fetch;
  headers?: HeadersInit;
  method?: string;
  path?: string;
  url?: URL;
}): Promise<T> {
  const targetUrl = url ?? buildApiUrl(apiBaseUrl, path ?? "");
  const response = await fetchImpl(targetUrl.toString(), {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...Object.fromEntries(new Headers(headers).entries()),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  if (!response.ok) {
    throw new Error(`Hot Hands API request failed with ${response.status}.`);
  }

  return await response.json() as T;
}

function buildApiUrl(apiBaseUrl: string | undefined, path: string): URL {
  if (!apiBaseUrl) {
    throw new Error("Hot Hands API URL is not configured.");
  }

  return new URL(path, apiBaseUrl.replace(/\/+$/, "") + "/");
}

function authHeaders(session: WalletAuthSession): HeadersInit {
  return {
    authorization: `Bearer ${session.token}`,
  };
}

function parseWalletAuthSession(value: unknown): WalletAuthSession | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Partial<WalletAuthSession>;
  if (
    typeof record.wallet !== "string" ||
    !record.wallet.trim() ||
    typeof record.token !== "string" ||
    !record.token.trim() ||
    typeof record.expiresAtMs !== "number" ||
    !Number.isFinite(record.expiresAtMs)
  ) {
    return null;
  }

  return {
    wallet: record.wallet,
    token: record.token,
    expiresAtMs: record.expiresAtMs,
  };
}
