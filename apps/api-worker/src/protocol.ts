import type {
  RealtimeActivityEvent,
  RealtimeActivityTraceItem
} from "@hot-hands/shared";

export type ClientMessage =
  | JoinMessage
  | PingMessage
  | ArmCopyMessage
  | DisarmCopyMessage;

export type ServerMessage =
  | WelcomeMessage
  | PongMessage
  | TableDeltaMessage
  | TableActivityMessage
  | ErrorMessage;

export interface JoinMessage {
  type: "join";
  spectatorId?: string;
}

export interface PingMessage {
  type: "ping";
  nonce?: string;
}

export interface ArmCopyMessage {
  type: "arm_copy";
  leaderId: string;
}

export interface DisarmCopyMessage {
  type: "disarm_copy";
}

export interface WelcomeMessage {
  type: "welcome";
  table: TableSummary;
  spectatorId: string;
}

export interface PongMessage {
  type: "pong";
  atMs: number;
  nonce?: string;
}

export interface TableDeltaMessage {
  type: "table_delta";
  tableId: string;
  atMs: number;
  spectatorCount: number;
  armedCount: number;
  perLeaderArmedCounts?: Record<string, number>;
  hotScore?: number;
  event: TableDeltaEvent;
}

export type TableDeltaEvent =
  | "spectator_joined"
  | "spectator_left"
  | "copy_armed"
  | "copy_disarmed"
  | "copy_rearmed"
  | "hot_score_updated";

export type TableActivityMessage = RealtimeActivityTraceItem;

export interface ErrorMessage {
  type: "error";
  code: "bad_json" | "bad_message" | "unsupported_message";
  message: string;
}

export interface TableSummary {
  tableId: string;
  spectatorCount: number;
  armedCount: number;
  perLeaderArmedCounts?: Record<string, number>;
  hotScore?: number;
  updatedAtMs: number;
}

export interface TableSummaryDelta {
  summary: TableSummary;
  delta: TableDeltaMessage;
}

export interface SocketSession {
  spectatorId: string;
  armedLeaderId?: string;
  joinedAtMs: number;
  lastSeenAtMs: number;
}

export function parseClientMessage(input: string): ClientMessage | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(input);
  } catch {
    return null;
  }

  if (!isRecord(parsed) || typeof parsed.type !== "string") {
    return null;
  }

  switch (parsed.type) {
    case "join":
      if (!hasOnlyKeys(parsed, ["type", "spectatorId"])) {
        return null;
      }
      return parseJoinMessage(parsed);
    case "ping":
      if (!hasOnlyKeys(parsed, ["type", "nonce"])) {
        return null;
      }
      return parsePingMessage(parsed);
    case "arm_copy":
      if (!hasOnlyKeys(parsed, ["type", "leaderId"]) || !isNonEmptyString(parsed.leaderId)) {
        return null;
      }
      return {
        type: "arm_copy",
        leaderId: parsed.leaderId
      };
    case "disarm_copy":
      if (!hasOnlyKeys(parsed, ["type"])) {
        return null;
      }
      return { type: "disarm_copy" };
    default:
      return null;
  }
}

export function encodeServerMessage(message: ServerMessage): string {
  if (!isServerMessage(message)) {
    throw new Error("Invalid server message");
  }

  return JSON.stringify(message);
}

export function applyTableSummaryDelta(
  summary: TableSummary,
  event: TableDeltaMessage["event"],
  atMs: number
): TableSummaryDelta {
  if (!isTableSummary(summary) || !isTableDeltaEvent(event) || !isTimestampMs(atMs)) {
    throw new Error("Invalid table summary delta");
  }

  let spectatorCount = summary.spectatorCount;
  let armedCount = summary.armedCount;

  switch (event) {
    case "spectator_joined":
      spectatorCount += 1;
      break;
    case "spectator_left":
      spectatorCount = Math.max(0, spectatorCount - 1);
      armedCount = Math.min(armedCount, spectatorCount);
      break;
    case "copy_armed":
      armedCount = Math.min(spectatorCount, armedCount + 1);
      break;
    case "copy_disarmed":
      armedCount = Math.max(0, armedCount - 1);
      break;
    case "copy_rearmed":
    case "hot_score_updated":
      break;
  }

  const nextSummary: TableSummary = {
    tableId: summary.tableId,
    spectatorCount,
    armedCount,
    updatedAtMs: atMs
  };
  if (summary.hotScore !== undefined) {
    nextSummary.hotScore = summary.hotScore;
  }
  const perLeaderArmedCounts = applyLeaderCountDelta(summary, event, armedCount);
  if (perLeaderArmedCounts !== undefined) {
    nextSummary.perLeaderArmedCounts = perLeaderArmedCounts;
  }

  return {
    summary: nextSummary,
    delta: {
      type: "table_delta",
      tableId: nextSummary.tableId,
      atMs,
      spectatorCount,
      armedCount,
      hotScore: nextSummary.hotScore,
      perLeaderArmedCounts: nextSummary.perLeaderArmedCounts,
      event
    }
  };
}

