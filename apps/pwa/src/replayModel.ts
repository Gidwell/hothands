import {
  createInitialCopyState,
  formatCopyAmount,
  getSelectedTrader,
  type CopyMarket,
  type CopyTableState,
} from "./copyModel";
import type { Spectator, Trader } from "./mockData";
import { produceReplayFramesById } from "@hot-hands/demo-runner";
import type {
  DemoReplayFrame,
  ReplayLeader,
  ReplaySignal,
} from "@hot-hands/shared";
import { getScenario, type ScenarioId } from "@hot-hands/fixtures";

export const REPLAY_SCENARIOS = [
  { id: "opening-night", title: "Opening Night" },
  { id: "trap-streak", title: "Trap Streak" },
  { id: "hot-hand-swing", title: "Hot Hand Swing" },
] as const satisfies Array<{ id: ScenarioId; title: string }>;

export type ReplayScenarioId = (typeof REPLAY_SCENARIOS)[number]["id"];

export const REPLAY_PHASES = [
  "copy-armed",
  "signal-landed",
  "copy-executed",
  "settled",
  "hot-hand-updated",
] as const;

export type ReplayPhase = (typeof REPLAY_PHASES)[number];

export type ReplayState = {
  copy: CopyTableState;
  step: number;
  isPlaying: boolean;
  completedLoops: number;
};

export type ReplaySettlement = {
  amount: string;
  pnl: string;
  status: "Filled" | "Paused";
};

export type ReplayCopyReceipt = {
  leader: string;
  market: string;
  amount: string;
  label: "Copy next signal" | "Copied receipt";
  state: "Armed" | "Copied" | "Disarmed";
  settlement: string;
  summary: string;
};

export type ReplayFrame = {
  phase: ReplayPhase;
  stepLabel: string;
  status:
    | "Copy armed"
    | "Leader signal landed"
    | "Copy executed"
    | "Settlement posted"
    | "Hot hand updated";
  tableCall: string;
  latestSignal: string;
  signalBadges: [string, string];
  phaseBadge: string;
  copyReceipt: ReplayCopyReceipt;
  settlement: ReplaySettlement;
  hotHand: {
    leader: string;
    hotScore: number;
    streak: number;
    copied: number;
  };
  activity: string[];
};

export type ReplayScenarioFrame = {
  phase: ReplayPhase;
  source: DemoReplayFrame;
};

export type ReplayScenario = {
  id: ReplayScenarioId;
  title: string;
  market: string;
  traders: Trader[];
  spectators: Spectator[];
  frames: ReplayScenarioFrame[];
};

const replaySignalBadges: Record<ReplayPhase, [string, string]> = {
  "copy-armed": ["BTC", "ARMED"],
  "signal-landed": ["SIGNAL", "LIVE"],
  "copy-executed": ["COPY", "SENT"],
  settled: ["SETTLE", "FILLED"],
  "hot-hand-updated": ["BOARD", "HOT"],
};

const phaseStatus: Record<ReplayPhase, ReplayFrame["status"]> = {
  "copy-armed": "Copy armed",
  "signal-landed": "Leader signal landed",
  "copy-executed": "Copy executed",
  settled: "Settlement posted",
  "hot-hand-updated": "Hot hand updated",
};

const toneCycle: Trader["tone"][] = ["gold", "green", "blue"];
const spectatorColors = ["#f4b64f", "#62d68f", "#6aa9ff", "#ef7d72", "#b98cff", "#64d4d1"];

export function createReplayScenario(scenarioId: ReplayScenarioId): ReplayScenario {
  const scenario = getScenario(scenarioId);
  const sharedFrames = produceReplayFramesById(scenarioId);
  const frames = pickVerticalSliceFrames(sharedFrames);

  return {
    id: scenarioId,
    title: scenario.title,
    market: scenario.market,
    traders: scenario.traders.map((trader, index) =>
      traderFromSharedLeader(
        {
          traderId: trader.traderId,
          handle: trader.handle,
          displayName: trader.displayName,
          rank: index + 1,
          hotScore: 0,
          roi: 0,
          pnl: 0,
          hitRate: 0,
          resolvedCount: 0,
          winStreak: 0,
          copiedVolume: 0,
          freshnessScore: 0,
          label: "Warming",
        },
        index,
        firstSignalForLeader(sharedFrames, trader.traderId),
      ),
    ),
    spectators: scenario.spectators.map((spectator, index) => ({
      id: spectator.traderId,
      initials: initialsForName(spectator.displayName),
      color: spectatorColors[index % spectatorColors.length],
      mood: "watching",
    })),
    frames,
  };
}

