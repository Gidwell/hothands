import type { SocketSession, TableDeltaMessage, TableSummary } from "./protocol";

export interface TableState {
  readonly tableId: string;
  readonly sessions: Map<string, SocketSession>;
  hotScore: number;
  updatedAtMs: number;
}

export interface TableStateOptions {
  nowMs?: number;
  hotScore?: number;
}

export interface AddSessionInput {
  sessionId: string;
  spectatorId: string;
  nowMs: number;
}

export interface TableStateSummary extends TableSummary {
  hotScore: number;
  perLeaderArmedCounts: Record<string, number>;
}

export interface TableStateChange {
  events: TableDeltaMessage["event"][];
  summary: TableStateSummary;
}

export function createTableState(
  tableId: string,
  options: TableStateOptions = {}
): TableState {
  assertNonEmptyString(tableId, "tableId");

  const nowMs = options.nowMs ?? 0;
  const hotScore = options.hotScore ?? 0;
  assertTimestampMs(nowMs, "nowMs");
  assertHotScore(hotScore);

  return {
    tableId,
    sessions: new Map(),
    hotScore,
    updatedAtMs: nowMs
  };
}

export function addSession(state: TableState, input: AddSessionInput): TableStateChange {
  assertNonEmptyString(input.sessionId, "sessionId");
  assertNonEmptyString(input.spectatorId, "spectatorId");
  assertTimestampMs(input.nowMs, "nowMs");

  const existing = state.sessions.get(input.sessionId);
  if (existing) {
    existing.spectatorId = input.spectatorId;
    existing.lastSeenAtMs = input.nowMs;
    return tableStateChange(state, []);
  }

  state.sessions.set(input.sessionId, {
    spectatorId: input.spectatorId,
    joinedAtMs: input.nowMs,
    lastSeenAtMs: input.nowMs
  });
  state.updatedAtMs = input.nowMs;

  return tableStateChange(state, ["spectator_joined"]);
}

export function setSessionSpectatorId(
  state: TableState,
  sessionId: string,
  spectatorId: string,
  nowMs: number
): TableStateChange {
  assertNonEmptyString(sessionId, "sessionId");
  assertNonEmptyString(spectatorId, "spectatorId");
  assertTimestampMs(nowMs, "nowMs");

  const session = state.sessions.get(sessionId);
  if (!session) {
    return tableStateChange(state, []);
  }

  session.spectatorId = spectatorId;
  session.lastSeenAtMs = nowMs;
  return tableStateChange(state, []);
}

export function touchSession(
  state: TableState,
  sessionId: string,
  nowMs: number
): TableStateChange {
  assertNonEmptyString(sessionId, "sessionId");
  assertTimestampMs(nowMs, "nowMs");

  const session = state.sessions.get(sessionId);
  if (!session) {
    return tableStateChange(state, []);
  }

  session.lastSeenAtMs = nowMs;
  return tableStateChange(state, []);
}

export function armCopy(
  state: TableState,
  sessionId: string,
  leaderId: string,
  nowMs: number
): TableStateChange {
  assertNonEmptyString(sessionId, "sessionId");
  assertNonEmptyString(leaderId, "leaderId");
  assertTimestampMs(nowMs, "nowMs");

  const session = state.sessions.get(sessionId);
  if (!session) {
    return tableStateChange(state, []);
  }

  session.lastSeenAtMs = nowMs;

  if (session.armedLeaderId === leaderId) {
    return tableStateChange(state, []);
  }

  const wasArmed = Boolean(session.armedLeaderId);
  session.armedLeaderId = leaderId;
  state.updatedAtMs = nowMs;

  return tableStateChange(state, [wasArmed ? "copy_rearmed" : "copy_armed"]);
}

export function disarmCopy(
  state: TableState,
  sessionId: string,
  nowMs: number
): TableStateChange {
  assertNonEmptyString(sessionId, "sessionId");
  assertTimestampMs(nowMs, "nowMs");

  const session = state.sessions.get(sessionId);
  if (!session || !session.armedLeaderId) {
    return tableStateChange(state, []);
  }

  delete session.armedLeaderId;
  session.lastSeenAtMs = nowMs;
  state.updatedAtMs = nowMs;

  return tableStateChange(state, ["copy_disarmed"]);
}

export function removeSession(
  state: TableState,
  sessionId: string,
  nowMs: number
): TableStateChange {
  assertNonEmptyString(sessionId, "sessionId");
  assertTimestampMs(nowMs, "nowMs");

  const session = state.sessions.get(sessionId);
  if (!session) {
    return tableStateChange(state, []);
  }

  const events: TableDeltaMessage["event"][] = session.armedLeaderId
    ? ["copy_disarmed", "spectator_left"]
    : ["spectator_left"];
  state.sessions.delete(sessionId);
  state.updatedAtMs = nowMs;

  return tableStateChange(state, events);
}

export function setTableHotScore(
  state: TableState,
  hotScore: number,
  nowMs: number
): TableStateChange {
  assertHotScore(hotScore);
  assertTimestampMs(nowMs, "nowMs");

  if (state.hotScore === hotScore) {
    return tableStateChange(state, []);
  }

  state.hotScore = hotScore;
  state.updatedAtMs = nowMs;
  return tableStateChange(state, ["hot_score_updated"]);
}

export function getSession(
  state: TableState,
  sessionId: string
): SocketSession | undefined {
  return state.sessions.get(sessionId);
}

export function summarizeTableState(state: TableState): TableStateSummary {
  const leaderCounts = new Map<string, number>();

  for (const session of state.sessions.values()) {
    if (!session.armedLeaderId) {
      continue;
    }

    leaderCounts.set(
      session.armedLeaderId,
      (leaderCounts.get(session.armedLeaderId) ?? 0) + 1
    );
  }

  const perLeaderArmedCounts: Record<string, number> = {};
  let armedCount = 0;
  for (const [leaderId, count] of [...leaderCounts.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    perLeaderArmedCounts[leaderId] = count;
    armedCount += count;
  }

  return {
    tableId: state.tableId,
    spectatorCount: state.sessions.size,
    armedCount,
    perLeaderArmedCounts,
    hotScore: state.hotScore,
    updatedAtMs: state.updatedAtMs
  };
}

function tableStateChange(
  state: TableState,
  events: TableDeltaMessage["event"][]
): TableStateChange {
  return {
    events,
    summary: summarizeTableState(state)
  };
}

function assertNonEmptyString(value: string, name: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid ${name}`);
  }
}

function assertTimestampMs(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid ${name}`);
  }
}

function assertHotScore(value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Invalid hotScore");
  }
}
