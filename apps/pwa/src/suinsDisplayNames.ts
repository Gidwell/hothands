export type WalletDisplayNameSource =
  | "hot_hands_profile"
  | "mainnet_suins"
  | "demo_seed";

export type WalletDisplayName = {
  name: string;
  source: WalletDisplayNameSource;
};

export type WalletDisplayNamesByAddress = Record<string, WalletDisplayName>;

export type LoadMainnetSuinsNamesOptions = {
  apiBaseUrl?: string;
  fetcher?: typeof fetch;
  nowMs?: () => number;
  wallets: string[];
};

export type LoadHotHandsProfileNamesOptions = {
  apiBaseUrl?: string;
  fetcher?: typeof fetch;
  nowMs?: () => number;
  wallets: string[];
};

type MainnetSuinsNameApiEntry = {
  wallet?: unknown;
  name?: unknown;
  source?: unknown;
};

type HotHandsProfileApiEntry = {
  wallet?: unknown;
  displayName?: unknown;
};

type CachedWalletDisplayName = {
  cachedAtMs: number;
  displayName: WalletDisplayName | null;
  status: "resolved" | "missing" | "failed";
};

const MAINNET_SUINS_LOOKUP_LIMIT = 50;
const MAINNET_SUINS_CACHE_TTL_MS = 15 * 60_000;
const MAINNET_SUINS_FAILURE_CACHE_TTL_MS = 60_000;
const MAINNET_SUINS_REQUEST_TIMEOUT_MS = 500;
const HOT_HANDS_PROFILE_NAMES_CACHE_TTL_MS = 60_000;
const HOT_HANDS_PROFILE_NAMES_FAILURE_CACHE_TTL_MS = 10_000;
const HOT_HANDS_PROFILE_NAMES_REQUEST_TIMEOUT_MS = 500;
const DEMO_SUINS_NAMES = [
  "alpha.sui",
  "breakout.sui",
  "signal.sui",
  "conviction.sui",
  "momentum.sui",
  "oracle.sui",
  "strike.sui",
  "tempo.sui",
  "volatility.sui",
  "uponly.sui",
  "countertrade.sui",
  "deepbook.sui",
];

const mainnetSuinsDisplayNameCache = new Map<string, CachedWalletDisplayName>();
const hotHandsProfileNameCache = new Map<string, CachedWalletDisplayName>();

export async function loadMainnetSuinsNames({
  apiBaseUrl,
  fetcher = fetch,
  nowMs = Date.now,
  wallets,
}: LoadMainnetSuinsNamesOptions): Promise<WalletDisplayNamesByAddress> {
  const normalizedBaseUrl = apiBaseUrl?.trim();
  const lookupWallets = uniqueWallets(wallets);
  const now = nowMs();

  if (!normalizedBaseUrl || lookupWallets.length === 0) {
    return {};
  }

  const displayNames = readCachedDisplayNames(lookupWallets, now);
  const uncachedWallets = lookupWallets.filter(
    (wallet) => !isFreshCachedDisplayName(walletLookupKey(wallet), now),
  );

  if (uncachedWallets.length === 0) {
    return displayNames;
  }

  try {
    const response = await fetchWithTimeout(
      fetcher,
      buildMainnetSuinsNamesUrl(normalizedBaseUrl, uncachedWallets),
      MAINNET_SUINS_REQUEST_TIMEOUT_MS,
    );

    if (!response.ok) {
      writeFailedCacheEntries(uncachedWallets, now);
      return readCachedDisplayNames(lookupWallets, now, true);
    }

    const payload = await response.json();
    writeResponseCacheEntries(payload, uncachedWallets, now);
    return readCachedDisplayNames(lookupWallets, now, true);
  } catch {
    writeFailedCacheEntries(uncachedWallets, now);
    return readCachedDisplayNames(lookupWallets, now, true);
  }
}

export async function loadHotHandsProfileNames({
  apiBaseUrl,
  fetcher = fetch,
  nowMs = Date.now,
  wallets,
}: LoadHotHandsProfileNamesOptions): Promise<WalletDisplayNamesByAddress> {
  const normalizedBaseUrl = apiBaseUrl?.trim();
  const lookupWallets = uniqueWallets(wallets);
  const now = nowMs();

  if (!normalizedBaseUrl || lookupWallets.length === 0) {
    return {};
  }

  const displayNames = readCachedDisplayNamesFromCache(
    hotHandsProfileNameCache,
    lookupWallets,
    now,
  );
  const uncachedWallets = lookupWallets.filter(
    (wallet) =>
      !isFreshCachedDisplayNameInCache(hotHandsProfileNameCache, walletLookupKey(wallet), now),
  );

  if (uncachedWallets.length === 0) {
    return displayNames;
  }

  try {
    const response = await fetchWithTimeout(
      fetcher,
      buildHotHandsProfileNamesUrl(normalizedBaseUrl, uncachedWallets),
      HOT_HANDS_PROFILE_NAMES_REQUEST_TIMEOUT_MS,
    );

    if (!response.ok) {
      writeFailedCacheEntriesToCache(hotHandsProfileNameCache, uncachedWallets, now);
      return readCachedDisplayNamesFromCache(
        hotHandsProfileNameCache,
        lookupWallets,
        now,
        true,
      );
    }

    writeHotHandsProfileResponseCacheEntries(await response.json(), uncachedWallets, now);
    return readCachedDisplayNamesFromCache(
      hotHandsProfileNameCache,
      lookupWallets,
      now,
      true,
    );
  } catch {
    writeFailedCacheEntriesToCache(hotHandsProfileNameCache, uncachedWallets, now);
    return readCachedDisplayNamesFromCache(
      hotHandsProfileNameCache,
      lookupWallets,
      now,
      true,
    );
  }
}

