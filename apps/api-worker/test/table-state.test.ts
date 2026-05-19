import { describe, expect, test } from "bun:test";
import { chooseHeartbeatPolicyForSummary, HEARTBEAT_POLICY } from "../src/heartbeat";
import {
  addSession,
  armCopy,
  createTableState,
  disarmCopy,
  getSession,
  removeSession,
  setTableHotScore,
  summarizeTableState
} from "../src/table-state";

describe("pure table state", () => {
  test("arms copy for a specific leader and rearming does not inflate counts", () => {
    const state = createTableState("table-1", { nowMs: 1000 });

    addSession(state, {
      sessionId: "socket-1",
      spectatorId: "spectator-1",
      nowMs: 1100
    });

    const armed = armCopy(state, "socket-1", "leader-a", 1200);
    expect(armed.events).toEqual(["copy_armed"]);
    expect(armed.summary).toMatchObject({
      spectatorCount: 1,
      armedCount: 1,
      perLeaderArmedCounts: { "leader-a": 1 },
      updatedAtMs: 1200
    });
    expect(getSession(state, "socket-1")?.armedLeaderId).toBe("leader-a");

    const rearmed = armCopy(state, "socket-1", "leader-b", 1300);
    expect(rearmed.events).toEqual(["copy_rearmed"]);
    expect(rearmed.summary).toMatchObject({
      spectatorCount: 1,
      armedCount: 1,
      perLeaderArmedCounts: { "leader-b": 1 },
      updatedAtMs: 1300
    });
    expect(getSession(state, "socket-1")?.armedLeaderId).toBe("leader-b");
  });

  test("disarm and leave decrement bounded counts and per-leader counts", () => {
    const state = createTableState("table-1", { nowMs: 1000 });

    addSession(state, {
      sessionId: "socket-1",
      spectatorId: "spectator-1",
      nowMs: 1100
    });
    addSession(state, {
      sessionId: "socket-2",
      spectatorId: "spectator-2",
      nowMs: 1100
    });
    armCopy(state, "socket-1", "leader-a", 1200);
    armCopy(state, "socket-2", "leader-a", 1200);

    const disarmed = disarmCopy(state, "socket-1", 1300);
    expect(disarmed.events).toEqual(["copy_disarmed"]);
    expect(disarmed.summary).toMatchObject({
      spectatorCount: 2,
      armedCount: 1,
      perLeaderArmedCounts: { "leader-a": 1 }
    });

    const left = removeSession(state, "socket-2", 1400);
    expect(left.events).toEqual(["copy_disarmed", "spectator_left"]);
    expect(left.summary).toMatchObject({
      spectatorCount: 1,
      armedCount: 0,
      perLeaderArmedCounts: {}
    });

    const missing = removeSession(state, "socket-2", 1500);
    expect(missing.events).toEqual([]);
    expect(missing.summary).toMatchObject({
      spectatorCount: 1,
      armedCount: 0,
      perLeaderArmedCounts: {}
    });
  });

  test("table state objects are isolated by room", () => {
    const tableA = createTableState("table-a", { nowMs: 1000 });
    const tableB = createTableState("table-b", { nowMs: 1000 });

    addSession(tableA, {
      sessionId: "socket-1",
      spectatorId: "spectator-1",
      nowMs: 1100
    });
    armCopy(tableA, "socket-1", "leader-a", 1200);

    addSession(tableB, {
      sessionId: "socket-1",
      spectatorId: "spectator-1",
      nowMs: 1100
    });

    expect(summarizeTableState(tableA)).toMatchObject({
      tableId: "table-a",
      spectatorCount: 1,
      armedCount: 1,
      perLeaderArmedCounts: { "leader-a": 1 }
    });
    expect(summarizeTableState(tableB)).toMatchObject({
      tableId: "table-b",
      spectatorCount: 1,
      armedCount: 0,
      perLeaderArmedCounts: {}
    });
  });

  test("heartbeat policy can read table summary counts and hot score", () => {
    const state = createTableState("table-1", {
      nowMs: 1000,
      hotScore: HEARTBEAT_POLICY.hotScoreThreshold
    });
    addSession(state, {
      sessionId: "socket-1",
      spectatorId: "spectator-1",
      nowMs: 1100
    });

    const policy = chooseHeartbeatPolicyForSummary(summarizeTableState(state), 120_000);

    expect(policy).toEqual({
      tier: "hot",
      intervalMs: HEARTBEAT_POLICY.fastIntervalMs
    });
  });

  test("hot score changes produce a broadcastable table delta", () => {
    const state = createTableState("table-1", {
      nowMs: 1000,
      hotScore: 12
    });

    const changed = setTableHotScore(state, 88.5, 1100);

    expect(changed.events).toEqual(["hot_score_updated"]);
    expect(changed.summary).toMatchObject({
      hotScore: 88.5,
      updatedAtMs: 1100
    });

    const unchanged = setTableHotScore(state, 88.5, 1200);
    expect(unchanged.events).toEqual([]);
    expect(unchanged.summary).toMatchObject({
      hotScore: 88.5,
      updatedAtMs: 1100
    });
  });
});
