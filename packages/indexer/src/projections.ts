import type {
  PredictNormalizedTradeEvent,
  PredictOraclePricePoint,
} from "./deepbook-predict";
import type { PredictPositionSummary } from "./store";

const ONE_DAY_MS = 24 * 60 * 60 * 1_000;
const PNL_SCORE_UNIT = 100_000;
const VOLUME_SCORE_UNIT = 100_000;

export type LatestTradeFeedProjectionOptions = {
  hideExpiredAtMs?: number;
  limit?: number;
};

export type TraderHeatProjectionOptions = {
  nowMs?: number;
  recentWindowMs?: number;
  limit?: number;
};

export type TraderHeatComponents = {
  recentActivity: number;
  realizedPnl: number;
  winRedeem: number;
  observedVolume: number;
};

export type TraderHeatProjection = {
  trader: string;
  hotScore: number;
  eventCount: number;
  mintCount: number;
  redeemCount: number;
  recentEventCount: number;
  observedVolume: number;
  realizedPnl: number;
  openCount: number;
  closedCount: number;
  winCount: number;
  lossCount: number;
  lastSeenMs: number;
  components: TraderHeatComponents;
};

export type WalletStatsOptions = {
  owner?: string;
};

export type WalletStats = {
  totalCost: number;
  totalPayout: number;
  realizedPnl: number;
  openCount: number;
  closedCount: number;
  winCount: number;
  lossCount: number;
};

export type WalletLeaderboardOptions = {
  limit?: number;
  nowMs?: number;
};

export type WalletStreakType = "win" | "loss" | "none";

export type WalletPerformanceEntry = {
  wallet: string;
  totalCost: number;
  totalPayout: number;
  totalPnl: number;
  openCount: number;
  closedCount: number;
  winCount: number;
  lossCount: number;
  longestWinningStreak: number;
  longestLosingStreak: number;
  currentStreakType: WalletStreakType;
  currentStreakLength: number;
  lastSettledAtMs: number;
  lastSeenMs: number;
};

export type WalletPerformanceLeaderboards = {
  longestWinningStreak: WalletPerformanceEntry[];
  longestLosingStreak: WalletPerformanceEntry[];
  currentWinningStreak: WalletPerformanceEntry[];
  currentLosingStreak: WalletPerformanceEntry[];
  highestPnl: WalletPerformanceEntry[];
  worstPnl: WalletPerformanceEntry[];
};

type TraderHeatAccumulator = {
  trader: string;
  eventCount: number;
  mintCount: number;
  redeemCount: number;
  recentEventCount: number;
  eventObservedVolume: number;
  positionCount: number;
  positionObservedVolume: number;
  realizedPnl: number;
  openCount: number;
  closedCount: number;
  winCount: number;
  lossCount: number;
  lastSeenMs: number;
};

export function buildLatestTradeFeedProjection(
  events: PredictNormalizedTradeEvent[],
  { hideExpiredAtMs, limit }: LatestTradeFeedProjectionOptions = {},
): PredictNormalizedTradeEvent[] {
  const visibleEvents =
    hideExpiredAtMs === undefined
      ? [...events]
      : events.filter((event) => event.expiryMs > hideExpiredAtMs);

  return applyLimit(visibleEvents.sort(compareTradeEventsLatestFirst), limit);
}

export function buildTraderHeatProjection(
  events: PredictNormalizedTradeEvent[],
  positions: PredictPositionSummary[],
  {
    nowMs = latestObservedTimestamp(events, positions),
    recentWindowMs = ONE_DAY_MS,
    limit,
  }: TraderHeatProjectionOptions = {},
): TraderHeatProjection[] {
  const groups = new Map<string, TraderHeatAccumulator>();

  for (const event of events) {
    const trader = event.trader ?? event.actor;
    const group = getTraderHeatAccumulator(groups, trader);

    group.eventCount += 1;
    group.lastSeenMs = Math.max(group.lastSeenMs, event.timestampMs);
    group.eventObservedVolume += (event.cost ?? 0) + (event.payout ?? 0);

    if (event.kind === "mint") {
      group.mintCount += 1;
    } else {
      group.redeemCount += 1;
    }

    if (isRecent(event.timestampMs, nowMs, recentWindowMs)) {
      group.recentEventCount += 1;
    }
  }

  for (const position of positions) {
    const group = getTraderHeatAccumulator(groups, position.owner);

    group.positionCount += 1;
    group.positionObservedVolume += position.cost + position.payout;
    group.lastSeenMs = Math.max(group.lastSeenMs, position.lastEventMs);

    if (position.status === "open") {
      group.openCount += 1;
      continue;
    }

    group.closedCount += 1;
    group.realizedPnl += position.realizedPnl;

    if (position.realizedPnl > 0) {
      group.winCount += 1;
    } else {
      group.lossCount += 1;
    }
  }

  return applyLimit(
    [...groups.values()]
      .map(projectTraderHeat)
      .sort(compareTraderHeatDescending),
    limit,
  );
}

