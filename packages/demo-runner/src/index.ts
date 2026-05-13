import { getScenario } from "../../fixtures/src/index";
import {
  buildTableSnapshot,
  scoreTrader,
  settleSignal,
  type CopyReceipt,
  type DemoScenario,
  type Signal,
  type SignalSettlement,
  type TableSnapshot,
  type TraderScore,
} from "../../shared/src/index";

export type TracePayload =
  | { spectatorCount: number }
  | { armedFollowers: number }
  | { signal: Signal }
  | { copyReceipt: CopyReceipt; copiedVolume: number }
  | { signal: Signal & { settlement: SignalSettlement } }
  | { score: TraderScore }
  | { snapshot: TableSnapshot };

export interface TraceEvent {
  sequence: number;
  atMs: number;
  action: string;
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
          requireActor(step.actorId, step.action);
          state.spectators.add(step.actorId);
          return event(scenario, step, sequence, {
            spectatorCount: state.spectators.size,
          });
        }

        case "copy_armed": {
          requireActor(step.actorId, step.action);
          state.armedFollowers.add(step.actorId);
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
          requireActor(step.actorId, step.action);
          const score = scoreForLeader(state, step.actorId, step.atMs);
          return event(scenario, step, sequence, { score });
        }

        case "snapshot_emitted": {
          const leaders = scenario.traders.map((trader) =>
            scoreForLeader(state, trader.traderId, step.atMs)
          );
          const snapshot = buildTableSnapshot({
            tableId: scenario.tableId,
            oracleId: scenario.oracleId,
            market: scenario.market,
            asOfMs: step.atMs,
            spectators: state.spectators.size,
            armedFollowers: state.armedFollowers.size,
            activeSignals: [...state.activeSignals.values()],
            leaders,
          });
          return event(scenario, step, sequence, { snapshot });
        }
      }
    });
}

export function produceTraceById(scenarioId: string): TraceEvent[] {
  return produceTrace(loadScenario(scenarioId));
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
