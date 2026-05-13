import { getScenario } from "../../fixtures/src/index";
import {
  buildTableSnapshot,
  scoreTrader,
  settleSignal,
  type CopyReceipt,
  type DemoReplayFrame,
  type DemoScenario,
  type ReplayActivity,
  type ReplayLeader,
  type ReplayParticipant,
  type ReplayPhase,
  type ReplaySignal,
  type ScenarioAction,
  type Signal,
  type SignalSettlement,
  type TableSnapshot,
  type Trader,
  type TraderScore,
} from "../../shared/src/index";

export type TracePayload =
  | { spectatorCount: number }
  | { armedFollowers: number }
  | { signal: Signal }
  | { copyReceipt: CopyReceipt; copiedVolume: number }
  | { signal: Signal & { settlement: SignalSettlement } }
  | {
    score: TraderScore;
    snapshot: TableSnapshot;
    leaderId?: string;
    previousLeaderId?: string;
    leaderChanged: boolean;
  }
  | { snapshot: TableSnapshot };

export interface TraceEvent {
  sequence: number;
  atMs: number;
  action: ScenarioAction;
  tableId: string;
  actorId?: string;
  signalId?: string;
  payload: TracePayload;
}

interface RunnerState {
  spectators: Set<string>;
  armedFollowers: Set<string>;
  activeSignals: Map<string, Signal>;
  resolvedSignals: Map<string, Array<Signal & { settlement: SignalSettlement }>>;
  copiedVolumeByLeader: Map<string, number>;
  lastLeaderId?: string;
}

interface ReplayFrameState {
  spectators: number;
  armedFollowers: number;
  activeSignals: Map<string, ReplaySignal>;
  rankedLeaders: ReplayLeader[];
}

export function loadScenario(scenarioId: string): DemoScenario {
  return getScenario(scenarioId);
}

export function produceTrace(scenario: DemoScenario): TraceEvent[] {
  const state: RunnerState = {
    spectators: new Set(),
    armedFollowers: new Set(),
    activeSignals: new Map(),
    resolvedSignals: new Map(),
    copiedVolumeByLeader: new Map(),
    lastLeaderId: undefined,
  };
  const signalsById = new Map(
    scenario.signals.map((signal) => [signal.signalId, signal]),
  );
  const receiptsById = new Map(
    scenario.copyReceipts.map((receipt) => [receipt.receiptId, receipt]),
  );

  return [...scenario.steps]
    .sort((a, b) => a.atMs - b.atMs)
    .map((step, sequence): TraceEvent => {
      switch (step.action) {
        case "spectator_joined": {
          const actorId = requireActor(step.actorId, step.action);
          state.spectators.add(actorId);
          return event(scenario, step, sequence, {
            spectatorCount: state.spectators.size,
          });
        }

        case "copy_armed": {
          const actorId = requireActor(step.actorId, step.action);
          state.armedFollowers.add(actorId);
          return event(scenario, step, sequence, {
            armedFollowers: state.armedFollowers.size,
          });
        }

        case "signal_posted": {
          const signal = requireSignal(signalsById, step.signalId, step.action);
          state.activeSignals.set(signal.signalId, signal);
          return event(scenario, step, sequence, { signal });
        }

        case "copy_executed": {
          const receipt = requireReceipt(receiptsById, step.receiptId, step.action);
          const previous = state.copiedVolumeByLeader.get(receipt.leaderId) ?? 0;
          const copiedVolume = previous + receipt.copiedCost;
          state.copiedVolumeByLeader.set(receipt.leaderId, copiedVolume);
          return event(scenario, step, sequence, {
            copyReceipt: receipt,
            copiedVolume,
          });
        }

        case "signal_settled": {
          const signal = requireSignal(signalsById, step.signalId, step.action);
          if (step.settlementPrice === undefined) {
            throw new Error(`Step "${step.action}" requires settlementPrice`);
          }
          const settled = settleSignal(signal, step.settlementPrice, step.atMs);
          state.activeSignals.delete(signal.signalId);
          const traderSignals = state.resolvedSignals.get(signal.leaderId) ?? [];
          traderSignals.push(settled);
          state.resolvedSignals.set(signal.leaderId, traderSignals);
          return event(scenario, step, sequence, { signal: settled });
        }

        case "score_updated": {
          const actorId = requireActor(step.actorId, step.action);
          const score = scoreForLeader(state, actorId, step.atMs);
          const snapshot = snapshotForState(scenario, state, step.atMs);
          const leaderId = snapshot.leaders[0]?.traderId;
          const previousLeaderId = state.lastLeaderId;
          const leaderChanged = previousLeaderId !== undefined &&
            leaderId !== undefined &&
            previousLeaderId !== leaderId;

          state.lastLeaderId = leaderId;

          return event(scenario, step, sequence, {
            score,
            snapshot,
            leaderId,
            previousLeaderId,
            leaderChanged,
          });
        }

        case "snapshot_emitted": {
          const snapshot = snapshotForState(scenario, state, step.atMs);
          state.lastLeaderId = snapshot.leaders[0]?.traderId ?? state.lastLeaderId;
          return event(scenario, step, sequence, { snapshot });
        }
      }
    });
}