export function downsampleOraclePricePoints(
  points: PredictOraclePricePoint[],
  maxPoints: number,
): PredictOraclePricePoint[] {
  const targetCount = Math.floor(maxPoints);
  if (targetCount <= 0) {
    return [];
  }

  const sorted = [...points].sort(compareOraclePricePoints);
  if (sorted.length <= targetCount) {
    return sorted;
  }

  if (targetCount === 1) {
    return [sorted[0]];
  }

  const lastIndex = sorted.length - 1;
  const selected: PredictOraclePricePoint[] = [];
  const selectedIndexes = new Set<number>();

  for (let slot = 0; slot < targetCount; slot += 1) {
    const index = Math.round((slot * lastIndex) / (targetCount - 1));
    if (!selectedIndexes.has(index)) {
      selectedIndexes.add(index);
      selected.push(sorted[index]);
    }
  }

  return selected;
}

export function summarizeWalletStats(
  positions: PredictPositionSummary[],
  { owner }: WalletStatsOptions = {},
): WalletStats {
  return positions
    .filter((position) => owner === undefined || position.owner === owner)
    .reduce<WalletStats>(
      (stats, position) => {
        stats.totalCost += position.cost;
        stats.totalPayout += position.payout;

        if (position.status === "open") {
          stats.openCount += 1;
          return stats;
        }

        stats.closedCount += 1;
        stats.realizedPnl += position.realizedPnl;

        if (position.realizedPnl > 0) {
          stats.winCount += 1;
        } else {
          stats.lossCount += 1;
        }

        return stats;
      },
      {
        totalCost: 0,
        totalPayout: 0,
        realizedPnl: 0,
        openCount: 0,
        closedCount: 0,
        winCount: 0,
        lossCount: 0,
      },
    );
}

export function buildWalletPerformanceLeaderboards(
  positions: PredictPositionSummary[],
  { limit, nowMs = Date.now() }: WalletLeaderboardOptions = {},
): WalletPerformanceLeaderboards {
  const entries = buildWalletPerformanceEntries(positions, { nowMs });

  return {
    longestWinningStreak: applyLimit(
      entries
        .filter((entry) => entry.longestWinningStreak > 0)
        .sort(compareByWinningStreak),
      limit,
    ),
    longestLosingStreak: applyLimit(
      entries
        .filter((entry) => entry.longestLosingStreak > 0)
        .sort(compareByLosingStreak),
      limit,
    ),
    currentWinningStreak: applyLimit(
      entries
        .filter(
          (entry) =>
            entry.currentStreakType === "win" && entry.currentStreakLength > 0,
        )
        .sort(compareByCurrentWinningStreak),
      limit,
    ),
    currentLosingStreak: applyLimit(
      entries
        .filter(
          (entry) =>
            entry.currentStreakType === "loss" && entry.currentStreakLength > 0,
        )
        .sort(compareByCurrentLosingStreak),
      limit,
    ),
    highestPnl: applyLimit([...entries].sort(compareByHighestPnl), limit),
    worstPnl: applyLimit([...entries].sort(compareByWorstPnl), limit),
  };
}

export function buildWalletPerformanceEntries(
  positions: PredictPositionSummary[],
  { nowMs = Date.now() }: { nowMs?: number } = {},
): WalletPerformanceEntry[] {
  const groups = new Map<string, PredictPositionSummary[]>();

  for (const position of positions) {
    groups.set(position.owner, [...(groups.get(position.owner) ?? []), position]);
  }

  return [...groups.entries()]
    .map(([wallet, walletPositions]) =>
      buildWalletPerformanceEntry(wallet, walletPositions, { nowMs }),
    )
    .filter((entry) => entry.closedCount > 0)
    .sort(compareByHighestPnl);
}

