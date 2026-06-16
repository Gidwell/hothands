import type {
  PredictNormalizedTradeEvent,
  PredictOracleState,
  PredictOraclePricePoint,
} from "./deepbook-predict";
import type { PredictPositionSummary } from "./store";

const ONE_DAY_MS = 24 * 60 * 60 * 1_000;

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
  edge: number;
  profit: number;
  consistency: number;
  confidence: number;
  freshness: number;
  lossPenalty: number;
  skill: number;
};

export type TraderHeatProjection = {
  trader: string;
  hotScore: number;
  skillScore: number;
  eventCount: number;
  mintCount: number;
  redeemCount: number;
  recentEventCount: number;
  decisionCount: number;
  observedVolume: number;
  realizedPnl: number;
  openCount: number;
  closedCount: number;
  winCount: number;
  lossCount: number;
  currentStreakType: WalletStreakType;
  currentStreakLength: number;
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
  oracles?: PredictOracleState[];
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
  heatScore: number;
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
  decisions: Map<string, TraderHeatDecisionAccumulator>;
};

type WalletResolvedPosition = {
  cost: number;
  payout: number;
  pnl: number;
  result: WalletStreakType;
  resolvedAtMs: number;
};

type TraderHeatResolvedPosition = {
  cost: number;
  payout: number;
  quantity: number;
  resolvedAtMs: number;
};

type TraderHeatDecisionAccumulator = TraderHeatResolvedPosition & {
  count: number;
};

type TraderHeatDecision = TraderHeatDecisionAccumulator & {
  pnl: number;
  impliedProbability: number;
  outcome: number;
  roi: number;
  weight: number;
  result: WalletStreakType;
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
      addTraderHeatDecision(group, position);
      continue;
    }

    group.closedCount += 1;
    group.realizedPnl += position.realizedPnl;
    addTraderHeatDecision(group, position);

    if (position.realizedPnl > 0) {
      group.winCount += 1;
    } else {
      group.lossCount += 1;
    }
  }

  return applyLimit(
    [...groups.values()]
      .map((group) => projectTraderHeat(group, nowMs))
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
  { limit, nowMs = Date.now(), oracles = [] }: WalletLeaderboardOptions = {},
): WalletPerformanceLeaderboards {
  const entries = buildWalletPerformanceEntries(positions, { nowMs, oracles });

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
  { nowMs = Date.now(), oracles = [] }: { nowMs?: number; oracles?: PredictOracleState[] } = {},
): WalletPerformanceEntry[] {
  const groups = new Map<string, PredictPositionSummary[]>();
  const settlementsByOracleId = buildSettlementMap(oracles);
  const heatByWallet = new Map(
    buildTraderHeatProjection([], positions, { nowMs }).map((entry) => [
      entry.trader,
      entry.hotScore,
    ]),
  );

  for (const position of positions) {
    groups.set(position.owner, [...(groups.get(position.owner) ?? []), position]);
  }

  return [...groups.entries()]
    .map(([wallet, walletPositions]) =>
      buildWalletPerformanceEntry(wallet, walletPositions, {
        heatScore: heatByWallet.get(wallet) ?? 0,
        nowMs,
        settlementsByOracleId,
      }),
    )
    .filter((entry) => entry.closedCount > 0)
    .sort(compareByHighestPnl);
}

function buildWalletPerformanceEntry(
  wallet: string,
  positions: PredictPositionSummary[],
  {
    heatScore,
    nowMs,
    settlementsByOracleId,
  }: { heatScore: number; nowMs: number; settlementsByOracleId: Map<string, PredictOracleState> },
): WalletPerformanceEntry {
  const resolvedPositions = positions
    .flatMap((position) =>
      buildResolvedWalletPositions(
        position,
        nowMs,
        settlementsByOracleId.get(position.oracleId),
      ),
    )
    .sort(compareResolvedPositionsOldestFirst);
  const activeOpenCount = positions.filter(
    (position) => position.status === "open" && position.expiryMs > nowMs,
  ).length;
  const totals = resolvedPositions.reduce(
    (stats, position) => {
      stats.totalCost += position.cost;
      stats.totalPayout += position.payout;
      stats.totalPnl += position.pnl;
      if (position.pnl > 0) {
        stats.winCount += 1;
      } else if (position.pnl < 0) {
        stats.lossCount += 1;
      }

      return stats;
    },
    {
      totalCost: 0,
      totalPayout: 0,
      totalPnl: 0,
      winCount: 0,
      lossCount: 0,
    },
  );
  let longestWinningStreak = 0;
  let longestLosingStreak = 0;
  let currentStreakType: WalletStreakType = "none";
  let currentStreakLength = 0;

  for (const position of resolvedPositions) {
    const result = position.result;
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
    totalCost: totals.totalCost,
    totalPayout: totals.totalPayout,
    totalPnl: totals.totalPnl,
    openCount: activeOpenCount,
    closedCount: resolvedPositions.length,
    winCount: totals.winCount,
    lossCount: totals.lossCount,
    heatScore,
    longestWinningStreak,
    longestLosingStreak,
    currentStreakType,
    currentStreakLength,
    lastSettledAtMs: resolvedPositions.at(-1)?.resolvedAtMs ?? 0,
    lastSeenMs: positions.reduce(
      (lastSeen, position) => Math.max(lastSeen, position.lastEventMs),
      0,
    ),
  };
}

