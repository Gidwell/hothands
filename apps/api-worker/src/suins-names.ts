import {
  isValidSuiAddress,
  normalizeSuiAddress,
  normalizeSuiNSName,
} from "@mysten/sui/utils";

export type MainnetSuinsNameEntry = {
  wallet: string;
  name: string;
  source: "mainnet_suins";
};

export type MainnetSuinsNamesResponse = {
  source: "mainnet_suins";
  network: "mainnet";
  names: MainnetSuinsNameEntry[];
  missing: string[];
  skipped: string[];
  failed: string[];
};

export type MainnetSuinsNamesOptions = {
  fetchImpl?: typeof fetch;
  nowMs?: () => number;
};

type CachedSuinsName = {
  fetchedAtMs: number;
  result: ResolvedSuinsName;
};

type ResolvedSuinsName =
  | { status: "resolved"; name: string }
  | { status: "missing" }
  | { status: "failed" };

const MAINNET_RPC_URL = "https://fullnode.mainnet.sui.io:443";
const MAINNET_SUINS_CACHE_TTL_MS = 15 * 60_000;
const MAINNET_SUINS_FAILURE_CACHE_TTL_MS = 60_000;
const MAINNET_SUINS_CACHE_MAX = 500;
const MAINNET_SUINS_LOOKUP_LIMIT = 50;
const MAINNET_SUINS_RPC_TIMEOUT_MS = 1_500;

const mainnetSuinsNameCache = new Map<string, CachedSuinsName>();

export async function getMainnetSuinsNames(
  url: URL,
  {
    fetchImpl = fetch,
    nowMs = Date.now,
  }: MainnetSuinsNamesOptions = {},
): Promise<MainnetSuinsNamesResponse> {
  const parsedWallets = parseWalletsFromUrl(url);
  const normalizedWallets: string[] = [];
  const skipped: string[] = [];

  for (const wallet of parsedWallets) {
    const normalizedWallet = normalizeWalletAddress(wallet);
    if (!normalizedWallet) {
      skipped.push(wallet);
      continue;
    }

    if (
      normalizedWallets.length < MAINNET_SUINS_LOOKUP_LIMIT &&
      !normalizedWallets.includes(normalizedWallet)
    ) {
      normalizedWallets.push(normalizedWallet);
    }
  }

  const names: MainnetSuinsNameEntry[] = [];
  const missing: string[] = [];
  const failed: string[] = [];

  const results = await Promise.all(
    normalizedWallets.map(async (wallet) => ({
      wallet,
      result: await resolveMainnetSuinsName(wallet, {
        fetchImpl,
        nowMs,
      }),
    })),
  );

  for (const { wallet, result } of results) {
    if (result.status === "resolved") {
      names.push({
        wallet,
        name: result.name,
        source: "mainnet_suins",
      });
    } else if (result.status === "failed") {
      failed.push(wallet);
    } else {
      missing.push(wallet);
    }
  }

  return {
    source: "mainnet_suins",
    network: "mainnet",
    names,
    missing,
    skipped,
    failed,
  };
}

export function clearMainnetSuinsNameCacheForTest(): void {
  mainnetSuinsNameCache.clear();
}

function parseWalletsFromUrl(url: URL): string[] {
  return [
    ...url.searchParams.getAll("wallet"),
    ...url.searchParams
      .getAll("wallets")
      .flatMap((value) => value.split(",")),
  ]
    .map((wallet) => wallet.trim())
    .filter(Boolean);
}

function normalizeWalletAddress(wallet: string): string | null {
  try {
    if (!isValidSuiAddress(wallet)) {
      return null;
    }

    return normalizeSuiAddress(wallet);
  } catch {
    return null;
  }
}

async function resolveMainnetSuinsName(
  wallet: string,
  {
    fetchImpl,
    nowMs,
  }: Required<MainnetSuinsNamesOptions>,
): Promise<ResolvedSuinsName> {
  const now = nowMs();
  const cached = mainnetSuinsNameCache.get(wallet);

  if (cached && isFreshCachedSuinsName(cached, now)) {
    return cached.result;
  }

  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      MAINNET_RPC_URL,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: wallet,
          method: "suix_resolveNameServiceNames",
          params: [wallet, null, 1],
        }),
      },
      MAINNET_SUINS_RPC_TIMEOUT_MS,
    );

    if (!response.ok) {
      const result: ResolvedSuinsName = { status: "failed" };
      writeMainnetSuinsNameCache(wallet, result, now);
      return result;
    }

    const name = readPrimarySuinsName(await response.json());
    const result: ResolvedSuinsName = name
      ? { status: "resolved", name }
      : { status: "missing" };

    writeMainnetSuinsNameCache(wallet, result, now);
    return result;
  } catch {
    const result: ResolvedSuinsName = { status: "failed" };
    writeMainnetSuinsNameCache(wallet, result, now);
    return result;
  }
}

function readPrimarySuinsName(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  const result = payload.result;
  if (!isRecord(result) || !Array.isArray(result.data)) {
    return null;
  }

  const [primaryName] = result.data;
  if (typeof primaryName !== "string" || !primaryName.trim()) {
    return null;
  }

  return normalizeSuiNSName(primaryName.trim(), "dot");
}

function writeMainnetSuinsNameCache(
  wallet: string,
  result: ResolvedSuinsName,
  fetchedAtMs: number,
): void {
  if (mainnetSuinsNameCache.size >= MAINNET_SUINS_CACHE_MAX) {
    const oldestWallet = mainnetSuinsNameCache.keys().next().value;
    if (oldestWallet) {
      mainnetSuinsNameCache.delete(oldestWallet);
    }
  }

  mainnetSuinsNameCache.set(wallet, {
    fetchedAtMs,
    result,
  });
}

function isFreshCachedSuinsName(cached: CachedSuinsName, nowMs: number): boolean {
  const ttl =
    cached.result.status === "failed"
      ? MAINNET_SUINS_FAILURE_CACHE_TTL_MS
      : MAINNET_SUINS_CACHE_TTL_MS;

  return nowMs - cached.fetchedAtMs < ttl;
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