export function produceTraceById(scenarioId: string): TraceEvent[] {
  return produceTrace(loadScenario(scenarioId));
}

export function produceReplayFrames(scenario: DemoScenario): DemoReplayFrame[] {
  const participantsById = participantMap(scenario);
  const state: ReplayFrameState = {
    spectators: 0,
    armedFollowers: 0,
    activeSignals: new Map(),
    rankedLeaders: initialRankedLeaders(scenario, participantsById),
  };

  return produceTrace(scenario).map((traceEvent): DemoReplayFrame => {
    const activity = activityForEvent(traceEvent, participantsById);
    const snapshot = applyReplayStateEvent(state, traceEvent);
    let leaderChanged = false;
    let previousLeader: ReplayLeader | undefined;

    if (snapshot) {
      const previousLeaderId = state.rankedLeaders[0]?.traderId;
      const nextLeaders = replayLeaders(snapshot.leaders, participantsById);
      const currentLeaderId = nextLeaders[0]?.traderId;
      const payloadLeaderChanged = "leaderChanged" in traceEvent.payload
        ? traceEvent.payload.leaderChanged
        : undefined;
      const explicitPreviousLeaderId = "previousLeaderId" in traceEvent.payload
        ? traceEvent.payload.previousLeaderId
        : previousLeaderId;

      leaderChanged = payloadLeaderChanged ??
        (previousLeaderId !== undefined &&
          currentLeaderId !== undefined &&
          previousLeaderId !== currentLeaderId);
      previousLeader = leaderChanged && explicitPreviousLeaderId
        ? state.rankedLeaders.find((leader) =>
          leader.traderId === explicitPreviousLeaderId
        )
        : undefined;
      state.rankedLeaders = nextLeaders;
    }

    return replayFrame(traceEvent, scenario, state, activity, leaderChanged, previousLeader);
  });
}

export function produceReplayFramesById(scenarioId: string): DemoReplayFrame[] {
  return produceReplayFrames(loadScenario(scenarioId));
}

function scoreForLeader(
  state: RunnerState,
  traderId: string,
  nowMs: number,
): TraderScore {
  return scoreTrader({
    traderId,
    resolvedSignals: state.resolvedSignals.get(traderId) ?? [],
    copiedVolume: state.copiedVolumeByLeader.get(traderId) ?? 0,
    nowMs,
  });
}

function snapshotForState(
  scenario: DemoScenario,
  state: RunnerState,
  nowMs: number,
): TableSnapshot {
  const leaders = scenario.traders.map((trader) =>
    scoreForLeader(state, trader.traderId, nowMs)
  );

  return buildTableSnapshot({
    tableId: scenario.tableId,
    oracleId: scenario.oracleId,
    market: scenario.market,
    asOfMs: nowMs,
    spectators: state.spectators.size,
    armedFollowers: state.armedFollowers.size,
    activeSignals: [...state.activeSignals.values()],
    leaders,
  });
}