export function createInitialReplayState(scenario: ReplayScenario): ReplayState {
  return {
    copy: createInitialCopyState(scenario.traders),
    step: 0,
    isPlaying: true,
    completedLoops: 0,
  };
}

export function selectReplayScenario(
  state: ReplayState,
  scenario: ReplayScenario,
): ReplayState {
  return {
    ...state,
    copy: createInitialCopyState(scenario.traders),
    step: 0,
    completedLoops: 0,
    isPlaying: false,
  };
}

export function updateReplayCopy(
  state: ReplayState,
  update: (copyState: CopyTableState) => CopyTableState,
): ReplayState {
  return {
    ...state,
    copy: update(state.copy),
  };
}

export function setReplayPlaying(state: ReplayState, isPlaying: boolean): ReplayState {
  return {
    ...state,
    isPlaying,
  };
}

export function resetReplay(state: ReplayState): ReplayState {
  return {
    ...state,
    step: 0,
    completedLoops: 0,
    isPlaying: false,
  };
}

export function advanceReplay(state: ReplayState, scenario: ReplayScenario): ReplayState {
  const nextStep = (state.step + 1) % scenario.frames.length;

  return {
    ...state,
    step: nextStep,
    completedLoops:
      nextStep === 0 ? state.completedLoops + 1 : state.completedLoops,
  };
}

export function getReplayPhase(state: ReplayState, scenario: ReplayScenario): ReplayPhase {
  return getScenarioFrame(state, scenario).phase;
}

export function getReplayTraders(
  state: ReplayState,
  scenario: ReplayScenario,
): Trader[] {
  const frame = getScenarioFrame(state, scenario);
  const leaders = frame.source.state.rankedLeaders;

  if (leaders.length === 0) {
    return scenario.traders;
  }

  return leaders.map((leader, index) =>
    traderFromSharedLeader(
      leader,
      index,
      latestSignalForLeader([frame.source], leader.traderId) ??
        latestSignalForLeader(scenario.frames.map(({ source }) => source), leader.traderId),
    ),
  );
}

export function getReplayFrame(
  state: ReplayState,
  scenario: ReplayScenario,
  market: CopyMarket,
): ReplayFrame {
  const scenarioFrame = getScenarioFrame(state, scenario);
  const phase = scenarioFrame.phase;
  const selectedTrader = getSelectedTrader(state.copy, scenario.traders);
  const replayTraders = getReplayTraders(state, scenario);
  const replayLeader = getSelectedTrader(state.copy, replayTraders);
  const hotLeader = replayTraders[0] ?? replayLeader;
  const stripTrader = phase === "hot-hand-updated" ? hotLeader : selectedTrader;
  const activeSignal =
    signalForLeader(scenarioFrame.source.state.activeSignals, stripTrader.id) ??
    signalForLeader(scenarioFrame.source.state.activeSignals, scenarioFrame.source.activity.leaderId) ??
    scenarioFrame.source.activity.signal ??
    latestSignalForLeader(scenario.frames.map(({ source }) => source), stripTrader.id);
  const amount = formatCopyAmount(state.copy.copyAmount);
  const pnl = formatPnl(getFramePnl(scenarioFrame.source));
  const isCopied = state.copy.isArmed && phaseIndex(phase) >= phaseIndex("copy-executed");
  const isSettled = state.copy.isArmed && phaseIndex(phase) >= phaseIndex("settled");
  const isUpdated = state.copy.isArmed && phase === "hot-hand-updated";
  const receiptState = getReceiptState(state.copy, isCopied);

  return {
    phase,
    stepLabel: `${state.step + 1}/${scenario.frames.length}`,
    status: phaseStatus[phase],
    tableCall: getTableCall(
      phase,
      stripTrader.name,
      stripTrader.signal,
      amount,
      pnl,
      state.copy.isArmed,
    ),
    latestSignal: getLatestSignal(phase, stripTrader, activeSignal),
    signalBadges: replaySignalBadges[phase],
    phaseBadge: getPhaseBadge(phase, state.copy.isArmed),
    copyReceipt: {
      leader: selectedTrader.name,
      market: market.pair,
      amount,
      label: isCopied ? "Copied receipt" : "Copy next signal",
      state: receiptState,
      settlement: getReceiptSettlement(phase, pnl, state.copy.isArmed),
      summary: getReceiptSummary(
        phase,
        selectedTrader.name,
        market.pair,
        amount,
        pnl,
        state.copy.isArmed,
      ),
    },
    settlement: {
      amount,
      pnl: isSettled ? pnl : "+$0",
      status: isSettled ? "Filled" : "Paused",
    },
    hotHand: {
      leader: hotLeader.name,
      hotScore: isUpdated ? hotLeader.hotScore : selectedTrader.hotScore,
      streak: isUpdated ? hotLeader.streak : selectedTrader.streak,
      copied: isUpdated ? hotLeader.copied : selectedTrader.copied,
    },
    activity: activityLabelsForFrame(scenarioFrame.source, selectedTrader.name, amount, pnl),
  };
}