function applyLeaderCountDelta(
  summary: TableSummary,
  event: TableDeltaMessage["event"],
  armedCount: number
): Record<string, number> | undefined {
  if (summary.perLeaderArmedCounts === undefined) {
    return undefined;
  }

  if (event === "copy_armed") {
    return undefined;
  }

  if (event === "spectator_joined" || event === "copy_rearmed") {
    return { ...summary.perLeaderArmedCounts };
  }

  return clampLeaderCounts(summary.perLeaderArmedCounts, armedCount);
}

function clampLeaderCounts(
  counts: Record<string, number>,
  targetTotal: number
): Record<string, number> {
  const nextCounts = { ...counts };
  let excess = totalLeaderCounts(nextCounts) - targetTotal;

  for (const leaderId of Object.keys(nextCounts).sort().reverse()) {
    if (excess <= 0) {
      break;
    }

    const decrement = Math.min(nextCounts[leaderId], excess);
    nextCounts[leaderId] -= decrement;
    excess -= decrement;

    if (nextCounts[leaderId] === 0) {
      delete nextCounts[leaderId];
    }
  }

  return nextCounts;
}

function totalLeaderCounts(counts: Record<string, number>): number {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

function parseJoinMessage(parsed: Record<string, unknown>): JoinMessage | null {
  const spectatorId = optionalNonEmptyString(parsed, "spectatorId");
  if (spectatorId === null) {
    return null;
  }

  return spectatorId ? { type: "join", spectatorId } : { type: "join" };
}

function parsePingMessage(parsed: Record<string, unknown>): PingMessage | null {
  const nonce = optionalNonEmptyString(parsed, "nonce");
  if (nonce === null) {
    return null;
  }

  return nonce ? { type: "ping", nonce } : { type: "ping" };
}

function optionalNonEmptyString(
  record: Record<string, unknown>,
  key: string
): string | null | undefined {
  if (!(key in record)) {
    return undefined;
  }

  return isNonEmptyString(record[key]) ? record[key] : null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function hasOnlyKeys(record: Record<string, unknown>, allowedKeys: string[]): boolean {
  return Object.keys(record).every((key) => allowedKeys.includes(key));
}

function isServerMessage(value: unknown): value is ServerMessage {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  switch (value.type) {
    case "welcome":
      return isWelcomeMessage(value);
    case "pong":
      return isPongMessage(value);
    case "table_delta":
      return isTableDeltaMessage(value);
    case "table_activity":
      return isTableActivityMessage(value);
    case "error":
      return isErrorMessage(value);
    default:
      return false;
  }
}

function isWelcomeMessage(value: Record<string, unknown>): boolean {
  return (
    hasOnlyKeys(value, ["type", "table", "spectatorId"]) &&
    value.type === "welcome" &&
    isTableSummary(value.table) &&
    isNonEmptyString(value.spectatorId)
  );
}

function isPongMessage(value: Record<string, unknown>): boolean {
  return (
    hasOnlyKeys(value, ["type", "atMs", "nonce"]) &&
    value.type === "pong" &&
    isTimestampMs(value.atMs) &&
    (!("nonce" in value) || value.nonce === undefined || isNonEmptyString(value.nonce))
  );
}

function isTableDeltaMessage(value: Record<string, unknown>): boolean {
  return (
    hasOnlyKeys(value, [
      "type",
      "tableId",
      "atMs",
      "spectatorCount",
      "armedCount",
      "perLeaderArmedCounts",
      "hotScore",
      "event"
    ]) &&
    value.type === "table_delta" &&
    isNonEmptyString(value.tableId) &&
    isTimestampMs(value.atMs) &&
    isCount(value.spectatorCount) &&
    isCount(value.armedCount) &&
    value.armedCount <= value.spectatorCount &&
    optionalLeaderCountsMatch(value.perLeaderArmedCounts, value.armedCount) &&
    optionalHotScore(value.hotScore) &&
    isTableDeltaEvent(value.event)
  );
}

function isTableActivityMessage(value: Record<string, unknown>): boolean {
  return (
    hasOnlyKeys(value, [
      "type",
      "source",
      "sequence",
      "sourceSequence",
      "atMs",
      "tableId",
      "event",
      "label",
      "actorId",
      "leaderId",
      "followerId",
      "signalId",
      "receiptId",
      "spectatorCount",
      "armedCount",
      "hotScore",
      "payload"
    ]) &&
    value.type === "table_activity" &&
    value.source === "fixture_replay" &&
    isCount(value.sequence) &&
    isCount(value.sourceSequence) &&
    isNonEmptyString(value.tableId) &&
    isTimestampMs(value.atMs) &&
    isRealtimeActivityEvent(value.event) &&
    isNonEmptyString(value.label) &&
    optionalNonEmptyStringValue(value.actorId) &&
    optionalNonEmptyStringValue(value.leaderId) &&
    optionalNonEmptyStringValue(value.followerId) &&
    optionalNonEmptyStringValue(value.signalId) &&
    optionalNonEmptyStringValue(value.receiptId) &&
    isCount(value.spectatorCount) &&
    isCount(value.armedCount) &&
    value.armedCount <= value.spectatorCount &&
    optionalHotScore(value.hotScore) &&
    isRealtimeActivityPayload(value.event, value.payload)
  );
}

function isErrorMessage(value: Record<string, unknown>): boolean {
  return (
    hasOnlyKeys(value, ["type", "code", "message"]) &&
    value.type === "error" &&
    isErrorCode(value.code) &&
    isNonEmptyString(value.message)
  );
}

function isTableSummary(value: unknown): value is TableSummary {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      "tableId",
      "spectatorCount",
      "armedCount",
      "perLeaderArmedCounts",
      "hotScore",
      "updatedAtMs"
    ]) &&
    isNonEmptyString(value.tableId) &&
    isCount(value.spectatorCount) &&
    isCount(value.armedCount) &&
    value.armedCount <= value.spectatorCount &&
    optionalLeaderCountsMatch(value.perLeaderArmedCounts, value.armedCount) &&
    optionalHotScore(value.hotScore) &&
    isTimestampMs(value.updatedAtMs)
  );
}