export function resolveWalletDisplayName(
  wallet: string,
  displayNames: WalletDisplayNamesByAddress = {},
): WalletDisplayName | null {
  return displayNames[walletLookupKey(wallet)] ?? null;
}

export function mergeDemoWalletDisplayNames(
  wallets: string[],
  displayNames: WalletDisplayNamesByAddress = {},
): WalletDisplayNamesByAddress {
  const merged: WalletDisplayNamesByAddress = { ...displayNames };
  const usedNames = new Set(
    Object.values(merged).map((displayName) => displayName.name.toLowerCase()),
  );

  for (const wallet of uniqueWallets(wallets)) {
    const key = walletLookupKey(wallet);
    if (merged[key]) {
      continue;
    }

    const baseName = DEMO_SUINS_NAMES[walletNameSeed(wallet) % DEMO_SUINS_NAMES.length];
    const name = usedNames.has(baseName.toLowerCase())
      ? `${baseName.replace(/\.sui$/, "")}${(walletNameSeed(`${wallet}:suffix`) % 89) + 10}.sui`
      : baseName;
    usedNames.add(name.toLowerCase());
    merged[key] = {
      name,
      source: "demo_seed",
    };
  }

  return merged;
}

export function parseMainnetSuinsNames(
  response: unknown,
): WalletDisplayNamesByAddress {
  const entries = isRecord(response) && Array.isArray(response.names) ? response.names : [];
  const displayNames: WalletDisplayNamesByAddress = {};

  for (const entry of entries) {
    if (!isRecord(entry)) {
      continue;
    }

    const wallet = readString(entry.wallet);
    const name = readString(entry.name);
    const source = readString(entry.source);

    if (!wallet || !name || source !== "mainnet_suins") {
      continue;
    }

    displayNames[walletLookupKey(wallet)] = {
      name,
      source: "mainnet_suins",
    };
  }

  return displayNames;
}

export function parseHotHandsProfileNames(
  response: unknown,
): WalletDisplayNamesByAddress {
  const entries = isRecord(response) && Array.isArray(response.profiles)
    ? response.profiles
    : [];
  const displayNames: WalletDisplayNamesByAddress = {};

  for (const entry of entries) {
    if (!isRecord(entry)) {
      continue;
    }

    const wallet = readString(entry.wallet);
    const displayName = readString(entry.displayName);

    if (!wallet || !displayName) {
      continue;
    }

    displayNames[walletLookupKey(wallet)] = {
      name: displayName,
      source: "hot_hands_profile",
    };
  }

  return displayNames;
}

export function clearMainnetSuinsDisplayNameCacheForTest(): void {
  mainnetSuinsDisplayNameCache.clear();
}

export function clearHotHandsProfileNameCacheForTest(): void {
  hotHandsProfileNameCache.clear();
}

function buildMainnetSuinsNamesUrl(apiBaseUrl: string, wallets: string[]): string {
  const url = new URL(`${apiBaseUrl.replace(/\/+$/, "")}/testnet/mainnet-suins-names`);

  for (const wallet of wallets) {
    url.searchParams.append("wallet", wallet);
  }

  return url.toString();
}

function buildHotHandsProfileNamesUrl(apiBaseUrl: string, wallets: string[]): string {
  const url = new URL(`${apiBaseUrl.replace(/\/+$/, "")}/app/profiles`);

  for (const wallet of wallets) {
    url.searchParams.append("wallet", wallet);
  }

  return url.toString();
}

function uniqueWallets(wallets: string[]): string[] {
  const seenWallets = new Set<string>();
  const unique: string[] = [];

  for (const wallet of wallets) {
    const trimmedWallet = wallet.trim();
    const key = walletLookupKey(trimmedWallet);

    if (!trimmedWallet || seenWallets.has(key)) {
      continue;
    }

    seenWallets.add(key);
    unique.push(trimmedWallet);

    if (unique.length >= MAINNET_SUINS_LOOKUP_LIMIT) {
      break;
    }
  }

  return unique;
}

function walletLookupKey(wallet: string): string {
  return wallet.trim().toLowerCase();
}

