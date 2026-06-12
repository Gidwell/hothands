import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import type {
  CopyReceipt,
  CopyReceiptMode,
  CopyReceiptSide,
  CopyReceiptStatus,
  HotHandsAppStore,
  WalletSession,
} from "./app-storage";

export type VerifyWalletSignatureInput = {
  wallet: string;
  message: string;
  signature: string;
};

export type VerifyWalletSignature = (input: VerifyWalletSignatureInput) => Promise<void>;

export type HotHandsAppRequestOptions = {
  appStore?: HotHandsAppStore;
  createSessionToken?: () => string;
  nowMs?: () => number;
  randomId?: () => string;
  verifyWalletSignature?: VerifyWalletSignature;
};

const CHALLENGE_TTL_MS = 5 * 60_000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;

const JSON_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
  "content-type": "application/json; charset=utf-8",
};

const encoder = new TextEncoder();

export async function handleHotHandsAppRequest(
  request: Request,
  {
    appStore,
    createSessionToken = createOpaqueSessionToken,
    nowMs = Date.now,
    randomId = createRandomId,
    verifyWalletSignature = verifySuiPersonalMessage,
  }: HotHandsAppRequestOptions = {},
): Promise<Response | null> {
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/app/")) {
    return null;
  }

  if (!appStore) {
    return json({ error: "app_store_unavailable" }, 503);
  }

  if (url.pathname === "/app/auth/challenge") {
    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }

    const body = await readJsonObject(request);
    const wallet = normalizeWalletAddress(body.wallet);
    if (!wallet) {
      return json({ error: "invalid_wallet" }, 400);
    }

    const now = nowMs();
    const nonce = randomId();
    const message = buildWalletAuthMessage({ wallet, nonce, issuedAtMs: now });
    const expiresAtMs = now + CHALLENGE_TTL_MS;

    await appStore.createWalletAuthChallenge({
      challengeId: nonce,
      wallet,
      nonce,
      message,
      issuedAtMs: now,
      expiresAtMs,
    });

    return json({
      wallet,
      nonce,
      message,
      expiresAtMs,
    });
  }

  if (url.pathname === "/app/auth/session") {
    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }

    const body = await readJsonObject(request);
    const wallet = normalizeWalletAddress(body.wallet);
    const nonce = stringValue(body.nonce);
    const signature = stringValue(body.signature);

    if (!wallet || !nonce || !signature) {
      return json({ error: "invalid_auth_request" }, 400);
    }

    const now = nowMs();
    const challenge = await appStore.consumeWalletAuthChallenge({
      wallet,
      nonce,
      consumedAtMs: now,
    });

    if (!challenge) {
      return json({ error: "challenge_not_found" }, 401);
    }

    try {
      await verifyWalletSignature({
        wallet,
        message: challenge.message,
        signature,
      });
    } catch (error) {
      return json(
        {
          error: "signature_invalid",
          message: error instanceof Error ? error.message : "Signature could not be verified.",
        },
        401,
      );
    }

    const token = createSessionToken();
    const session: WalletSession = {
      sessionId: randomId(),
      wallet,
      tokenHash: await hashSessionToken(token),
      issuedAtMs: now,
      expiresAtMs: now + SESSION_TTL_MS,
    };
    await appStore.upsertWalletSession(session);

    return json({
      wallet,
      token,
      expiresAtMs: session.expiresAtMs,
    });
  }

  if (url.pathname === "/app/follows") {
    const auth = await requireWalletSession(request, appStore, nowMs());
    if (auth instanceof Response) {
      return auth;
    }

    if (request.method === "GET") {
      return json({
        wallet: auth.wallet,
        follows: await appStore.listWalletFollows(auth.wallet),
      });
    }

    if (request.method === "POST") {
      const body = await readJsonObject(request);
      const leaderWallet = normalizeWalletAddress(body.leaderWallet);
      if (!leaderWallet) {
        return json({ error: "invalid_leader_wallet" }, 400);
      }

      await appStore.upsertWalletFollow({
        followerWallet: auth.wallet,
        leaderWallet,
        leaderDisplayName: optionalStringValue(body.leaderDisplayName),
        nowMs: nowMs(),
      });

      return json({
        wallet: auth.wallet,
        follows: await appStore.listWalletFollows(auth.wallet),
      });
    }

    if (request.method === "DELETE") {
      const leaderWallet = normalizeWalletAddress(url.searchParams.get("leaderWallet"));
      if (!leaderWallet) {
        return json({ error: "invalid_leader_wallet" }, 400);
      }

      await appStore.deleteWalletFollow({
        followerWallet: auth.wallet,
        leaderWallet,
        nowMs: nowMs(),
      });

      return json({
        wallet: auth.wallet,
        follows: await appStore.listWalletFollows(auth.wallet),
      });
    }

    return json({ error: "method_not_allowed" }, 405);
  }

  if (url.pathname === "/app/copy-receipts") {
    if (request.method === "GET") {
      return json({
        receipts: await appStore.listCopyReceipts({
          copierWallet: optionalStringValue(url.searchParams.get("copierWallet")),
          sourcePositionId: optionalStringValue(url.searchParams.get("sourcePositionId")),
          sourceWallet: optionalStringValue(url.searchParams.get("sourceWallet")),
          limit: positiveIntegerValue(url.searchParams.get("limit")) ?? 50,
        }),
      });
    }

    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }

    const auth = await requireWalletSession(request, appStore, nowMs());
    if (auth instanceof Response) {
      return auth;
    }

    const body = await readJsonObject(request);
    const receipt = parseCopyReceiptBody(body, {
      copierWallet: auth.wallet,
      nowMs: nowMs(),
      randomId,
    });

    if (!receipt) {
      return json({ error: "invalid_copy_receipt" }, 400);
    }

    await appStore.recordCopyReceipt(receipt);

    return json({ receipt });
  }

  return json({ error: "not_found" }, 404);
}