function buildResolvedWalletPositions(
  position: PredictPositionSummary,
  nowMs: number,
  oracle?: PredictOracleState,
): WalletResolvedPosition[] {
  if (position.status === "closed") {
    const settlement = settledOraclePrice(oracle);
    return [
      buildResolvedWalletPosition({
        cost: position.cost,
        payout: position.payout,
        resolvedAtMs: resolvedWalletPositionTime(position, settlement),
      }),
    ];
  }

  const settlement = settledOraclePrice(oracle);
  if (position.expiryMs <= nowMs && settlement !== null) {
    const didWin = didPositionWin({
      isUp: position.isUp,
      settlementPrice: settlement.price,
      strike: position.strike,
    });
    const payout = position.payout + (didWin ? position.openQuantity : 0);

    return [
      buildResolvedWalletPosition({
        cost: position.cost,
        payout,
        resolvedAtMs: Math.max(position.expiryMs, settlement.settledAtMs ?? position.expiryMs),
      }),
    ];
  }

  const redeemedCost = redeemedCostBasis(position);
  if (redeemedCost <= 0 && position.payout <= 0) {
    return [];
  }

  return [
    buildResolvedWalletPosition({
      cost: redeemedCost,
      payout: position.payout,
      resolvedAtMs: position.lastEventMs,
    }),
  ];
}

function buildResolvedWalletPosition({
  cost,
  payout,
  resolvedAtMs,
}: {
  cost: number;
  payout: number;
  resolvedAtMs: number;
}): WalletResolvedPosition {
  const pnl = payout - cost;

  return {
    cost,
    payout,
    pnl,
    result: pnl > 0 ? "win" : pnl < 0 ? "loss" : "none",
    resolvedAtMs,
  };
}

function resolvedWalletPositionTime(
  position: PredictPositionSummary,
  settlement: { settledAtMs: number | null } | null,
): number {
  if (settlement && position.lastEventMs >= position.expiryMs) {
    return Math.max(position.expiryMs, settlement.settledAtMs ?? position.expiryMs);
  }

  return position.lastEventMs;
}

function redeemedCostBasis(position: PredictPositionSummary): number {
  if (position.redeemedQuantity <= 0 || position.mintedQuantity <= 0) {
    return 0;
  }

  const redeemedQuantity = Math.min(position.redeemedQuantity, position.mintedQuantity);

  return Math.floor((position.cost * redeemedQuantity) / position.mintedQuantity);
}

function buildSettlementMap(oracles: PredictOracleState[]): Map<string, PredictOracleState> {
  const settlements = new Map<string, PredictOracleState>();

  for (const oracle of oracles) {
    settlements.set(oracle.oracle_id, oracle);
  }

  return settlements;
}

function settledOraclePrice(
  oracle: PredictOracleState | undefined,
): { price: number; settledAtMs: number | null } | null {
  if (
    !oracle ||
    oracle.status !== "settled" ||
    typeof oracle.settlement_price !== "number" ||
    !Number.isFinite(oracle.settlement_price)
  ) {
    return null;
  }

  return {
    price: oracle.settlement_price,
    settledAtMs:
      typeof oracle.settled_at === "number" && Number.isFinite(oracle.settled_at)
        ? normalizeEpochMs(oracle.settled_at)
        : null,
  };
}

