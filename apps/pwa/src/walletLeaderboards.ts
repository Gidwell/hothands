import {
  loadMainnetSuinsNames,
  resolveWalletDisplayName,
  type WalletDisplayNameSource,
  type WalletDisplayNamesByAddress,
} from "./suinsDisplayNames";
import { formatUtcTimeZoneText } from "./timeZoneLabels";

export type WalletLeaderboardBoardKey =
  | "longestWinningStreak"
  | "longestLosingStreak"
  | "currentWinningStreak"
  | "currentLosingStreak"
  | "highestPnl"
  | "worstPnl";

export type WalletLeaderboardPanelBoardKey = "pnl" | "streaks";
export type WalletLeaderboardSortDirection = "best" | "worst";

export type WalletLeaderboardStreakMode = "allTime" | "current";

export type WalletLeaderboardBoardDefinition = {
  key: WalletLeaderboardPanelBoardKey;
  label: string;
};

export type WalletLeaderboardTone = "positive" | "negative" | "flat";
export type WalletStreakType = "win" | "loss" | "none";

export type WalletLeaderboardApiEntry = {
  wallet?: unknown;
  totalCost?: unknown;
  totalPayout?: unknown;
  totalPnl?: unknown;
  openCount?: unknown;
  closedCount?: unknown;
  winCount?: unknown;
  lossCount?: unknown;
  longestWinningStreak?: unknown;
  longestLosingStreak?: unknown;
  currentStreakType?: unknown;
  currentStreakLength?: unknown;
  lastSettledAtMs?: unknown;
  lastSeenMs?: unknown;
};

export type WalletLeaderboardsApiResponse = {
  source?: unknown;
  leaderboards?: Partial<Record<WalletLeaderboardBoardKey, WalletLeaderboardApiEntry[]>>;
};

export type WalletLeaderboardEntry = {
  rank: number;
  wallet: string;
  displayName: string;
  displayNameSource?: WalletDisplayNameSource;
  totalCost: number;
  totalPayout: number;
  totalPnl: number;
  totalPnlLabel: string;
  totalPnlTone: WalletLeaderboardTone;
  openCount: number;
  closedCount: number;
  winCount: number;
  lossCount: number;
  longestWinningStreak: number;
  longestWinningStreakLabel: string;
  longestLosingStreak: number;
  longestLosingStreakLabel: string;
  currentStreakType: WalletStreakType;
  currentStreakLength: number;
  currentStreakLabel: string;
  lastSettledAtMs: number | null;
  lastSettledLabel: string;
  lastSeenMs: number | null;
};

export type WalletLeaderboardsSnapshot = {
  sourceLabel: string;
  leaderboards: Record<WalletLeaderboardBoardKey, WalletLeaderboardEntry[]>;
};

export type BuildWalletLeaderboardsOptions = {
  timeZone?: string;
  walletDisplayNames?: WalletDisplayNamesByAddress;
};

export type LoadWalletLeaderboardsOptions = BuildWalletLeaderboardsOptions & {
  apiBaseUrl?: string;
  fetcher?: typeof fetch;
  nowMs?: number;
  useMainnetSuinsNames?: boolean;
};

export const WALLET_LEADERBOARD_BOARDS: WalletLeaderboardBoardDefinition[] = [
  {
    key: "pnl",
    label: "PnL",
  },
  {
    key: "streaks",
    label: "Streaks",
  },
];

const EMPTY_LEADERBOARDS: Record<WalletLeaderboardBoardKey, WalletLeaderboardEntry[]> = {
  longestWinningStreak: [],
  longestLosingStreak: [],
  currentWinningStreak: [],
  currentLosingStreak: [],
  highestPnl: [],
  worstPnl: [],
};

export async function loadWalletLeaderboards({
  apiBaseUrl,
  fetcher = fetch,
  timeZone,
  useMainnetSuinsNames = false,
}: LoadWalletLeaderboardsOptions = {}): Promise<WalletLeaderboardsSnapshot> {
  if (!apiBaseUrl) {
    return buildWalletLeaderboards(undefined, { timeZone });
  }

  const response = await fetcher(buildWalletLeaderboardsUrl(apiBaseUrl));
  if (!response.ok) {
    throw new Error(`Wallet leaderboards failed with ${response.status}`);
  }

  const payload = await response.json();
  const walletDisplayNames = useMainnetSuinsNames
    ? await loadMainnetSuinsNames({
        apiBaseUrl,
        fetcher,
        wallets: collectLeaderboardWallets(payload),
      }).catch(() => ({}))
    : {};

  return buildWalletLeaderboards(payload, { timeZone, walletDisplayNames });
}