function buildWalletPerformanceEntry(
  wallet: string,
  positions: PredictPositionSummary[],
  { nowMs }: { nowMs: number },
): WalletPerformanceEntry {
  const sortedClosed = positions
    .filter((position) => position.status === "closed")
    .sort(comparePositionsOldestFirst);
  const stats = summarizeWalletStats(positions, { owner: wallet });
  const activeOpenCount = positions.filter(
    (position) => position.status === "open" && position.expiryMs > nowMs,
  ).length;
  let longestWinningStreak = 0;
  let longestLosingStreak = 0;
  let currentStreakType: WalletStreakType = "none";
  let currentStreakLength = 0;

  for (const position of sortedClosed) {
    const result = positionResult(position);
    if (result === "none") {
      currentStreakType = "none";
      currentStreakLength = 0;
      continue;
    }

    if (result === currentStreakType) {
      currentStreakLength += 1;
    } else {
      currentStreakType = result;
      currentStreakLength = 1;
    }

    if (result === "win") {
      longestWinningStreak = Math.max(longestWinningStreak, currentStreakLength);
    } else {
      longestLosingStreak = Math.max(longestLosingStreak, currentStreakLength);
    }
  }

  return {
    wallet,
    totalCost: stats.totalCost,
    totalPayout: stats.totalPayout,
    totalPnl: stats.realizedPnl,
    openCount: activeOpenCount,
    closedCount: stats.closedCount,
    winCount: stats.winCount,
    lossCount: stats.lossCount,
    longestWinningStreak,
    longestLosingStreak,
    currentStreakType,
    currentStreakLength,
    lastSettledAtMs: sortedClosed.at(-1)?.lastEventMs ?? 0,
    lastSeenMs: positions.reduce(
      (lastSeen, position) => Math.max(lastSeen, position.lastEventMs),
      0,
    ),
  };
}

function projectTraderHeat(group: TraderHeatAccumulator): TraderHeatProjection {
  const observedVolume =
    group.positionCount > 0
      ? group.positionObservedVolume
      : group.eventObservedVolume;
  const components = {
    recentActivity: Math.min(40, group.recentEventCount * 8),
    realizedPnl: clampScore(Math.round(group.realizedPnl / PNL_SCORE_UNIT), -30, 40),
    winRedeem: group.winCount * 12 + group.redeemCount * 4 - group.lossCount * 8,
    observedVolume: Math.min(25, Math.floor(observedVolume / VOLUME_SCORE_UNIT)),
  };

  return {
    trader: group.trader,
    hotScore: Math.max(
      0,
      components.recentActivity +
        components.realizedPnl +
        components.winRedeem +
        components.observedVolume,
    ),
    eventCount: group.eventCount,
    mintCount: group.mintCount,
    redeemCount: group.redeemCount,
    recentEventCount: group.recentEventCount,
    observedVolume,
    realizedPnl: group.realizedPnl,
    openCount: group.openCount,
    closedCount: group.closedCount,
    winCount: group.winCount,
    lossCount: group.lossCount,
    lastSeenMs: group.lastSeenMs,
    components,
  };
}

function getTraderHeatAccumulator(
  groups: Map<string, TraderHeatAccumulator>,
  trader: string,
): TraderHeatAccumulator {
  const existing = groups.get(trader);
  if (existing) {
    return existing;
  }

  const group = {
    trader,
    eventCount: 0,
    mintCount: 0,
    redeemCount: 0,
    recentEventCount: 0,
    eventObservedVolume: 0,
    positionCount: 0,
    positionObservedVolume: 0,
    realizedPnl: 0,
    openCount: 0,
    closedCount: 0,
    winCount: 0,
    lossCount: 0,
    lastSeenMs: 0,
  };
  groups.set(trader, group);

  return group;
}

function latestObservedTimestamp(
  events: PredictNormalizedTradeEvent[],
  positions: PredictPositionSummary[],
): number {
  return Math.max(
    0,
    ...events.map((event) => event.timestampMs),
    ...positions.map((position) => position.lastEventMs),
  );
}

