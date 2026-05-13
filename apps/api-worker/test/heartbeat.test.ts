import { describe, expect, test } from "bun:test";
import { HEARTBEAT_POLICY, chooseHeartbeatPolicy } from "../src/heartbeat";

describe("table heartbeat policy", () => {
  test("keeps empty tables cheap", () => {
    const policy = chooseHeartbeatPolicy({
      spectatorCount: 0,
      armedCount: 0,
      hotScore: 0,
      updatedAtMs: 0,
      nowMs: 120_000
    });

    expect(policy).toEqual({
      tier: "empty",
      intervalMs: HEARTBEAT_POLICY.emptyIntervalMs
    });
    expect(policy.intervalMs).toBeGreaterThanOrEqual(30_000);
  });

  test("keeps quiet watched tables slower than active tables", () => {
    const quiet = chooseHeartbeatPolicy({
      spectatorCount: 8,
      armedCount: 0,
      hotScore: 25,
      updatedAtMs: 0,
      nowMs: 120_000
    });
    const active = chooseHeartbeatPolicy({
      spectatorCount: 8,
      armedCount: 0,
      hotScore: 25,
      updatedAtMs: 119_500,
      nowMs: 120_000
    });

    expect(quiet).toEqual({
      tier: "quiet",
      intervalMs: HEARTBEAT_POLICY.quietIntervalMs
    });
    expect(active).toEqual({
      tier: "active",
      intervalMs: HEARTBEAT_POLICY.activeIntervalMs
    });
    expect(quiet.intervalMs).toBeGreaterThan(active.intervalMs);
  });

  test("uses the fastest heartbeat for armed followers and hot tables", () => {
    const armed = chooseHeartbeatPolicy({
      spectatorCount: 12,
      armedCount: 2,
      hotScore: 30,
      updatedAtMs: 0,
      nowMs: 120_000
    });
    const hot = chooseHeartbeatPolicy({
      spectatorCount: 12,
      armedCount: 0,
      hotScore: HEARTBEAT_POLICY.hotScoreThreshold,
      updatedAtMs: 0,
      nowMs: 120_000
    });

    expect(armed).toEqual({
      tier: "armed",
      intervalMs: HEARTBEAT_POLICY.fastIntervalMs
    });
    expect(hot).toEqual({
      tier: "hot",
      intervalMs: HEARTBEAT_POLICY.fastIntervalMs
    });
    expect(armed.intervalMs).toBeLessThanOrEqual(2_000);
    expect(hot.intervalMs).toBeLessThanOrEqual(2_000);
  });
});