function projectTraderHeat(
  group: TraderHeatAccumulator,
  nowMs: number,
): TraderHeatProjection {
  const observedVolume =
    group.positionCount > 0
      ? group.positionObservedVolume
      : group.eventObservedVolume;
  const decisions = [...group.decisions.values()]
    .map((decision) => projectTraderHeatDecision(decision, nowMs))
    .sort(compareTraderHeatDecisionsOldestFirst);
  const decisionCount = decisions.length;
  const wins = decisions.filter((decision) => decision.result === "win").length;
  const totalWeight = decisions.reduce(
    (sum, decision) => sum + decision.weight,
    0,
  );
  const totalWeightSquared = decisions.reduce(
    (sum, decision) => sum + decision.weight * decision.weight,
    0,
  );
  const edgeNumerator = decisions.reduce(
    (sum, decision) =>
      sum +
      decision.weight * (decision.outcome - decision.impliedProbability),
    0,
  );
  const edgeVariance = decisions.reduce(
    (sum, decision) =>
      sum +
      decision.weight *
        decision.weight *
        decision.impliedProbability *
        (1 - decision.impliedProbability),
    0,
  );
  const edgeZ =
    edgeVariance > 0 ? edgeNumerator / Math.sqrt(edgeVariance) : 0;
  const edgeScore = sigmoid(edgeZ / 2.25);
  const meanRoi =
    totalWeight > 0
      ? decisions.reduce(
          (sum, decision) => sum + decision.weight * decision.roi,
          0,
        ) / totalWeight
      : 0;
  const downsideDeviation =
    totalWeight > 0
      ? Math.sqrt(
          decisions.reduce(
            (sum, decision) =>
              sum + decision.weight * Math.min(0, decision.roi) ** 2,
            0,
          ) / totalWeight,
        )
      : 0;
  const sortino = meanRoi / (downsideDeviation + 0.2);
  const profitScore = sigmoid(sortino / 1.25);
  const consistencyScore = wilsonLowerBound(wins, decisionCount);
  const effectiveSampleSize =
    totalWeightSquared > 0 ? (totalWeight * totalWeight) / totalWeightSquared : 0;
  const confidence =
    effectiveSampleSize > 0
      ? Math.sqrt(effectiveSampleSize / (effectiveSampleSize + 8))
      : 0;
  const lastResolvedAtMs = decisions.at(-1)?.resolvedAtMs;
  const daysSinceLastResolved =
    lastResolvedAtMs === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(0, (nowMs - lastResolvedAtMs) / ONE_DAY_MS);
  const freshness =
    lastResolvedAtMs === undefined
      ? 0.35
      : 0.35 + 0.65 * 2 ** (-daysSinceLastResolved / 7);
  const streak = traderHeatCurrentStreak(decisions);
  const currentLossStreak =
    streak.currentStreakType === "loss" ? streak.currentStreakLength : 0;
  const lossPenalty = 0.75 ** currentLossStreak;
  const baseSkill =
    0.5 * edgeScore + 0.3 * profitScore + 0.2 * consistencyScore;
  const skillScore = clampScore(
    Math.round(100 * baseSkill * confidence * freshness * lossPenalty),
    0,
    99,
  );
  const hotScore = calibrateHeatScore(skillScore);
  const components = {
    edge: Math.round(edgeScore * 100),
    profit: Math.round(profitScore * 100),
    consistency: Math.round(consistencyScore * 100),
    confidence: Math.round(confidence * 100),
    freshness: Math.round(freshness * 100),
    lossPenalty: Math.round(lossPenalty * 100),
    skill: skillScore,
  };

  return {
    trader: group.trader,
    hotScore,
    skillScore,
    eventCount: group.eventCount,
    mintCount: group.mintCount,
    redeemCount: group.redeemCount,
    recentEventCount: group.recentEventCount,
    decisionCount,
    observedVolume,
    realizedPnl: group.realizedPnl,
    openCount: group.openCount,
    closedCount: group.closedCount,
    winCount: group.winCount,
    lossCount: group.lossCount,
    currentStreakType: streak.currentStreakType,
    currentStreakLength: streak.currentStreakLength,
    lastSeenMs: group.lastSeenMs,
    components,
  };
}

function addTraderHeatDecision(
  group: TraderHeatAccumulator,
  position: PredictPositionSummary,
): void {
  const resolved = resolveTraderHeatPosition(position);
  if (!resolved || resolved.cost <= 0 || resolved.quantity <= 0) {
    return;
  }

  const key = [
    position.owner,
    position.oracleId,
    position.expiryMs,
    position.strike,
    position.isUp ? "UP" : "DOWN",
  ].join(":");
  const decision =
    group.decisions.get(key) ?? {
      cost: 0,
      payout: 0,
      quantity: 0,
      resolvedAtMs: 0,
      count: 0,
    };

  decision.cost += resolved.cost;
  decision.payout += resolved.payout;
  decision.quantity += resolved.quantity;
  decision.resolvedAtMs = Math.max(decision.resolvedAtMs, resolved.resolvedAtMs);
  decision.count += 1;
  group.decisions.set(key, decision);
}

function resolveTraderHeatPosition(
  position: PredictPositionSummary,
): TraderHeatResolvedPosition | null {
  if (position.status === "closed") {
    return {
      cost: position.cost,
      payout: position.payout,
      quantity: traderHeatPositionQuantity(position),
      resolvedAtMs: position.lastEventMs,
    };
  }

  const redeemedCost = redeemedCostBasis(position);
  if (redeemedCost <= 0 && position.payout <= 0) {
    return null;
  }

  return {
    cost: redeemedCost,
    payout: position.payout,
    quantity: Math.max(
      1,
      Math.min(
        position.redeemedQuantity,
        position.mintedQuantity || position.redeemedQuantity,
      ),
    ),
    resolvedAtMs: position.lastEventMs,
  };
}