function event(
  scenario: DemoScenario,
  step: DemoScenario["steps"][number],
  sequence: number,
  payload: TracePayload,
): TraceEvent {
  return {
    sequence,
    atMs: step.atMs,
    action: step.action,
    tableId: scenario.tableId,
    actorId: step.actorId,
    signalId: step.signalId,
    payload,
  };
}

function initialRankedLeaders(
  scenario: DemoScenario,
  participantsById: Map<string, ReplayParticipant>,
): ReplayLeader[] {
  const snapshot = buildTableSnapshot({
    tableId: scenario.tableId,
    oracleId: scenario.oracleId,
    market: scenario.market,
    asOfMs: scenario.startsAtMs,
    spectators: 0,
    armedFollowers: 0,
    activeSignals: [],
    leaders: scenario.traders.map((trader) =>
      scoreTrader({
        traderId: trader.traderId,
        resolvedSignals: [],
        copiedVolume: 0,
        nowMs: scenario.startsAtMs,
      })
    ),
  });

  return replayLeaders(snapshot.leaders, participantsById);
}

function replayFrame(
  traceEvent: TraceEvent,
  scenario: DemoScenario,
  state: ReplayFrameState,
  activity: ReplayActivity,
  leaderChanged: boolean,
  previousLeader?: ReplayLeader,
): DemoReplayFrame {
  const currentLeader = state.rankedLeaders[0];

  return {
    sequence: traceEvent.sequence,
    atMs: traceEvent.atMs,
    tableId: traceEvent.tableId,
    phase: phaseForAction(traceEvent.action),
    activity,
    state: {
      tableId: scenario.tableId,
      oracleId: scenario.oracleId,
      market: scenario.market,
      asOfMs: traceEvent.atMs,
      spectators: state.spectators,
      armedFollowers: state.armedFollowers,
      activeSignals: activeSignalsForFrame(state),
      rankedLeaders: state.rankedLeaders,
      ...(currentLeader ? { currentLeader } : {}),
      ...(previousLeader ? { previousLeader } : {}),
      leaderChanged,
    },
  };
}

function applyReplayStateEvent(
  state: ReplayFrameState,
  traceEvent: TraceEvent,
): TableSnapshot | undefined {
  switch (traceEvent.action) {
    case "spectator_joined":
      if ("spectatorCount" in traceEvent.payload) {
        state.spectators = traceEvent.payload.spectatorCount;
      }
      break;

    case "copy_armed":
      if ("armedFollowers" in traceEvent.payload) {
        state.armedFollowers = traceEvent.payload.armedFollowers;
      }
      break;

    case "signal_posted":
      if ("signal" in traceEvent.payload) {
        state.activeSignals.set(
          traceEvent.payload.signal.signalId,
          replaySignal(traceEvent.payload.signal),
        );
      }
      break;

    case "signal_settled":
      if ("signal" in traceEvent.payload) {
        state.activeSignals.delete(traceEvent.payload.signal.signalId);
      }
      break;

    case "score_updated":
    case "snapshot_emitted": {
      const snapshot = snapshotPayload(traceEvent.payload);
      if (snapshot) {
        state.spectators = snapshot.spectators;
        state.armedFollowers = snapshot.armedFollowers;
        state.activeSignals = new Map(
          snapshot.activeSignals.map((signal) => [
            signal.signalId,
            replaySignal(signal),
          ]),
        );
      }
      return snapshot;
    }

    case "copy_executed":
      break;
  }

  return undefined;
}