function isRecent(timestampMs: number, nowMs: number, recentWindowMs: number): boolean {
  const ageMs = nowMs - timestampMs;

  return ageMs >= 0 && ageMs <= recentWindowMs;
}

function applyLimit<T>(values: T[], limit?: number): T[] {
  if (limit === undefined) {
    return values;
  }

  const normalizedLimit = Math.floor(limit);
  if (normalizedLimit <= 0) {
    return [];
  }

  return values.slice(0, normalizedLimit);
}

function clampScore(value: number, min: number, max: number): number {
  const clamped = Math.max(min, Math.min(max, value));

  return Object.is(clamped, -0) ? 0 : clamped;
}

function compareTradeEventsLatestFirst(
  left: PredictNormalizedTradeEvent,
  right: PredictNormalizedTradeEvent,
): number {
  return (
    right.timestampMs - left.timestampMs ||
    left.eventId.localeCompare(right.eventId)
  );
}

function compareTraderHeatDescending(
  left: TraderHeatProjection,
  right: TraderHeatProjection,
): number {
  return (
    right.hotScore - left.hotScore ||
    right.lastSeenMs - left.lastSeenMs ||
    left.trader.localeCompare(right.trader)
  );
}

function compareOraclePricePoints(
  left: PredictOraclePricePoint,
  right: PredictOraclePricePoint,
): number {
  return (
    left.timestampMs - right.timestampMs ||
    (left.eventId ?? "").localeCompare(right.eventId ?? "")
  );
}

function comparePositionsOldestFirst(
  left: PredictPositionSummary,
  right: PredictPositionSummary,
): number {
  return left.lastEventMs - right.lastEventMs || left.id.localeCompare(right.id);
}

function compareByWinningStreak(
  left: WalletPerformanceEntry,
  right: WalletPerformanceEntry,
): number {
  return (
    right.longestWinningStreak - left.longestWinningStreak ||
    right.totalPnl - left.totalPnl ||
    right.lastSettledAtMs - left.lastSettledAtMs ||
    left.wallet.localeCompare(right.wallet)
  );
}

function compareByLosingStreak(
  left: WalletPerformanceEntry,
  right: WalletPerformanceEntry,
): number {
  return (
    right.longestLosingStreak - left.longestLosingStreak ||
    left.totalPnl - right.totalPnl ||
    right.lastSettledAtMs - left.lastSettledAtMs ||
    left.wallet.localeCompare(right.wallet)
  );
}

function compareByCurrentWinningStreak(
  left: WalletPerformanceEntry,
  right: WalletPerformanceEntry,
): number {
  return (
    right.currentStreakLength - left.currentStreakLength ||
    right.totalPnl - left.totalPnl ||
    right.lastSettledAtMs - left.lastSettledAtMs ||
    left.wallet.localeCompare(right.wallet)
  );
}

function compareByCurrentLosingStreak(
  left: WalletPerformanceEntry,
  right: WalletPerformanceEntry,
): number {
  return (
    right.currentStreakLength - left.currentStreakLength ||
    left.totalPnl - right.totalPnl ||
    right.lastSettledAtMs - left.lastSettledAtMs ||
    left.wallet.localeCompare(right.wallet)
  );
}

function compareByHighestPnl(
  left: WalletPerformanceEntry,
  right: WalletPerformanceEntry,
): number {
  return (
    right.totalPnl - left.totalPnl ||
    right.longestWinningStreak - left.longestWinningStreak ||
    right.lastSettledAtMs - left.lastSettledAtMs ||
    left.wallet.localeCompare(right.wallet)
  );
}

function compareByWorstPnl(
  left: WalletPerformanceEntry,
  right: WalletPerformanceEntry,
): number {
  return (
    left.totalPnl - right.totalPnl ||
    right.longestLosingStreak - left.longestLosingStreak ||
    right.lastSettledAtMs - left.lastSettledAtMs ||
    left.wallet.localeCompare(right.wallet)
  );
}

function positionResult(position: PredictPositionSummary): WalletStreakType {
  if (position.realizedPnl > 0) {
    return "win";
  }

  if (position.realizedPnl < 0) {
    return "loss";
  }

  return "none";
}