function pickVerticalSliceFrames(sharedFrames: DemoReplayFrame[]): ReplayScenarioFrame[] {
  return REPLAY_PHASES.map((phase) => ({
    phase,
    source: frameForPhase(sharedFrames, phase),
  }));
}

function frameForPhase(sharedFrames: DemoReplayFrame[], phase: ReplayPhase): DemoReplayFrame {
  const byAction = (action: DemoReplayFrame["activity"]["action"]) =>
    sharedFrames.find((frame) => frame.activity.action === action);
  const lastByAction = (action: DemoReplayFrame["activity"]["action"]) =>
    [...sharedFrames].reverse().find((frame) => frame.activity.action === action);

  if (phase === "copy-armed") {
    return byAction("copy_armed") ?? byAction("spectator_joined") ?? sharedFrames[0];
  }

  if (phase === "signal-landed") {
    return byAction("signal_posted") ?? sharedFrames[0];
  }

  if (phase === "copy-executed") {
    return byAction("copy_executed") ?? byAction("signal_posted") ?? sharedFrames[0];
  }

  if (phase === "settled") {
    return byAction("signal_settled") ?? sharedFrames[sharedFrames.length - 1];
  }

  return byAction("score_updated") ?? lastByAction("snapshot_emitted") ?? sharedFrames[sharedFrames.length - 1];
}

function getScenarioFrame(state: ReplayState, scenario: ReplayScenario): ReplayScenarioFrame {
  return scenario.frames[state.step] ?? scenario.frames[0];
}

function phaseIndex(phase: ReplayPhase): number {
  return REPLAY_PHASES.indexOf(phase);
}

function latestSignalForLeader(
  frames: DemoReplayFrame[],
  leaderId?: string,
): ReplaySignal | undefined {
  if (!leaderId) {
    return undefined;
  }

  return [...frames]
    .reverse()
    .flatMap((frame) => [
      frame.activity.signal,
      ...frame.state.activeSignals,
    ])
    .find((signal) => signal?.leaderId === leaderId);
}

function firstSignalForLeader(
  frames: DemoReplayFrame[],
  leaderId?: string,
): ReplaySignal | undefined {
  if (!leaderId) {
    return undefined;
  }

  return frames
    .flatMap((frame) => [
      frame.activity.signal,
      ...frame.state.activeSignals,
    ])
    .find((signal) => signal?.leaderId === leaderId);
}

function signalForLeader(
  signals: ReplaySignal[],
  leaderId?: string,
): ReplaySignal | undefined {
  return leaderId ? signals.find((signal) => signal.leaderId === leaderId) : undefined;
}

function traderFromSharedLeader(
  leader: ReplayLeader,
  index: number,
  signal?: ReplaySignal,
): Trader {
  const displayName = leader.displayName;
  const signalText = signal ? formatSignal(signal) : "Waiting for BTC signal";

  return {
    id: leader.traderId,
    name: displayName,
    handle: `@${leader.handle}`,
    avatar: initialsForName(displayName),
    role: roleForSignal(signal),
    streak: leader.winStreak,
    hotScore: Math.round(leader.hotScore),
    roi: formatRoi(leader.roi),
    copied: leader.copiedVolume,
    signal: signalText,
    tableRead: signal?.thesis ?? `${leader.label} on ${signal?.market ?? "BTC-USD"}`,
    tone: toneCycle[index % toneCycle.length],
  };
}