function activityForEvent(
  traceEvent: TraceEvent,
  participantsById: Map<string, ReplayParticipant>,
): ReplayActivity {
  switch (traceEvent.action) {
    case "spectator_joined": {
      const actor = participantForId(participantsById, traceEvent.actorId);
      return {
        action: traceEvent.action,
        label: `${actor.displayName} joined`,
        actorId: actor.traderId,
        participant: actor,
      };
    }

    case "copy_armed": {
      const actor = participantForId(participantsById, traceEvent.actorId);
      return {
        action: traceEvent.action,
        label: `${actor.displayName} armed copy`,
        actorId: actor.traderId,
        participant: actor,
      };
    }

    case "signal_posted": {
      const signal = requireSignalPayload(traceEvent);
      const leader = participantForId(participantsById, signal.leaderId);
      return {
        action: traceEvent.action,
        label: `${leader.displayName} posted ${signal.direction.toUpperCase()} ${signal.market}`,
        actorId: traceEvent.actorId ?? leader.traderId,
        leaderId: leader.traderId,
        signalId: signal.signalId,
        participant: leader,
        signal: replaySignal(signal),
      };
    }

    case "copy_executed": {
      if (!("copyReceipt" in traceEvent.payload)) {
        throw new Error(`Trace event "${traceEvent.action}" requires copy receipt payload`);
      }
      const receipt = traceEvent.payload.copyReceipt;
      const follower = participantForId(participantsById, receipt.followerId);
      const leader = participantForId(participantsById, receipt.leaderId);
      return {
        action: traceEvent.action,
        label: `${follower.displayName} copied ${leader.displayName}`,
        actorId: traceEvent.actorId ?? follower.traderId,
        signalId: receipt.signalId,
        receiptId: receipt.receiptId,
        leaderId: leader.traderId,
        followerId: follower.traderId,
        participant: follower,
        copy: {
          receiptId: receipt.receiptId,
          signalId: receipt.signalId,
          followerId: receipt.followerId,
          leaderId: receipt.leaderId,
          copiedCost: receipt.copiedCost,
          cumulativeCopiedVolume: traceEvent.payload.copiedVolume,
        },
      };
    }

    case "signal_settled": {
      const signal = requireSettledSignalPayload(traceEvent);
      const leader = participantForId(participantsById, signal.leaderId);
      return {
        action: traceEvent.action,
        label: `${leader.displayName} ${settlementVerb(signal.settlement.status)} ${
          signedAmount(signal.settlement.pnl)
        }`,
        signalId: signal.signalId,
        leaderId: leader.traderId,
        participant: leader,
        signal: replaySignal(signal),
        settlement: {
          signalId: signal.signalId,
          leaderId: signal.leaderId,
          status: signal.settlement.status,
          settlementPrice: signal.settlement.settlementPrice,
          pnl: signal.settlement.pnl,
        },
      };
    }

    case "score_updated": {
      const actor = participantForId(participantsById, traceEvent.actorId);
      const leader = "leaderId" in traceEvent.payload && traceEvent.payload.leaderId
        ? participantForId(participantsById, traceEvent.payload.leaderId)
        : actor;
      const leaderChanged = "leaderChanged" in traceEvent.payload &&
        traceEvent.payload.leaderChanged;
      return {
        action: traceEvent.action,
        label: leaderChanged
          ? `${leader.displayName} moved into first`
          : `${actor.displayName} score updated`,
        actorId: actor.traderId,
        participant: actor,
        leaderId: leader.traderId,
      };
    }

    case "snapshot_emitted":
      return {
        action: traceEvent.action,
        label: "Table snapshot",
      };
  }
}

function requireSignalPayload(traceEvent: TraceEvent): Signal {
  if (!("signal" in traceEvent.payload)) {
    throw new Error(`Trace event "${traceEvent.action}" requires signal payload`);
  }

  return traceEvent.payload.signal;
}

function requireSettledSignalPayload(
  traceEvent: TraceEvent,
): Signal & { settlement: SignalSettlement } {
  const signal = requireSignalPayload(traceEvent);
  if (!hasSettlement(signal)) {
    throw new Error(`Trace event "${traceEvent.action}" requires settlement payload`);
  }

  return signal;
}