export function buildWalletLeaderboards(
  response?: WalletLeaderboardsApiResponse,
  { timeZone, walletDisplayNames = {} }: BuildWalletLeaderboardsOptions = {},
): WalletLeaderboardsSnapshot {
  const source = typeof response?.source === "string" ? response.source : undefined;
  const leaderboards = response?.leaderboards;

  if (!leaderboards) {
    return {
      sourceLabel: "Awaiting API",
      leaderboards: cloneEmptyLeaderboards(),
    };
  }

  return {
    sourceLabel: formatSourceLabel(source),
    leaderboards: {
      longestWinningStreak: buildEntries(
        leaderboards.longestWinningStreak,
        timeZone,
        walletDisplayNames,
      ),
      longestLosingStreak: buildEntries(
        leaderboards.longestLosingStreak,
        timeZone,
        walletDisplayNames,
      ),
      currentWinningStreak: buildEntries(
        leaderboards.currentWinningStreak,
        timeZone,
        walletDisplayNames,
      ),
      currentLosingStreak: buildEntries(
        leaderboards.currentLosingStreak,
        timeZone,
        walletDisplayNames,
      ),
      highestPnl: buildEntries(leaderboards.highestPnl, timeZone, walletDisplayNames),
      worstPnl: buildEntries(leaderboards.worstPnl, timeZone, walletDisplayNames),
    },
  };
}

export function selectWalletLeaderboardEntries(
  snapshot: WalletLeaderboardsSnapshot,
  board: WalletLeaderboardBoardKey,
): WalletLeaderboardEntry[] {
  return snapshot.leaderboards[board] ?? [];
}

