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
  name: string | null;
};

const MAINNET_RPC_URL = "https://fullnode.mainnet.sui.io:443";
const MAINNET_SUINS_CACHE_TTL_MS = 15 * 60_000;
const MAINNET_SUINS_CACHE_MAX = 500;
const MAINNET_SUINS_LOOKUP_LIMIT = 50;

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

    if (!normalizedWallets.includes(normalizedWallet)) {
      normalizedWallets.push(normalizedWallet);
    }
  }

  const names: MainnetSuinsNameEntry[] = [];
  const missing: string[] = [];
  const failed: string[] = [];

  for (const wallet of normalizedWallets.slice(0, MAINNET_SUINS_LOOKUP_LIMIT)) {
    try {
      const name = await resolveMainnetSuinsName(wallet, {
        fetchImpl,
        nowMs,
      });

      if (name) {
        names.push({
          wallet,
          name,
          source: "mainnet_suins",
        });
      } else {
        missing.push(wallet);
      }
    } catch {
      failed.push(wallet);
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
  const wallets = [
    ...url.searchParams.getAll("wallet"),
    ...url.searchParams
      .getAll("wallets")
      .flatMap((value) => value.split(",")),
  ]
    .map((wallet) => wallet.trim())
    .filter(Boolean);

  return wallets.slice(0, MAINNET_SUINS_LOOKUP_LIMIT);
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
): Promise<string | null> {
  const now = nowMs();
  const cached = mainnetSuinsNameCache.get(wallet);

  if (cached && now - cached.fetchedAtMs < MAINNET_SUINS_CACHE_TTL_MS) {
    return cached.name;
  }

  const response = await fetchImpl(MAINNET_RPC_URL, {
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
  });

  if (!response.ok) {
    throw new Error(`SuiNS lookup failed with ${response.status}`);
  }

  const payload = await response.json();
  const name = readPrimarySuinsName(payload);

  writeMainnetSuinsNameCache(wallet, name, now);
  return name;
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
  name: string | null,
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
    name,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