function walletNameSeed(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function readCachedDisplayNames(
  wallets: string[],
  nowMs: number,
  includeStaleResolved = false,
): WalletDisplayNamesByAddress {
  const displayNames: WalletDisplayNamesByAddress = {};

  for (const wallet of wallets) {
    const key = walletLookupKey(wallet);
    const cached = mainnetSuinsDisplayNameCache.get(key);

    if (
      cached?.displayName &&
      (includeStaleResolved || isFreshCachedDisplayName(key, nowMs))
    ) {
      displayNames[key] = cached.displayName;
    }
  }

  return displayNames;
}

function isFreshCachedDisplayName(key: string, nowMs: number): boolean {
  const cached = mainnetSuinsDisplayNameCache.get(key);
  if (!cached) {
    return false;
  }

  const ttl =
    cached.status === "failed"
      ? MAINNET_SUINS_FAILURE_CACHE_TTL_MS
      : MAINNET_SUINS_CACHE_TTL_MS;

  return nowMs - cached.cachedAtMs < ttl;
}

function readCachedDisplayNamesFromCache(
  cache: Map<string, CachedWalletDisplayName>,
  wallets: string[],
  nowMs: number,
  includeStaleResolved = false,
): WalletDisplayNamesByAddress {
  const displayNames: WalletDisplayNamesByAddress = {};

  for (const wallet of wallets) {
    const key = walletLookupKey(wallet);
    const cached = cache.get(key);

    if (
      cached?.displayName &&
      (includeStaleResolved ||
        isFreshCachedDisplayNameInCache(cache, key, nowMs))
    ) {
      displayNames[key] = cached.displayName;
    }
  }

  return displayNames;
}

function isFreshCachedDisplayNameInCache(
  cache: Map<string, CachedWalletDisplayName>,
  key: string,
  nowMs: number,
): boolean {
  const cached = cache.get(key);
  if (!cached) {
    return false;
  }

  const ttl =
    cached.status === "failed"
      ? HOT_HANDS_PROFILE_NAMES_FAILURE_CACHE_TTL_MS
      : HOT_HANDS_PROFILE_NAMES_CACHE_TTL_MS;

  return nowMs - cached.cachedAtMs < ttl;
}

function writeResponseCacheEntries(
  response: unknown,
  requestedWallets: string[],
  cachedAtMs: number,
): void {
  const displayNames = parseMainnetSuinsNames(response);
  const missingWallets = parseStringArrayField(response, "missing");
  const failedWallets = parseStringArrayField(response, "failed");

  for (const [wallet, displayName] of Object.entries(displayNames)) {
    mainnetSuinsDisplayNameCache.set(walletLookupKey(wallet), {
      cachedAtMs,
      displayName,
      status: "resolved",
    });
  }

  for (const wallet of missingWallets) {
    mainnetSuinsDisplayNameCache.set(walletLookupKey(wallet), {
      cachedAtMs,
      displayName: null,
      status: "missing",
    });
  }

  for (const wallet of failedWallets) {
    mainnetSuinsDisplayNameCache.set(walletLookupKey(wallet), {
      cachedAtMs,
      displayName: null,
      status: "failed",
    });
  }

  for (const wallet of requestedWallets) {
    const key = walletLookupKey(wallet);
    if (!mainnetSuinsDisplayNameCache.has(key)) {
      mainnetSuinsDisplayNameCache.set(key, {
        cachedAtMs,
        displayName: null,
        status: "missing",
      });
    }
  }
}

function writeFailedCacheEntries(wallets: string[], cachedAtMs: number): void {
  for (const wallet of wallets) {
    const key = walletLookupKey(wallet);
    const existing = mainnetSuinsDisplayNameCache.get(key);

    mainnetSuinsDisplayNameCache.set(key, {
      cachedAtMs,
      displayName: existing?.displayName ?? null,
      status: "failed",
    });
  }
}

function writeHotHandsProfileResponseCacheEntries(
  response: unknown,
  requestedWallets: string[],
  cachedAtMs: number,
): void {
  const displayNames = parseHotHandsProfileNames(response);

  for (const [wallet, displayName] of Object.entries(displayNames)) {
    hotHandsProfileNameCache.set(walletLookupKey(wallet), {
      cachedAtMs,
      displayName,
      status: "resolved",
    });
  }

  for (const wallet of requestedWallets) {
    const key = walletLookupKey(wallet);
    if (!hotHandsProfileNameCache.has(key)) {
      hotHandsProfileNameCache.set(key, {
        cachedAtMs,
        displayName: null,
        status: "missing",
      });
    }
  }
}

function writeFailedCacheEntriesToCache(
  cache: Map<string, CachedWalletDisplayName>,
  wallets: string[],
  cachedAtMs: number,
): void {
  for (const wallet of wallets) {
    const key = walletLookupKey(wallet);
    const existing = cache.get(key);

    cache.set(key, {
      cachedAtMs,
      displayName: existing?.displayName ?? null,
      status: "failed",
    });
  }
}

async function fetchWithTimeout(
  fetcher: typeof fetch,
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetcher(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseStringArrayField(response: unknown, field: string): string[] {
  if (!isRecord(response) || !Array.isArray(response[field])) {
    return [];
  }

  return response[field].map(readString).filter(Boolean);
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