function traderHeatPositionQuantity(position: PredictPositionSummary): number {
  return Math.max(
    position.mintedQuantity,
    position.redeemedQuantity,
    position.payout,
    1,
  );
}

function projectTraderHeatDecision(
  decision: TraderHeatDecisionAccumulator,
  nowMs: number,
): TraderHeatDecision {
  const pnl = decision.payout - decision.cost;
  const impliedProbability = clampRatio(decision.cost / decision.quantity, 0.02, 0.98);
  const result: WalletStreakType =
    pnl > 0 ? "win" : pnl < 0 ? "loss" : "none";
  const outcome = result === "win" ? 1 : result === "loss" ? 0 : impliedProbability;
  const roi = clampScore(pnl / decision.cost, -1, 5);

  return {
    ...decision,
    pnl,
    impliedProbability,
    outcome,
    roi,
    weight: traderHeatDecisionWeight(decision, nowMs),
    result,
  };
}

function traderHeatDecisionWeight(
  decision: TraderHeatDecisionAccumulator,
  nowMs: number,
): number {
  const ageDays = Math.max(
    0,
    (nowMs - decision.resolvedAtMs) / ONE_DAY_MS,
  );
  const timeDecay = 2 ** (-ageDays / 7);
  const costUsd = decision.cost / 1_000_000;
  const logWeight = Math.log1p(costUsd) / Math.log1p(25);
  const meaningfulSmallStakeFloor =
    costUsd >= 1 ? 0.45 : costUsd >= 0.25 ? 0.25 : costUsd * 0.25;
  const stakeWeight = Math.min(
    1.5,
    Math.max(meaningfulSmallStakeFloor, logWeight),
  );

  return timeDecay * stakeWeight;
}

function traderHeatCurrentStreak(decisions: TraderHeatDecision[]): {
  currentStreakType: WalletStreakType;
  currentStreakLength: number;
} {
  let currentStreakType: WalletStreakType = "none";
  let currentStreakLength = 0;

  for (const decision of decisions) {
    if (decision.result === "none") {
      currentStreakType = "none";
      currentStreakLength = 0;
      continue;
    }

    if (decision.result === currentStreakType) {
      currentStreakLength += 1;
    } else {
      currentStreakType = decision.result;
      currentStreakLength = 1;
    }
  }

  return { currentStreakType, currentStreakLength };
}

function calibrateHeatScore(skillScore: number): number {
  return clampScore(
    Math.round(100 / (1 + Math.exp(-(skillScore - 28) / 9))),
    0,
    99,
  );
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
    decisions: new Map<string, TraderHeatDecisionAccumulator>(),
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

function compareTraderHeatDecisionsOldestFirst(
  left: TraderHeatDecision,
  right: TraderHeatDecision,
): number {
  return left.resolvedAtMs - right.resolvedAtMs || left.pnl - right.pnl;
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

function wilsonLowerBound(wins: number, count: number, z = 1.28): number {
  if (count <= 0) {
    return 0;
  }

  const phat = wins / count;
  const zSquared = z * z;

  return (
    phat +
    zSquared / (2 * count) -
    z * Math.sqrt((phat * (1 - phat) + zSquared / (4 * count)) / count)
  ) / (1 + zSquared / count);
}

function clampRatio(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, value));
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

function compareResolvedPositionsOldestFirst(
  left: WalletResolvedPosition,
  right: WalletResolvedPosition,
): number {
  return left.resolvedAtMs - right.resolvedAtMs || left.pnl - right.pnl;
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

function didPositionWin({
  isUp,
  settlementPrice,
  strike,
}: {
  isUp: boolean;
  settlementPrice: number;
  strike: number;
}): boolean {
  const normalizedSettlementPrice = normalizePredictPrice(settlementPrice);
  const normalizedStrike = normalizeStrike(strike);

  return isUp
    ? normalizedSettlementPrice > normalizedStrike
    : normalizedSettlementPrice <= normalizedStrike;
}

function normalizeStrike(value: number): number {
  if (value >= 1_000_000_000_000) {
    return Math.round(value / 1_000_000_000);
  }

  if (value >= 1_000_000_000) {
    return Math.round(value / 1_000_000);
  }

  return Math.round(value);
}

function normalizePredictPrice(value: number): number {
  if (value >= 1_000_000_000_000) {
    return value / 1_000_000_000;
  }

  if (value >= 1_000_000_000) {
    return value / 1_000_000;
  }

  return value;
}

function normalizeEpochMs(value: number): number {
  return value < 10_000_000_000 ? value * 1_000 : value;
}