function buildEntries(
  entries: WalletLeaderboardApiEntry[] | undefined,
  timeZone?: string,
  walletDisplayNames: WalletDisplayNamesByAddress = {},
): WalletLeaderboardEntry[] {
  return (entries ?? [])
    .map((entry, index) => buildEntry(entry, index + 1, timeZone, walletDisplayNames))
    .filter((entry): entry is WalletLeaderboardEntry => entry !== null)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function buildEntry(
  entry: WalletLeaderboardApiEntry,
  rank: number,
  timeZone?: string,
  walletDisplayNames: WalletDisplayNamesByAddress = {},
): WalletLeaderboardEntry | null {
  const wallet = typeof entry.wallet === "string" ? entry.wallet.trim() : "";
  if (!wallet) {
    return null;
  }

  const walletDisplayName = resolveWalletDisplayName(wallet, walletDisplayNames);
  const totalPnl = readNumber(entry.totalPnl);
  const longestWinningStreak = readInteger(entry.longestWinningStreak);
  const longestLosingStreak = readInteger(entry.longestLosingStreak);
  const currentStreakType = readStreakType(entry.currentStreakType);
  const currentStreakLength = readInteger(entry.currentStreakLength);
  const lastSettledAtMs = readOptionalTimestampMs(entry.lastSettledAtMs);

  return {
    rank,
    wallet,
    displayName: walletDisplayName?.name ?? formatWallet(wallet),
    ...(walletDisplayName
      ? { displayNameSource: walletDisplayName.source }
      : {}),
    totalCost: readNumber(entry.totalCost),
    totalPayout: readNumber(entry.totalPayout),
    totalPnl,
    totalPnlLabel: formatSignedDusdc(totalPnl),
    totalPnlTone: formatPnlTone(totalPnl),
    openCount: readInteger(entry.openCount),
    closedCount: readInteger(entry.closedCount),
    winCount: readInteger(entry.winCount),
    lossCount: readInteger(entry.lossCount),
    longestWinningStreak,
    longestWinningStreakLabel: formatStreakCount(longestWinningStreak, "win"),
    longestLosingStreak,
    longestLosingStreakLabel: formatStreakCount(longestLosingStreak, "loss"),
    currentStreakType,
    currentStreakLength,
    currentStreakLabel: formatCurrentStreak(currentStreakType, currentStreakLength),
    lastSettledAtMs,
    lastSettledLabel: formatLastSettled(lastSettledAtMs, timeZone),
    lastSeenMs: readOptionalTimestampMs(entry.lastSeenMs),
  };
}

function buildWalletLeaderboardsUrl(apiBaseUrl: string): string {
  return `${apiBaseUrl.replace(/\/+$/, "")}/testnet/wallet-leaderboards`;
}

function collectLeaderboardWallets(response: unknown): string[] {
  if (!isRecord(response) || !isRecord(response.leaderboards)) {
    return [];
  }

  const wallets: string[] = [];

  for (const entries of Object.values(response.leaderboards)) {
    if (!Array.isArray(entries)) {
      continue;
    }

    for (const entry of entries) {
      if (!isRecord(entry) || typeof entry.wallet !== "string") {
        continue;
      }

      wallets.push(entry.wallet);
    }
  }

  return wallets;
}

function cloneEmptyLeaderboards(): Record<WalletLeaderboardBoardKey, WalletLeaderboardEntry[]> {
  return {
    longestWinningStreak: [...EMPTY_LEADERBOARDS.longestWinningStreak],
    longestLosingStreak: [...EMPTY_LEADERBOARDS.longestLosingStreak],
    currentWinningStreak: [...EMPTY_LEADERBOARDS.currentWinningStreak],
    currentLosingStreak: [...EMPTY_LEADERBOARDS.currentLosingStreak],
    highestPnl: [...EMPTY_LEADERBOARDS.highestPnl],
    worstPnl: [...EMPTY_LEADERBOARDS.worstPnl],
  };
}

function readNumber(value: unknown): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function readInteger(value: unknown): number {
  const numberValue = Math.floor(readNumber(value));
  return numberValue > 0 ? numberValue : 0;
}

function readOptionalTimestampMs(value: unknown): number | null {
  const numberValue = readNumber(value);
  return numberValue > 0 ? numberValue : null;
}

function readStreakType(value: unknown): WalletStreakType {
  return value === "win" || value === "loss" ? value : "none";
}

function formatSourceLabel(source: string | undefined): string {
  switch (source) {
    case "indexed_testnet":
      return "Indexed Testnet";
    case "live_testnet":
      return "Live Testnet";
    case "captured_testnet":
      return "Captured Testnet";
    default:
      return "Testnet";
  }
}

function formatWallet(wallet: string): string {
  return wallet.length > 14 ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : wallet;
}

function formatSignedDusdc(value: number): string {
  if (value === 0) {
    return "$0.00";
  }

  const prefix = value > 0 ? "+" : "-";
  return `${prefix}${formatDusdc(Math.abs(value))}`;
}

function formatDusdc(value: number): string {
  return (value / 1_000_000).toLocaleString("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  });
}

function formatPnlTone(value: number): WalletLeaderboardTone {
  if (value > 0) {
    return "positive";
  }

  return value < 0 ? "negative" : "flat";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatCurrentStreak(type: WalletStreakType, count: number): string {
  if (type === "win") {
    return formatStreakCount(count, "win");
  }

  if (type === "loss") {
    return formatStreakCount(count, "loss");
  }

  return "No streak";
}

function formatStreakCount(count: number, type: "win" | "loss"): string {
  if (type === "win") {
    return `${count} win${count === 1 ? "" : "s"}`;
  }

  return `${count} ${count === 1 ? "loss" : "losses"}`;
}

function formatLastSettled(timestampMs: number | null, timeZone?: string): string {
  if (timestampMs === null) {
    return "No settlement";
  }

  const date = new Date(timestampMs);
  const label = formatDate(date, timeZone) ?? formatDate(date);
  return label ?? "No settlement";
}

function formatDate(date: Date, timeZone?: string): string | null {
  try {
    const label = new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "short",
      timeZone,
      timeZoneName: "short",
    })
      .format(date)
      .replace(" at ", ", ");

    return formatUtcTimeZoneText(label);
  } catch {
    return null;
  }
}
