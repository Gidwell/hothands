export type Direction = "up" | "down";

export type SignalStatus =
  | "posted"
  | "copyable"
  | "expired"
  | "settled_win"
  | "settled_loss"
  | "voided";

export type StreakLabel =
  | "Cold"
  | "Warming"
  | "Heating Up"
  | "Hot Hand"
  | "On Fire"
  | "Trap Streak";

export interface Trader {
  traderId: string;
  handle: string;
  displayName: string;
  avatarUrl?: string;
}

export interface Signal {
  signalId: string;
  leaderId: string;
  oracleId: string;
  market: string;
  direction: Direction;
  strike: number;
  expiryMs: number;
  confidenceBps: number;
  createdAtMs: number;
  intendedCost: number;
  status: SignalStatus;
  thesis?: string;
}

export interface SignalSettlement {
  signalId: string;
  settledAtMs: number;
  settlementPrice: number;
  status: Extract<SignalStatus, "settled_win" | "settled_loss" | "voided">;
  pnl: number;
}

export interface CopyReceipt {
  receiptId: string;
  signalId: string;
  followerId: string;
  leaderId: string;
  copiedCost: number;
  createdAtMs: number;
}

export interface TraderScoreInput {
  traderId: string;
  resolvedSignals: Array<Signal & { settlement: SignalSettlement }>;
  copiedVolume: number;
  nowMs: number;
}

export interface TraderScore {
  traderId: string;
  hotScore: number;
  roi: number;
  pnl: number;
  hitRate: number;
  resolvedCount: number;
  winStreak: number;
  copiedVolume: number;
  freshnessScore: number;
  label: StreakLabel;
}

export interface TableSnapshot {
  tableId: string;
  oracleId: string;
  market: string;
  asOfMs: number;
  spectators: number;
  armedFollowers: number;
  activeSignals: Signal[];
  leaders: TraderScore[];
}

export type ReplayPhase =
  | "spectator"
  | "arming"
  | "signal"
  | "copy"
  | "settlement"
  | "score"
  | "snapshot";

export interface ReplayParticipant {
  traderId: string;
  handle: string;
  displayName: string;
  avatarUrl?: string;
}

export type ReplaySignal = Pick<
  Signal,
  | "signalId"
  | "leaderId"
  | "oracleId"
  | "market"
  | "direction"
  | "strike"
  | "expiryMs"
  | "confidenceBps"
  | "createdAtMs"
  | "status"
  | "thesis"
>;

export interface ReplayCopyActivity {
  receiptId: string;
  signalId: string;
  followerId: string;
  leaderId: string;
  copiedCost: number;
  cumulativeCopiedVolume: number;
}

export interface ReplaySettlementActivity {
  signalId: string;
  leaderId: string;
  status: SignalSettlement["status"];
  settlementPrice: number;
  pnl: number;
}

export interface ReplayActivity {
  action: ScenarioAction;
  label: string;
  actorId?: string;
  signalId?: string;
  receiptId?: string;
  leaderId?: string;
  followerId?: string;
  participant?: ReplayParticipant;
  signal?: ReplaySignal;
  copy?: ReplayCopyActivity;
  settlement?: ReplaySettlementActivity;
}

export interface ReplayLeader extends TraderScore {
  rank: number;
  handle: string;
  displayName: string;
  avatarUrl?: string;
}

export interface ReplayTableState {
  tableId: string;
  oracleId: string;
  market: string;
  asOfMs: number;
  spectators: number;
  armedFollowers: number;
  activeSignals: ReplaySignal[];
  rankedLeaders: ReplayLeader[];
  currentLeader?: ReplayLeader;
  previousLeader?: ReplayLeader;
  leaderChanged: boolean;
}

export interface DemoReplayFrame {
  sequence: number;
  atMs: number;
  tableId: string;
  phase: ReplayPhase;
  activity: ReplayActivity;
  state: ReplayTableState;
}

export type RealtimeActivitySource = "fixture_replay";

export type RealtimeActivityEvent =
  | "signal_landed"
  | "copy_submitted"
  | "copy_executed"
  | "settlement_posted"
  | "hot_hand_updated";

export interface RealtimeCopyActivity extends ReplayCopyActivity {
  status: "submitted" | "executed";
}

export interface RealtimeHotHandActivity {
  leaderChanged: boolean;
  currentLeaderId: string;
  previousLeaderId?: string;
  score: ReplayLeader;
}

export type RealtimeActivityPayload =
  | { signal: ReplaySignal }
  | { copy: RealtimeCopyActivity }
  | { settlement: ReplaySettlementActivity }
  | { hotHand: RealtimeHotHandActivity };

export interface RealtimeActivityTraceItem {
  type: "table_activity";
  source: RealtimeActivitySource;
  sequence: number;
  sourceSequence: number;
  atMs: number;
  tableId: string;
  event: RealtimeActivityEvent;
  label: string;
  actorId?: string;
  leaderId?: string;
  followerId?: string;
  signalId?: string;
  receiptId?: string;
  spectatorCount: number;
  armedCount: number;
  hotScore?: number;
  payload: RealtimeActivityPayload;
}

export type ScenarioAction =
  | "spectator_joined"
  | "copy_armed"
  | "signal_posted"
  | "copy_executed"
  | "signal_settled"
  | "score_updated"
  | "snapshot_emitted";

export interface ScenarioStep {
  atMs: number;
  action: ScenarioAction;
  actorId?: string;
  signalId?: string;
  receiptId?: string;
  settlementPrice?: number;
}

