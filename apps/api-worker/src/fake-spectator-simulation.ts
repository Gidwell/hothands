import type { TableDeltaMessage } from "./protocol";
import {
  addSession,
  armCopy,
  createTableState,
  disarmCopy,
  removeSession,
  summarizeTableState,
  touchSession,
  type TableStateChange,
  type TableStateSummary
} from "./table-state";

type TableEvent = TableDeltaMessage["event"];

export interface FakeSpectatorSimulationOptions {
  nowMs: number;
  spectatorCount: number;
}

export interface FakeSpectatorSimulationSnapshot {
  summary: TableStateSummary;
  eventCounts: Record<TableEvent, number>;
  heartbeatNoopCount: number;
}

export interface FakeSpectatorSimulation {
  joinAll(): void;
  pingAll(rounds: number): void;
  armRange(startInclusive: number, endExclusive: number, leaderId: string): void;
  rearmRange(startInclusive: number, endExclusive: number, leaderId: string): void;
  disarmRange(startInclusive: number, endExclusive: number): void;
  leaveRange(startInclusive: number, endExclusive: number): void;
  summary(): TableStateSummary;
  eventCounts(): Record<TableEvent, number>;
  heartbeatNoopCount(): number;
  snapshot(): FakeSpectatorSimulationSnapshot;
}

export function createFakeSpectatorSimulation(
  tableId: string,
  options: FakeSpectatorSimulationOptions
): FakeSpectatorSimulation {
  assertRangeCount(options.spectatorCount, "spectatorCount");

  const state = createTableState(tableId, { nowMs: options.nowMs });
  const sessionIds = Array.from(
    { length: options.spectatorCount },
    (_, index) => `socket-btc-${index + 1}`
  );
  const eventCounts = emptyEventCounts();
  let nowMs = options.nowMs;
  let heartbeatNoopCount = 0;

  function nextNowMs(): number {
    nowMs += 1;
    return nowMs;
  }

  function record(change: TableStateChange): void {
    for (const event of change.events) {
      eventCounts[event] += 1;
    }
  }

  function applyRange(
    startInclusive: number,
    endExclusive: number,
    apply: (sessionId: string) => TableStateChange
  ): void {
    assertRange(startInclusive, endExclusive, sessionIds.length);

    for (let index = startInclusive; index < endExclusive; index += 1) {
      record(apply(sessionIds[index]));
    }
  }

  function cloneEventCounts(): Record<TableEvent, number> {
    return { ...eventCounts };
  }

  return {
    joinAll() {
      for (let index = 0; index < sessionIds.length; index += 1) {
        record(
          addSession(state, {
            sessionId: sessionIds[index],
            spectatorId: `spectator-btc-${index + 1}`,
            nowMs: nextNowMs()
          })
        );
      }
    },

    pingAll(rounds: number) {
      assertRangeCount(rounds, "rounds");

      for (let round = 0; round < rounds; round += 1) {
        for (const sessionId of sessionIds) {
          const change = touchSession(state, sessionId, nextNowMs());
          record(change);
          if (change.events.length === 0) {
            heartbeatNoopCount += 1;
          }
        }
      }
    },

    armRange(startInclusive: number, endExclusive: number, leaderId: string) {
      applyRange(startInclusive, endExclusive, (sessionId) =>
        armCopy(state, sessionId, leaderId, nextNowMs())
      );
    },

    rearmRange(startInclusive: number, endExclusive: number, leaderId: string) {
      applyRange(startInclusive, endExclusive, (sessionId) =>
        armCopy(state, sessionId, leaderId, nextNowMs())
      );
    },

    disarmRange(startInclusive: number, endExclusive: number) {
      applyRange(startInclusive, endExclusive, (sessionId) =>
        disarmCopy(state, sessionId, nextNowMs())
      );
    },

    leaveRange(startInclusive: number, endExclusive: number) {
      applyRange(startInclusive, endExclusive, (sessionId) =>
        removeSession(state, sessionId, nextNowMs())
      );
    },

    summary() {
      return summarizeTableState(state);
    },

    eventCounts() {
      return cloneEventCounts();
    },

    heartbeatNoopCount() {
      return heartbeatNoopCount;
    },

    snapshot() {
      return {
        summary: summarizeTableState(state),
        eventCounts: cloneEventCounts(),
        heartbeatNoopCount
      };
    }
  };
}

function emptyEventCounts(): Record<TableEvent, number> {
  return {
    spectator_joined: 0,
    spectator_left: 0,
    copy_armed: 0,
    copy_disarmed: 0,
    copy_rearmed: 0
  };
}

function assertRangeCount(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid ${name}`);
  }
}

function assertRange(startInclusive: number, endExclusive: number, count: number): void {
  if (
    !Number.isSafeInteger(startInclusive) ||
    !Number.isSafeInteger(endExclusive) ||
    startInclusive < 0 ||
    endExclusive < startInclusive ||
    endExclusive > count
  ) {
    throw new Error("Invalid spectator range");
  }
}
