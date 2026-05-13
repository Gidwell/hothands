export const HEARTBEAT_POLICY = {
  emptyIntervalMs: 30_000,
  quietIntervalMs: 15_000,
  activeIntervalMs: 5_000,
  fastIntervalMs: 1_000,
  activeWindowMs: 10_000,
  hotScoreThreshold: 80
} as const;

export type HeartbeatTier = "empty" | "quiet" | "active" | "armed" | "hot";

export interface HeartbeatPolicyInput {
  spectatorCount: number;
  armedCount: number;
  hotScore: number;
  updatedAtMs: number;
  nowMs: number;
}

export interface HeartbeatPolicyDecision {
  tier: HeartbeatTier;
  intervalMs: number;
}

export function chooseHeartbeatPolicy(input: HeartbeatPolicyInput): HeartbeatPolicyDecision {
  assertValidHeartbeatInput(input);

  if (input.spectatorCount === 0) {
    return { tier: "empty", intervalMs: HEARTBEAT_POLICY.emptyIntervalMs };
  }

  if (input.armedCount > 0) {
    return { tier: "armed", intervalMs: HEARTBEAT_POLICY.fastIntervalMs };
  }

  if (input.hotScore >= HEARTBEAT_POLICY.hotScoreThreshold) {
    return { tier: "hot", intervalMs: HEARTBEAT_POLICY.fastIntervalMs };
  }

  const idleMs = Math.max(0, input.nowMs - input.updatedAtMs);
  if (idleMs <= HEARTBEAT_POLICY.activeWindowMs) {
    return { tier: "active", intervalMs: HEARTBEAT_POLICY.activeIntervalMs };
  }

  return { tier: "quiet", intervalMs: HEARTBEAT_POLICY.quietIntervalMs };
}

function assertValidHeartbeatInput(input: HeartbeatPolicyInput): void {
  if (
    !isCount(input.spectatorCount) ||
    !isCount(input.armedCount) ||
    input.armedCount > input.spectatorCount ||
    !Number.isFinite(input.hotScore) ||
    input.hotScore < 0 ||
    !isTimestampMs(input.updatedAtMs) ||
    !isTimestampMs(input.nowMs)
  ) {
    throw new Error("Invalid heartbeat policy input");
  }
}

function isCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isTimestampMs(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}
