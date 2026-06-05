export type WalletDisplayNameSource = "mainnet_suins";

export type WalletDisplayName = {
  name: string;
  source: WalletDisplayNameSource;
};

export type WalletDisplayNamesByAddress = Record<string, WalletDisplayName>;

export type LoadMainnetSuinsNamesOptions = {
  apiBaseUrl?: string;
  fetcher?: typeof fetch;
  wallets: string[];
};

type MainnetSuinsNameApiEntry = {
  wallet?: unknown;
  name?: unknown;
  source?: unknown;
};

const MAINNET_SUINS_LOOKUP_LIMIT = 50;

export async function loadMainnetSuinsNames({
  apiBaseUrl,
  fetcher = fetch,
  wallets,
}: LoadMainnetSuinsNamesOptions): Promise<WalletDisplayNamesByAddress> {
  const normalizedBaseUrl = apiBaseUrl?.trim();
  const lookupWallets = uniqueWallets(wallets);

  if (!normalizedBaseUrl || lookupWallets.length === 0) {
    return {};
  }

  const response = await fetcher(buildMainnetSuinsNamesUrl(normalizedBaseUrl, lookupWallets));
  if (!response.ok) {
    return {};
  }

  return parseMainnetSuinsNames(await response.json());
}

export function resolveWalletDisplayName(
  wallet: string,
  displayNames: WalletDisplayNamesByAddress = {},
): WalletDisplayName | null {
  return displayNames[walletLookupKey(wallet)] ?? null;
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

function buildMainnetSuinsNamesUrl(apiBaseUrl: string, wallets: string[]): string {
  const url = new URL(`${apiBaseUrl.replace(/\/+$/, "")}/testnet/mainnet-suins-names`);

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

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