function isTableDeltaEvent(value: unknown): value is TableDeltaMessage["event"] {
  return (
    value === "spectator_joined" ||
    value === "spectator_left" ||
    value === "copy_armed" ||
    value === "copy_disarmed" ||
    value === "copy_rearmed" ||
    value === "hot_score_updated"
  );
}

function isRealtimeActivityEvent(value: unknown): value is RealtimeActivityEvent {
  return (
    value === "signal_landed" ||
    value === "copy_submitted" ||
    value === "copy_executed" ||
    value === "settlement_posted" ||
    value === "hot_hand_updated"
  );
}

function isRealtimeActivityPayload(
  event: RealtimeActivityEvent,
  value: unknown
): boolean {
  if (!isRecord(value)) {
    return false;
  }

  switch (event) {
    case "signal_landed":
      return hasOnlyKeys(value, ["signal"]) && isReplaySignal(value.signal);
    case "copy_submitted":
      return (
        hasOnlyKeys(value, ["copy"]) &&
        isRealtimeCopyActivity(value.copy, "submitted")
      );
    case "copy_executed":
      return (
        hasOnlyKeys(value, ["copy"]) &&
        isRealtimeCopyActivity(value.copy, "executed")
      );
    case "settlement_posted":
      return hasOnlyKeys(value, ["settlement"]) && isReplaySettlement(value.settlement);
    case "hot_hand_updated":
      return hasOnlyKeys(value, ["hotHand"]) && isRealtimeHotHand(value.hotHand);
  }
}