function initialsForName(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function roleForSignal(signal?: ReplaySignal): string {
  if (!signal) {
    return "BTC signal lead";
  }

  return signal.direction === "up" ? "UP signal lead" : "DOWN signal lead";
}

function formatSignal(signal: ReplaySignal): string {
  return `BTC ${signal.direction.toUpperCase()} ${signal.direction === "up" ? "above" : "below"} ${
    formatPrice(signal.strike)
  }`;
}

function formatPrice(value: number): string {
  return `$${value.toLocaleString()}`;
}

function formatRoi(roi: number): string {
  const percent = Math.round(roi * 1000) / 10;

  return `${percent >= 0 ? "+" : ""}${percent}%`;
}

function getFramePnl(frame: DemoReplayFrame): number {
  if (frame.activity.settlement) {
    return frame.activity.settlement.pnl;
  }

  const latestSettlement = [...frame.state.rankedLeaders]
    .sort((first, second) => Math.abs(second.pnl) - Math.abs(first.pnl))[0]?.pnl;

  return latestSettlement ?? 0;
}

function formatPnl(amount: number): string {
  return amount >= 0 ? `+$${amount.toLocaleString()}` : `-$${Math.abs(amount).toLocaleString()}`;
}

function getReceiptState(copy: CopyTableState, isCopied: boolean): ReplayCopyReceipt["state"] {
  if (!copy.isArmed) {
    return "Disarmed";
  }

  return isCopied ? "Copied" : "Armed";
}

function getReceiptSettlement(
  phase: ReplayPhase,
  pnl: string,
  isArmed: boolean,
): string {
  if (!isArmed) {
    return "Paused";
  }

  if (phase === "copy-armed" || phase === "signal-landed") {
    return phase === "signal-landed" ? "Copy pending" : "Next signal";
  }

  if (phase === "copy-executed") {
    return "Awaiting fill";
  }

  return `Filled ${pnl}`;
}

function getReceiptSummary(
  phase: ReplayPhase,
  leader: string,
  pair: string,
  amount: string,
  pnl: string,
  isArmed: boolean,
): string {
  if (!isArmed) {
    return `${leader} is live on ${pair}, but copy is paused.`;
  }

  if (phase === "copy-armed") {
    return `${leader} on ${pair}, up to ${amount} when the next signal lands.`;
  }

  if (phase === "signal-landed") {
    return `${leader}'s signal landed. Copy ticket is moving up to ${amount}.`;
  }

  if (phase === "copy-executed") {
    return `${amount} copied from ${leader}. Waiting on settlement.`;
  }

  if (phase === "settled") {
    return `${amount} filled for ${pnl}; leaderboard score is posting next.`;
  }

  return `${leader} gets the hot hand bump after a ${pnl} copy settlement.`;
}

function getTableCall(
  phase: ReplayPhase,
  leader: string,
  signal: string,
  amount: string,
  pnl: string,
  isArmed: boolean,
): string {
  if (!isArmed) {
    return "Copy paused";
  }

  if (phase === "copy-armed") {
    return `${amount} copy max ready for ${leader}`;
  }

  if (phase === "signal-landed") {
    return `${leader} posted ${signal}`;
  }

  if (phase === "copy-executed") {
    return `${amount} copied to BTC ticket`;
  }

  if (phase === "settled") {
    return `Settlement posts ${pnl}`;
  }

  return `${leader} tops the leaderboard`;
}

function getLatestSignal(
  phase: ReplayPhase,
  trader: Trader,
  signal?: ReplaySignal,
): string {
  const signalText = signal ? formatSignal(signal) : trader.signal;

  if (phase === "copy-armed") {
    return `${trader.name} is tracking ${signalText}`;
  }

  return `${trader.name} posted ${signalText}`;
}

function getPhaseBadge(phase: ReplayPhase, isArmed: boolean): string {
  if (!isArmed) {
    return "PAUSED";
  }

  if (phase === "copy-armed") {
    return "ARM";
  }

  if (phase === "signal-landed") {
    return "LIVE";
  }

  if (phase === "copy-executed") {
    return "COPY";
  }

  if (phase === "settled") {
    return "SETTLE";
  }

  return "HOT";
}

function activityLabelsForFrame(
  frame: DemoReplayFrame,
  leader: string,
  amount: string,
  pnl: string,
): string[] {
  const labels = [
    frame.activity.label,
    `${frame.state.spectators.toLocaleString()} watching`,
    frame.state.armedFollowers > 0
      ? `${frame.state.armedFollowers.toLocaleString()} armed`
      : `${leader} selected`,
  ];

  if (frame.activity.action === "copy_executed") {
    labels[1] = `${amount} copied`;
  }

  if (frame.activity.action === "signal_settled") {
    labels[1] = `${pnl} result`;
  }

  if (frame.activity.action === "score_updated") {
    labels[1] = "Leaderboard bumped";
  }

  return labels;
}
