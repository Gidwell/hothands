import type { RealtimeActivityTraceItem } from "@hot-hands/shared";
import { encodeServerMessage, type ServerMessage } from "./protocol";
import {
  setTableHotScore,
  summarizeTableState,
  type TableState,
  type TableStateSummary
} from "./table-state";

export interface TableActivityBroadcast {
  messages: ServerMessage[];
  summary: TableStateSummary;
}

export function createTableActivityBroadcast(
  state: TableState,
  trace: unknown
): TableActivityBroadcast {
  if (!Array.isArray(trace)) {
    throw new Error("Activity trace must be an array");
  }

  const activityTrace = validateTableActivityTrace(state, trace);
  const messages: ServerMessage[] = [];

  for (const activityItem of activityTrace) {
    messages.push(activityItem);

    if (activityItem.hotScore === undefined) {
      continue;
    }

    const change = setTableHotScore(state, activityItem.hotScore, activityItem.atMs);
    for (const event of change.events) {
      messages.push({
        type: "table_delta",
        tableId: state.tableId,
        atMs: activityItem.atMs,
        spectatorCount: change.summary.spectatorCount,
        armedCount: change.summary.armedCount,
        perLeaderArmedCounts: change.summary.perLeaderArmedCounts,
        hotScore: change.summary.hotScore,
        event
      });
    }
  }

  return {
    messages,
    summary: summarizeTableState(state)
  };
}

function validateTableActivityTrace(
  state: TableState,
  trace: unknown[]
): RealtimeActivityTraceItem[] {
  let previousSequence: number | undefined;
  const activityTrace: RealtimeActivityTraceItem[] = [];

  for (const item of trace) {
    const activityItem = item as RealtimeActivityTraceItem;
    validateTableActivityItem(state, activityItem);

    if (
      previousSequence !== undefined &&
      activityItem.sequence <= previousSequence
    ) {
      throw new Error("Activity sequence must be ordered");
    }

    previousSequence = activityItem.sequence;
    activityTrace.push(activityItem);
  }

  return activityTrace;
}

function validateTableActivityItem(
  state: TableState,
  item: RealtimeActivityTraceItem
): void {
  if (item.tableId !== state.tableId) {
    throw new Error("Activity tableId does not match table state");
  }

  encodeServerMessage(item);
}
