import { describe, expect, test } from "bun:test";
import { createFakeSpectatorSimulation } from "../src/fake-spectator-simulation";

describe("fake spectator table simulation", () => {
  test("keeps summary and per-leader armed counts stable through joins, pings, disarms, and leaves", () => {
    const simulation = createFakeSpectatorSimulation("btc-usd-stage-1", {
      nowMs: 1_000,
      spectatorCount: 48
    });

    simulation.joinAll();
    expect(simulation.summary()).toMatchObject({
      tableId: "btc-usd-stage-1",
      spectatorCount: 48,
      armedCount: 0,
      perLeaderArmedCounts: {}
    });
    expect(simulation.eventCounts()).toEqual({
      spectator_joined: 48,
      spectator_left: 0,
      copy_armed: 0,
      copy_disarmed: 0,
      copy_rearmed: 0,
      hot_score_updated: 0
    });

    simulation.pingAll(3);
    expect(simulation.summary()).toMatchObject({
      spectatorCount: 48,
      armedCount: 0,
      perLeaderArmedCounts: {}
    });
    expect(simulation.eventCounts()).toEqual({
      spectator_joined: 48,
      spectator_left: 0,
      copy_armed: 0,
      copy_disarmed: 0,
      copy_rearmed: 0,
      hot_score_updated: 0
    });
    expect(simulation.heartbeatNoopCount()).toBe(144);

    simulation.armRange(0, 18, "leader-btc-up");
    simulation.armRange(18, 30, "leader-btc-down");
    simulation.armRange(30, 36, "leader-btc-up");
    expect(simulation.summary()).toMatchObject({
      spectatorCount: 48,
      armedCount: 36,
      perLeaderArmedCounts: {
        "leader-btc-down": 12,
        "leader-btc-up": 24
      }
    });

    const afterArming = simulation.snapshot();
    simulation.pingAll(2);
    expect(simulation.summary()).toEqual(afterArming.summary);
    expect(simulation.eventCounts()).toEqual(afterArming.eventCounts);
    expect(simulation.heartbeatNoopCount()).toBe(240);

    simulation.rearmRange(4, 10, "leader-btc-down");
    expect(simulation.summary()).toMatchObject({
      spectatorCount: 48,
      armedCount: 36,
      perLeaderArmedCounts: {
        "leader-btc-down": 18,
        "leader-btc-up": 18
      }
    });

    simulation.disarmRange(18, 24);
    simulation.leaveRange(36, 48);
    simulation.leaveRange(0, 4);

    expect(simulation.summary()).toMatchObject({
      spectatorCount: 32,
      armedCount: 26,
      perLeaderArmedCounts: {
        "leader-btc-down": 12,
        "leader-btc-up": 14
      }
    });
    expect(simulation.eventCounts()).toEqual({
      spectator_joined: 48,
      spectator_left: 16,
      copy_armed: 36,
      copy_disarmed: 10,
      copy_rearmed: 6,
      hot_score_updated: 0
    });
  });
});
