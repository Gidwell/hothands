import type {
  RealtimeActivityEvent,
  RealtimeActivitySource,
  RealtimeActivityTraceItem,
  SignalStatus,
} from "@hot-hands/shared";

export type RealtimeHandStatus = RealtimeActivityEvent | "idle";

export type RealtimeActivitySummary = {
  event: RealtimeActivityEvent;
  label: string;
  source: RealtimeActivitySource;
  sequence: number;
  atMs: number;
};

export type RealtimeSignalSummary = {
  signalId: string;
  leaderId: string;
  market: string;
  direction: "up" | "down";
  strike: number;
  status: SignalStatus;
  label: string;
  source: RealtimeActivitySource;
};

export type RealtimeCopyConfirmation = {
  signalId: string;
  leaderId: string;
  market: string;
  source: RealtimeActivitySource;
};

export type RealtimeCopySummary = {
  receiptId: string;
  signalId: string;
  leaderId: string;
  followerId: string;
  copiedCost: number;
  cumulativeCopiedVolume: number;
  status: "submitted" | "executed";
  source: RealtimeActivitySource;
};

export type RealtimeSettlementSummary = {
  signalId: string;
  leaderId: string;
  pnl: number;
  status: "settled_win" | "settled_loss" | "voided";
  source: RealtimeActivitySource;
};

export type RealtimeHotScoreUpdate = {
  leaderId: string;
  leaderName: string;
  hotScore: number;
  leaderChanged: boolean;
  source: RealtimeActivitySource;
};

export type RealtimeActivityState = {
  source?: RealtimeActivitySource;
  handStatus: RealtimeHandStatus;
  isAutoplaying: false;
  isAutoArmed: false;
  latestActivity: RealtimeActivitySummary | null;
  activeSignal: RealtimeSignalSummary | null;
  openCopyConfirmations: RealtimeCopyConfirmation[];
  copy: RealtimeCopySummary | null;
  settlement: RealtimeSettlementSummary | null;
  hotScoreUpdates: RealtimeHotScoreUpdate[];
};

export function createInitialRealtimeActivityState(): RealtimeActivityState {
  return {
    handStatus: "idle",
    isAutoplaying: false,
    isAutoArmed: false,
    latestActivity: null,
    activeSignal: null,
    openCopyConfirmations: [],
    copy: null,
    settlement: null,
    hotScoreUpdates: [],
  };
}

export function applyRealtimeActivityTrace(
  state: RealtimeActivityState,
  items: RealtimeActivityTraceItem[],
): RealtimeActivityState {
  return items.reduce(applyRealtimeActivityItem, state);
}

export function applyRealtimeActivityItem(
  state: RealtimeActivityState,
  item: RealtimeActivityTraceItem,
): RealtimeActivityState {
  const nextState: RealtimeActivityState = {
    ...state,
    source: item.source,
    handStatus: item.event,
    latestActivity: {
      event: item.event,
      label: item.label,
      source: item.source,
      sequence: item.sequence,
      atMs: item.atMs,
    },
  };

  if ("signal" in item.payload) {
    const { signal } = item.payload;

    return {
      ...nextState,
      activeSignal: {
        signalId: signal.signalId,
        leaderId: signal.leaderId,
        market: signal.market,
        direction: signal.direction,
        strike: signal.strike,
        status: signal.status,
        label: item.label,
        source: item.source,
      },
      openCopyConfirmations: upsertCopyConfirmation(
        nextState.openCopyConfirmations,
        {
          signalId: signal.signalId,
          leaderId: signal.leaderId,
          market: signal.market,
          source: item.source,
        },
      ),
    };
  }

  if ("copy" in item.payload) {
    const { copy } = item.payload;

    return {
      ...nextState,
      copy: {
        receiptId: copy.receiptId,
        signalId: copy.signalId,
        leaderId: copy.leaderId,
        followerId: copy.followerId,
        copiedCost: copy.copiedCost,
        cumulativeCopiedVolume: copy.cumulativeCopiedVolume,
        status: copy.status,
        source: item.source,
      },
      openCopyConfirmations: nextState.openCopyConfirmations.filter(
        (confirmation) => confirmation.signalId !== copy.signalId,
      ),
    };
  }

  if ("settlement" in item.payload) {
    const { settlement } = item.payload;

    return {
      ...nextState,
      settlement: {
        signalId: settlement.signalId,
        leaderId: settlement.leaderId,
        pnl: settlement.pnl,
        status: settlement.status,
        source: item.source,
      },
      openCopyConfirmations: nextState.openCopyConfirmations.filter(
        (confirmation) => confirmation.signalId !== settlement.signalId,
      ),
    };
  }

  const { hotHand } = item.payload;

  return {
    ...nextState,
    hotScoreUpdates: [
      ...nextState.hotScoreUpdates,
      {
        leaderId: hotHand.currentLeaderId,
        leaderName: hotHand.score.displayName,
        hotScore: Math.round(hotHand.score.hotScore),
        leaderChanged: hotHand.leaderChanged,
        source: item.source,
      },
    ],
  };
}

function upsertCopyConfirmation(
  confirmations: RealtimeCopyConfirmation[],
  confirmation: RealtimeCopyConfirmation,
): RealtimeCopyConfirmation[] {
  const remaining = confirmations.filter(
    (existing) => existing.signalId !== confirmation.signalId,
  );

  return [...remaining, confirmation];
}