function hasSettlement(signal: Signal): signal is Signal & { settlement: SignalSettlement } {
  return "settlement" in signal;
}

function snapshotPayload(payload: TracePayload): TableSnapshot | undefined {
  return "snapshot" in payload ? payload.snapshot : undefined;
}

function activeSignalsForFrame(state: ReplayFrameState): ReplaySignal[] {
  return [...state.activeSignals.values()].sort((a, b) =>
    a.createdAtMs - b.createdAtMs || compareString(a.signalId, b.signalId)
  );
}

function replayLeaders(
  scores: TraderScore[],
  participantsById: Map<string, ReplayParticipant>,
): ReplayLeader[] {
  return scores.map((score, index) => {
    const participant = participantForId(participantsById, score.traderId);

    return {
      ...score,
      rank: index + 1,
      handle: participant.handle,
      displayName: participant.displayName,
      ...(participant.avatarUrl ? { avatarUrl: participant.avatarUrl } : {}),
    };
  });
}

function replaySignal(signal: Signal): ReplaySignal {
  return {
    signalId: signal.signalId,
    leaderId: signal.leaderId,
    oracleId: signal.oracleId,
    market: signal.market,
    direction: signal.direction,
    strike: signal.strike,
    expiryMs: signal.expiryMs,
    confidenceBps: signal.confidenceBps,
    createdAtMs: signal.createdAtMs,
    status: signal.status,
    ...(signal.thesis ? { thesis: signal.thesis } : {}),
  };
}

function participantMap(scenario: DemoScenario): Map<string, ReplayParticipant> {
  return new Map(
    [...scenario.traders, ...scenario.spectators].map((trader) => [
      trader.traderId,
      replayParticipant(trader),
    ]),
  );
}

function replayParticipant(trader: Trader): ReplayParticipant {
  return {
    traderId: trader.traderId,
    handle: trader.handle,
    displayName: trader.displayName,
    ...(trader.avatarUrl ? { avatarUrl: trader.avatarUrl } : {}),
  };
}

function participantForId(
  participantsById: Map<string, ReplayParticipant>,
  traderId: string | undefined,
): ReplayParticipant {
  if (traderId) {
    const participant = participantsById.get(traderId);
    if (participant) return participant;
  }

  const fallbackId = traderId ?? "unknown";
  return {
    traderId: fallbackId,
    handle: fallbackId,
    displayName: fallbackId,
  };
}

function phaseForAction(action: ScenarioAction): ReplayPhase {
  switch (action) {
    case "spectator_joined":
      return "spectator";
    case "copy_armed":
      return "arming";
    case "signal_posted":
      return "signal";
    case "copy_executed":
      return "copy";
    case "signal_settled":
      return "settlement";
    case "score_updated":
      return "score";
    case "snapshot_emitted":
      return "snapshot";
  }
}

function settlementVerb(status: SignalSettlement["status"]): string {
  switch (status) {
    case "settled_win":
      return "won";
    case "settled_loss":
      return "lost";
    case "voided":
      return "voided";
  }
}

function signedAmount(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function compareString(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function requireActor(actorId: string | undefined, action: string): string {
  if (!actorId) throw new Error(`Step "${action}" requires actorId`);
  return actorId;
}

function requireSignal(
  signalsById: Map<string, Signal>,
  signalId: string | undefined,
  action: string,
): Signal {
  if (!signalId) throw new Error(`Step "${action}" requires signalId`);
  const signal = signalsById.get(signalId);
  if (!signal) throw new Error(`Unknown signal "${signalId}"`);
  return signal;
}

function requireReceipt(
  receiptsById: Map<string, CopyReceipt>,
  receiptId: string | undefined,
  action: string,
): CopyReceipt {
  if (!receiptId) throw new Error(`Step "${action}" requires receiptId`);
  const receipt = receiptsById.get(receiptId);
  if (!receipt) throw new Error(`Unknown copy receipt "${receiptId}"`);
  return receipt;
}
