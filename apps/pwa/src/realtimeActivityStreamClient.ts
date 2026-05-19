import type {
  RealtimeActivityEvent,
  RealtimeActivityTraceItem,
  SignalStatus,
} from "@hot-hands/shared";
import {
  applyRealtimeActivityItem,
  type RealtimeActivityState,
} from "./realtimeActivityModel";

const activityEvents = new Set<RealtimeActivityEvent>([
  "signal_landed",
  "copy_submitted",
  "copy_executed",
  "settlement_posted",
  "hot_hand_updated",
]);

const signalStatuses = new Set<SignalStatus>([
  "posted",
  "copyable",
  "expired",
  "settled_win",
  "settled_loss",
  "voided",
]);

export function applyRealtimeActivityServerMessageJson(
  state: RealtimeActivityState,
  input: string,
): RealtimeActivityState {
  const activityItem = parseRealtimeActivityServerMessageJson(input);

  if (!activityItem) {
    return state;
  }

  return applyRealtimeActivityItem(state, activityItem);
}

export function parseRealtimeActivityServerMessageJson(
  input: string,
): RealtimeActivityTraceItem | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(input);
  } catch {
    return null;
  }

  if (!isRecord(parsed) || parsed.type !== "table_activity") {
    return null;
  }

  return isRealtimeActivityTraceItem(parsed) ? parsed : null;
}

function isRealtimeActivityTraceItem(
  value: unknown,
): value is RealtimeActivityTraceItem {
  if (!isRecord(value)) {
    return false;
  }

  if (
    value.source !== "fixture_replay" ||
    !isNonNegativeInteger(value.sequence) ||
    !isNonNegativeInteger(value.sourceSequence) ||
    !isNonNegativeNumber(value.atMs) ||
    !isNonEmptyString(value.tableId) ||
    !isRealtimeActivityEvent(value.event) ||
    !isNonEmptyString(value.label) ||
    !isNonNegativeInteger(value.spectatorCount) ||
    !isNonNegativeInteger(value.armedCount) ||
    value.armedCount > value.spectatorCount ||
    !isRecord(value.payload)
  ) {
    return false;
  }

  return isRealtimeActivityPayload(value.event, value.payload);
}

function isRealtimeActivityPayload(
  event: RealtimeActivityEvent,
  payload: Record<string, unknown>,
): boolean {
  switch (event) {
    case "signal_landed":
      return isRecord(payload.signal) && isSignalPayload(payload.signal);
    case "copy_submitted":
      return isRecord(payload.copy) && isCopyPayload(payload.copy, "submitted");
    case "copy_executed":
      return isRecord(payload.copy) && isCopyPayload(payload.copy, "executed");
    case "settlement_posted":
      return isRecord(payload.settlement) && isSettlementPayload(payload.settlement);
    case "hot_hand_updated":
      return isRecord(payload.hotHand) && isHotHandPayload(payload.hotHand);
  }
}

function isSignalPayload(value: Record<string, unknown>): boolean {
  return (
    isNonEmptyString(value.signalId) &&
    isNonEmptyString(value.leaderId) &&
    isNonEmptyString(value.oracleId) &&
    isNonEmptyString(value.market) &&
    (value.direction === "up" || value.direction === "down") &&
    isNumber(value.strike) &&
    isNumber(value.expiryMs) &&
    isNumber(value.confidenceBps) &&
    isNumber(value.createdAtMs) &&
    isSignalStatus(value.status)
  );
}

function isCopyPayload(
  value: Record<string, unknown>,
  status: "submitted" | "executed",
): boolean {
  return (
    value.status === status &&
    isNonEmptyString(value.receiptId) &&
    isNonEmptyString(value.signalId) &&
    isNonEmptyString(value.followerId) &&
    isNonEmptyString(value.leaderId) &&
    isNumber(value.copiedCost) &&
    isNumber(value.cumulativeCopiedVolume)
  );
}

function isSettlementPayload(value: Record<string, unknown>): boolean {
  return (
    isNonEmptyString(value.signalId) &&
    isNonEmptyString(value.leaderId) &&
    isNumber(value.settlementPrice) &&
    isNumber(value.pnl) &&
    (
      value.status === "settled_win" ||
      value.status === "settled_loss" ||
      value.status === "voided"
    )
  );
}

function isHotHandPayload(value: Record<string, unknown>): boolean {
  return (
    typeof value.leaderChanged === "boolean" &&
    isNonEmptyString(value.currentLeaderId) &&
    (value.previousLeaderId === undefined || isNonEmptyString(value.previousLeaderId)) &&
    isRecord(value.score) &&
    isNonEmptyString(value.score.traderId) &&
    isNonEmptyString(value.score.displayName) &&
    isNumber(value.score.hotScore)
  );
}

function isRealtimeActivityEvent(value: unknown): value is RealtimeActivityEvent {
  return typeof value === "string" && activityEvents.has(value as RealtimeActivityEvent);
}

function isSignalStatus(value: unknown): value is SignalStatus {
  return typeof value === "string" && signalStatuses.has(value as SignalStatus);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return isNumber(value) && value >= 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}