export function buildWalletAuthMessage({
  issuedAtMs,
  nonce,
  wallet,
}: {
  issuedAtMs: number;
  nonce: string;
  wallet: string;
}): string {
  return [
    "Sign in to Hot Hands",
    "",
    `Wallet: ${wallet}`,
    `Nonce: ${nonce}`,
    `Issued: ${new Date(issuedAtMs).toISOString()}`,
    "",
    "This signature only authenticates your Hot Hands session. It does not submit a transaction.",
  ].join("\n");
}

async function requireWalletSession(
  request: Request,
  appStore: HotHandsAppStore,
  nowMs: number,
): Promise<WalletSession | Response> {
  const token = parseBearerToken(request.headers.get("authorization"));
  if (!token) {
    return json({ error: "auth_required" }, 401);
  }

  const session = await appStore.getWalletSessionByTokenHash({
    tokenHash: await hashSessionToken(token),
    nowMs,
  });

  if (!session) {
    return json({ error: "session_invalid" }, 401);
  }

  return session;
}

function parseCopyReceiptBody(
  body: Record<string, unknown>,
  {
    copierWallet,
    nowMs,
    randomId,
  }: {
    copierWallet: string;
    nowMs: number;
    randomId: () => string;
  },
): CopyReceipt | null {
  const sourceWallet = normalizeWalletAddress(body.sourceWallet);
  const sourcePositionId = stringValue(body.sourcePositionId);
  const mode = copyReceiptModeValue(body.mode);
  const status = copyReceiptStatusValue(body.status) ?? "submitted";
  const amountUsd = numberValue(body.amountUsd);

  if (!sourceWallet || !sourcePositionId || !mode || amountUsd === null || amountUsd < 0) {
    return null;
  }

  return {
    receiptId: stringValue(body.receiptId) ?? randomId(),
    copierWallet,
    sourceWallet,
    sourcePositionId,
    mode,
    status,
    amountUsd,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    ...(stringValue(body.copiedPositionId) ? { copiedPositionId: stringValue(body.copiedPositionId) as string } : {}),
    ...(stringValue(body.oracleId) ? { oracleId: stringValue(body.oracleId) as string } : {}),
    ...(numberValue(body.expiryMs) === null ? {} : { expiryMs: numberValue(body.expiryMs) as number }),
    ...(numberValue(body.strike) === null ? {} : { strike: numberValue(body.strike) as number }),
    ...(copyReceiptSideValue(body.sourceSide) ? { sourceSide: copyReceiptSideValue(body.sourceSide) as CopyReceiptSide } : {}),
    ...(copyReceiptSideValue(body.executionSide) ? { executionSide: copyReceiptSideValue(body.executionSide) as CopyReceiptSide } : {}),
    ...(numberValue(body.quoteCost) === null ? {} : { quoteCost: numberValue(body.quoteCost) as number }),
    ...(stringValue(body.transactionDigest) ? { transactionDigest: stringValue(body.transactionDigest) as string } : {}),
    raw: objectValue(body.raw),
  };
}

async function verifySuiPersonalMessage({
  message,
  signature,
  wallet,
}: VerifyWalletSignatureInput): Promise<void> {
  await verifyPersonalMessageSignature(encoder.encode(message), signature, {
    address: wallet,
  });
}

async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function parseBearerToken(header: string | null): string | null {
  if (!header) {
    return null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function normalizeWalletAddress(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  try {
    return isValidSuiAddress(value) ? normalizeSuiAddress(value) : null;
  } catch {
    return null;
  }
}

function createOpaqueSessionToken(): string {
  return `${createRandomId()}.${createRandomId()}`;
}

function createRandomId(): string {
  return crypto.randomUUID();
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalStringValue(value: unknown): string | undefined {
  return stringValue(value) ?? undefined;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function positiveIntegerValue(value: unknown): number | undefined {
  const parsed = numberValue(value);
  return parsed !== null && Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function copyReceiptModeValue(value: unknown): CopyReceiptMode | null {
  return value === "copy" || value === "fade" ? value : null;
}

function copyReceiptStatusValue(value: unknown): CopyReceiptStatus | null {
  return value === "prepared" || value === "submitted" || value === "failed" ? value : null;
}

function copyReceiptSideValue(value: unknown): CopyReceiptSide | null {
  return value === "UP" || value === "DOWN" ? value : null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