export interface DemoScenario {
  scenarioId: string;
  title: string;
  tableId: string;
  oracleId: string;
  market: string;
  startsAtMs: number;
  traders: Trader[];
  spectators: Trader[];
  signals: Signal[];
  copyReceipts: CopyReceipt[];
  steps: ScenarioStep[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function settleSignal(
  signal: Signal,
  settlementPrice: number,
  settledAtMs: number,
): Signal & { settlement: SignalSettlement } {
  if (signal.status === "voided") {
    return {
      ...signal,
      settlement: {
        signalId: signal.signalId,
        settledAtMs,
        settlementPrice,
        status: "voided",
        pnl: 0,
      },
    };
  }

  const won =
    signal.direction === "up"
      ? settlementPrice > signal.strike
      : settlementPrice <= signal.strike;
  const status = won ? "settled_win" : "settled_loss";
  const pnl = won ? signal.intendedCost : -signal.intendedCost;

  return {
    ...signal,
    status,
    settlement: {
      signalId: signal.signalId,
      settledAtMs,
      settlementPrice,
      status,
      pnl,
    },
  };
}

export function calculateRoi(pnl: number, cost: number): number {
  if (cost <= 0) return 0;
  return pnl / cost;
}

export function currentWinStreak(
  resolvedSignals: Array<Signal & { settlement: SignalSettlement }>,
): number {
  return [...resolvedSignals]
    .sort((a, b) => b.settlement.settledAtMs - a.settlement.settledAtMs)
    .reduce((streak, signal) => {
      if (streak.done) return streak;
      if (signal.settlement.status === "settled_win") {
        return { count: streak.count + 1, done: false };
      }
      return { count: streak.count, done: true };
    }, { count: 0, done: false }).count;
}

export function labelStreak(score: {
  winStreak: number;
  roi: number;
  hitRate: number;
  copiedVolume: number;
}): StreakLabel {
  if (score.hitRate >= 0.7 && score.roi < 0) return "Trap Streak";
  if (score.winStreak >= 5 && score.roi > 0 && score.copiedVolume > 0) {
    return "On Fire";
  }
  if (score.winStreak >= 4 && score.roi > 0) return "Hot Hand";
  if (score.winStreak >= 2) return "Heating Up";
  if (score.winStreak === 1) return "Warming";
  return "Cold";
}

export function scoreTrader(input: TraderScoreInput): TraderScore {
  const resolved = input.resolvedSignals.filter((signal) =>
    signal.settlement.status === "settled_win" ||
    signal.settlement.status === "settled_loss"
  );
  const wins = resolved.filter((signal) =>
    signal.settlement.status === "settled_win"
  ).length;
  const pnl = resolved.reduce((sum, signal) => sum + signal.settlement.pnl, 0);
  const totalCost = resolved.reduce((sum, signal) => sum + signal.intendedCost, 0);
  const roi = calculateRoi(pnl, totalCost);
  const hitRate = resolved.length > 0 ? wins / resolved.length : 0;
  const winStreak = currentWinStreak(resolved);
  const newestSettlement = resolved.reduce(
    (newest, signal) => Math.max(newest, signal.settlement.settledAtMs),
    0,
  );
  const freshnessScore = newestSettlement === 0
    ? 0
    : clamp01(1 - (input.nowMs - newestSettlement) / DAY_MS);

  const streakScore = clamp01(winStreak / 5);
  const recentRoiScore = clamp01((clamp(roi, -1, 1) + 1) / 2);
  const recentPnlScore = clamp01((clamp(pnl / 100, -1, 1) + 1) / 2);
  const hitRateScore = hitRate;
  const copiedVolumeScore = clamp01(input.copiedVolume / 500);
  const samplePenalty = resolved.length < 3 ? (3 - resolved.length) * 0.05 : 0;

  const hotScore = clamp(
    100 *
      (
        0.3 * streakScore +
        0.25 * recentRoiScore +
        0.2 * recentPnlScore +
        0.1 * hitRateScore +
        0.1 * copiedVolumeScore +
        0.05 * freshnessScore
      ) -
      100 * samplePenalty,
    0,
    100,
  );

  const score = {
    traderId: input.traderId,
    hotScore: round2(hotScore),
    roi: round4(roi),
    pnl: round2(pnl),
    hitRate: round4(hitRate),
    resolvedCount: resolved.length,
    winStreak,
    copiedVolume: input.copiedVolume,
    freshnessScore: round4(freshnessScore),
    label: "Cold" as StreakLabel,
  };

  return {
    ...score,
    label: labelStreak(score),
  };
}

export function buildTableSnapshot(input: {
  tableId: string;
  oracleId: string;
  market: string;
  asOfMs: number;
  spectators: number;
  armedFollowers: number;
  activeSignals: Signal[];
  leaders: TraderScore[];
}): TableSnapshot {
  return {
    ...input,
    leaders: rankTraderScores(input.leaders),
  };
}

export function rankTraderScores(leaders: TraderScore[]): TraderScore[] {
  return [...leaders].sort(compareTraderScores);
}

function compareTraderScores(a: TraderScore, b: TraderScore): number {
  return compareDesc(a.hotScore, b.hotScore) ||
    compareDesc(a.roi, b.roi) ||
    compareDesc(a.copiedVolume, b.copiedVolume) ||
    compareDesc(a.pnl, b.pnl) ||
    compareDesc(a.hitRate, b.hitRate) ||
    compareDesc(a.resolvedCount, b.resolvedCount) ||
    compareAsc(a.traderId, b.traderId);
}

function compareDesc(a: number, b: number): number {
  return b - a;
}

function compareAsc(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
