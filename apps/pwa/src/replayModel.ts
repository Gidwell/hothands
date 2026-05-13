import {
  COPY_AMOUNT_DEFAULT,
  createInitialCopyState,
  formatCopyAmount,
  getSelectedTrader,
  type CopyMarket,
  type CopyTableState,
} from "./copyModel";
import type { Trader } from "./mockData";

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
  dice: [string, string];
  puck: string;
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

const replayDice: Record<ReplayPhase, [string, string]> = {
  "copy-armed": ["3", "5"],
  "signal-landed": ["4", "4"],
  "copy-executed": ["6", "2"],
  settled: ["5", "3"],
  "hot-hand-updated": ["6", "6"],
};

const phaseStatus: Record<ReplayPhase, ReplayFrame["status"]> = {
  "copy-armed": "Copy armed",
  "signal-landed": "Leader signal landed",
  "copy-executed": "Copy executed",
  settled: "Settlement posted",
  "hot-hand-updated": "Hot hand updated",
};

export function createInitialReplayState(traders: Trader[]): ReplayState {
  return {
    copy: createInitialCopyState(traders),
    step: 0,
    isPlaying: true,
    completedLoops: 0,
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

export function advanceReplay(state: ReplayState): ReplayState {
  const nextStep = (state.step + 1) % REPLAY_PHASES.length;

  return {
    ...state,
    step: nextStep,
    completedLoops:
      nextStep === 0 ? state.completedLoops + 1 : state.completedLoops,
  };
}

export function getReplayPhase(state: ReplayState): ReplayPhase {
  return REPLAY_PHASES[state.step] ?? "copy-armed";
}

export function getReplayTraders(state: ReplayState, traders: Trader[]): Trader[] {
  const phase = getReplayPhase(state);

  if (phase !== "hot-hand-updated" || !state.copy.isArmed) {
    return traders;
  }

  const selectedTraderId = state.copy.selectedTraderId;
  const replayTraders = traders.map((trader) => {
    if (trader.id !== selectedTraderId) {
      return trader;
    }

    return {
      ...trader,
      streak: trader.streak + 1,
      hotScore: 99,
      copied: trader.copied + getCopiedDelta(state.copy.copyAmount),
    };
  });

  return replayTraders.sort((first, second) => {
    const scoreDelta = second.hotScore - first.hotScore;

    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    if (first.id === selectedTraderId) {
      return -1;
    }

    if (second.id === selectedTraderId) {
      return 1;
    }

    return 0;
  });
}

export function getReplayFrame(
  state: ReplayState,
  traders: Trader[],
  market: CopyMarket,
): ReplayFrame {
  const phase = getReplayPhase(state);
  const selectedTrader = getSelectedTrader(state.copy, traders);
  const replayLeader = getSelectedTrader(state.copy, getReplayTraders(state, traders));
  const amount = formatCopyAmount(state.copy.copyAmount);
  const pnl = formatPnl(getSettlementPnl(state.copy.copyAmount));
  const isCopied = state.copy.isArmed && phaseIndex(phase) >= phaseIndex("copy-executed");
  const isSettled = state.copy.isArmed && phaseIndex(phase) >= phaseIndex("settled");
  const isUpdated = state.copy.isArmed && phase === "hot-hand-updated";
  const receiptState = getReceiptState(state.copy, isCopied);

  return {
    phase,
    stepLabel: `${state.step + 1}/${REPLAY_PHASES.length}`,
    status: phaseStatus[phase],
    tableCall: getTableCall(phase, selectedTrader.name, amount, pnl, state.copy.isArmed),
    latestSignal: getLatestSignal(phase, selectedTrader),
    dice: replayDice[phase],
    puck: getPuckLabel(phase, state.copy.isArmed),
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
      leader: replayLeader.name,
      hotScore: isUpdated ? replayLeader.hotScore : selectedTrader.hotScore,
      streak: isUpdated ? replayLeader.streak : selectedTrader.streak,
      copied: isUpdated ? replayLeader.copied : selectedTrader.copied,
    },
    activity: getActivity(phase, selectedTrader.name, amount, pnl, state.copy.isArmed),
  };
}

function phaseIndex(phase: ReplayPhase): number {
  return REPLAY_PHASES.indexOf(phase);
}

function getCopiedDelta(amount: number): number {
  return Math.max(1, Math.round(amount / 11));
}

function getSettlementPnl(amount: number): number {
  const safeAmount = Number.isFinite(amount) ? amount : COPY_AMOUNT_DEFAULT;

  return Math.round(safeAmount * 0.128);
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
    return `${leader} is live on ${pair}, but the copy rail is paused.`;
  }

  if (phase === "copy-armed") {
    return `${leader} on ${pair}, up to ${amount} when the next signal lands.`;
  }

  if (phase === "signal-landed") {
    return `${leader}'s signal landed. Copy ticket is moving up to ${amount}.`;
  }

  if (phase === "copy-executed") {
    return `${amount} copied from ${leader}. Waiting on the fake settlement.`;
  }

  if (phase === "settled") {
    return `${amount} filled for ${pnl}; table score is posting next.`;
  }

  return `${leader} gets the hot hand bump after a ${pnl} copy settlement.`;
}

function getTableCall(
  phase: ReplayPhase,
  leader: string,
  amount: string,
  pnl: string,
  isArmed: boolean,
): string {
  if (!isArmed) {
    return "Copy rail paused";
  }

  if (phase === "copy-armed") {
    return `${amount} behind ${leader}`;
  }

  if (phase === "signal-landed") {
    return `${leader} signal on the felt`;
  }

  if (phase === "copy-executed") {
    return `${amount} copied to the ticket`;
  }

  if (phase === "settled") {
    return `Settlement pays ${pnl}`;
  }

  return `${leader} takes the hot hand`;
}

function getLatestSignal(phase: ReplayPhase, trader: Trader): string {
  if (phase === "copy-armed") {
    return `${trader.name} is set for ${trader.signal}`;
  }

  return `${trader.name} fired ${trader.signal}`;
}

function getPuckLabel(phase: ReplayPhase, isArmed: boolean): string {
  if (!isArmed) {
    return "OFF";
  }

  if (phase === "copy-armed") {
    return "ON";
  }

  if (phase === "signal-landed") {
    return "SIG";
  }

  if (phase === "copy-executed") {
    return "COPY";
  }

  if (phase === "settled") {
    return "PAID";
  }

  return "HOT";
}

function getActivity(
  phase: ReplayPhase,
  leader: string,
  amount: string,
  pnl: string,
  isArmed: boolean,
): string[] {
  if (!isArmed) {
    return [`${leader} live`, "Copy paused", "No ticket sent"];
  }

  if (phase === "copy-armed") {
    return [`${leader} selected`, `${amount} max copy`, "Copy armed"];
  }

  if (phase === "signal-landed") {
    return [`${leader} signal lands`, "Copy trigger live", `${amount} reserved`];
  }

  if (phase === "copy-executed") {
    return [`${amount} copied`, `${leader} receipt open`, "Awaiting fill"];
  }

  if (phase === "settled") {
    return ["Fake settlement filled", `${pnl} result`, "Score pending"];
  }

  return [`${leader} hot hand`, "Leaderboard bumped", `${pnl} banked`];
}