function isReplaySignal(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      "signalId",
      "leaderId",
      "oracleId",
      "market",
      "direction",
      "strike",
      "expiryMs",
      "confidenceBps",
      "createdAtMs",
      "status",
      "thesis"
    ]) &&
    isNonEmptyString(value.signalId) &&
    isNonEmptyString(value.leaderId) &&
    isNonEmptyString(value.oracleId) &&
    isNonEmptyString(value.market) &&
    (value.direction === "up" || value.direction === "down") &&
    isFiniteJsonNumber(value.strike) &&
    isTimestampMs(value.expiryMs) &&
    isBasisPoints(value.confidenceBps) &&
    isTimestampMs(value.createdAtMs) &&
    isSignalStatus(value.status) &&
    optionalStringValue(value.thesis)
  );
}

function isRealtimeCopyActivity(
  value: unknown,
  status: "submitted" | "executed"
): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      "receiptId",
      "signalId",
      "followerId",
      "leaderId",
      "copiedCost",
      "cumulativeCopiedVolume",
      "status"
    ]) &&
    isNonEmptyString(value.receiptId) &&
    isNonEmptyString(value.signalId) &&
    isNonEmptyString(value.followerId) &&
    isNonEmptyString(value.leaderId) &&
    isFiniteNonNegativeNumber(value.copiedCost) &&
    isFiniteNonNegativeNumber(value.cumulativeCopiedVolume) &&
    value.status === status
  );
}

function isReplaySettlement(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["signalId", "leaderId", "status", "settlementPrice", "pnl"]) &&
    isNonEmptyString(value.signalId) &&
    isNonEmptyString(value.leaderId) &&
    isSettlementStatus(value.status) &&
    isFiniteJsonNumber(value.settlementPrice) &&
    isFiniteJsonNumber(value.pnl)
  );
}

function isRealtimeHotHand(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      "leaderChanged",
      "currentLeaderId",
      "previousLeaderId",
      "score"
    ]) &&
    typeof value.leaderChanged === "boolean" &&
    isNonEmptyString(value.currentLeaderId) &&
    optionalNonEmptyStringValue(value.previousLeaderId) &&
    isReplayLeader(value.score)
  );
}

function isReplayLeader(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      "rank",
      "traderId",
      "handle",
      "displayName",
      "avatarUrl",
      "hotScore",
      "roi",
      "pnl",
      "hitRate",
      "resolvedCount",
      "winStreak",
      "copiedVolume",
      "freshnessScore",
      "label"
    ]) &&
    isCount(value.rank) &&
    isNonEmptyString(value.traderId) &&
    isNonEmptyString(value.handle) &&
    isNonEmptyString(value.displayName) &&
    optionalStringValue(value.avatarUrl) &&
    isHotScore(value.hotScore) &&
    isFiniteJsonNumber(value.roi) &&
    isFiniteJsonNumber(value.pnl) &&
    isFiniteNonNegativeNumber(value.hitRate) &&
    isCount(value.resolvedCount) &&
    isCount(value.winStreak) &&
    isFiniteNonNegativeNumber(value.copiedVolume) &&
    isFiniteNonNegativeNumber(value.freshnessScore) &&
    isNonEmptyString(value.label)
  );
}

function isErrorCode(value: unknown): value is ErrorMessage["code"] {
  return value === "bad_json" || value === "bad_message" || value === "unsupported_message";
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isTimestampMs(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function optionalNonEmptyStringValue(value: unknown): boolean {
  return value === undefined || isNonEmptyString(value);
}

function optionalStringValue(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isBasisPoints(value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 10_000;
}

function isSignalStatus(value: unknown): boolean {
  return (
    value === "posted" ||
    value === "copyable" ||
    value === "expired" ||
    value === "settled_win" ||
    value === "settled_loss" ||
    value === "voided"
  );
}

function isSettlementStatus(value: unknown): boolean {
  return value === "settled_win" || value === "settled_loss" || value === "voided";
}

function isFiniteJsonNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isFiniteNonNegativeNumber(value: unknown): boolean {
  return isFiniteJsonNumber(value) && value >= 0;
}

function isHotScore(value: unknown): value is number {
  return isFiniteJsonNumber(value) && value >= 0;
}

function optionalHotScore(value: unknown): boolean {
  return value === undefined || isHotScore(value);
}

function optionalLeaderCountsMatch(value: unknown, armedCount: number): boolean {
  if (value === undefined) {
    return true;
  }

  if (!isRecord(value)) {
    return false;
  }

  let total = 0;
  for (const [leaderId, count] of Object.entries(value)) {
    if (!isNonEmptyString(leaderId) || !isCount(count)) {
      return false;
    }
    total += count;
  }

  return total === armedCount;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
