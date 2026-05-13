import { describe, expect, test } from "bun:test";
import { applyTableSummaryDelta, type TableSummary } from "../src/protocol";

describe("table summary deltas", () => {
  test("preserve spectator and armed counts across copy lifecycle events", () => {
    const initial: TableSummary = {
      tableId: "table-1",
      spectatorCount: 0,
      armedCount: 0,
      updatedAtMs: 1000
    };

    const joined = applyTableSummaryDelta(initial, "spectator_joined", 1100);
    expect(joined.summary).toEqual({
      tableId: "table-1",
      spectatorCount: 1,
      armedCount: 0,
      updatedAtMs: 1100
    });
    expect(joined.delta).toMatchObject({
      type: "table_delta",
      tableId: "table-1",
      spectatorCount: 1,
      armedCount: 0,
      event: "spectator_joined"
    });

    const armed = applyTableSummaryDelta(joined.summary, "copy_armed", 1200);
    expect(armed.summary.spectatorCount).toBe(1);
    expect(armed.summary.armedCount).toBe(1);
    expect(armed.delta.spectatorCount).toBe(1);
    expect(armed.delta.armedCount).toBe(1);

    const disarmed = applyTableSummaryDelta(armed.summary, "copy_disarmed", 1300);
    expect(disarmed.summary.spectatorCount).toBe(1);
    expect(disarmed.summary.armedCount).toBe(0);
    expect(disarmed.delta.spectatorCount).toBe(1);
    expect(disarmed.delta.armedCount).toBe(0);

    const left = applyTableSummaryDelta(disarmed.summary, "spectator_left", 1400);
    expect(left.summary.spectatorCount).toBe(0);
    expect(left.summary.armedCount).toBe(0);
    expect(left.delta.spectatorCount).toBe(0);
    expect(left.delta.armedCount).toBe(0);
  });

  test("does not emit impossible negative or over-armed counts", () => {
    const empty: TableSummary = {
      tableId: "table-1",
      spectatorCount: 0,
      armedCount: 0,
      updatedAtMs: 1000
    };

    expect(applyTableSummaryDelta(empty, "spectator_left", 1100).summary).toMatchObject({
      spectatorCount: 0,
      armedCount: 0
    });
    expect(applyTableSummaryDelta(empty, "copy_disarmed", 1200).summary).toMatchObject({
      spectatorCount: 0,
      armedCount: 0
    });
    expect(applyTableSummaryDelta(empty, "copy_armed", 1300).summary).toMatchObject({
      spectatorCount: 0,
      armedCount: 0
    });
  });

  test("keeps leader count metadata consistent across rearm, disarm, and leave", () => {
    const active: TableSummary = {
      tableId: "table-1",
      spectatorCount: 3,
      armedCount: 3,
      perLeaderArmedCounts: {
        "leader-a": 2,
        "leader-b": 1
      },
      hotScore: 92,
      updatedAtMs: 1000
    };

    const rearmed = applyTableSummaryDelta(active, "copy_rearmed", 1100);
    expect(rearmed.summary).toMatchObject({
      spectatorCount: 3,
      armedCount: 3,
      perLeaderArmedCounts: {
        "leader-a": 2,
        "leader-b": 1
      },
      hotScore: 92
    });
    expect(totalLeaderArms(rearmed.summary)).toBe(rearmed.summary.armedCount);
    expect(totalLeaderArmsFromDelta(rearmed.delta)).toBe(rearmed.delta.armedCount);

    const disarmed = applyTableSummaryDelta(
      {
        tableId: "table-1",
        spectatorCount: 2,
        armedCount: 2,
        perLeaderArmedCounts: {
          "leader-a": 2
        },
        updatedAtMs: 1200
      },
      "copy_disarmed",
      1300
    );
    expect(disarmed.summary).toMatchObject({
      spectatorCount: 2,
      armedCount: 1,
      perLeaderArmedCounts: {
        "leader-a": 1
      }
    });
    expect(totalLeaderArms(disarmed.summary)).toBe(disarmed.summary.armedCount);
    expect(totalLeaderArmsFromDelta(disarmed.delta)).toBe(disarmed.delta.armedCount);

    const left = applyTableSummaryDelta(
      {
        tableId: "table-1",
        spectatorCount: 2,
        armedCount: 2,
        perLeaderArmedCounts: {
          "leader-a": 2
        },
        updatedAtMs: 1400
      },
      "spectator_left",
      1500
    );
    expect(left.summary).toMatchObject({
      spectatorCount: 1,
      armedCount: 1,
      perLeaderArmedCounts: {
        "leader-a": 1
      }
    });
    expect(left.summary.armedCount).toBeLessThanOrEqual(left.summary.spectatorCount);
    expect(totalLeaderArms(left.summary)).toBe(left.summary.armedCount);
    expect(totalLeaderArmsFromDelta(left.delta)).toBe(left.delta.armedCount);
  });
});

function totalLeaderArms(summary: TableSummary): number | undefined {
  return totalCounts(summary.perLeaderArmedCounts);
}

function totalLeaderArmsFromDelta(
  delta: ReturnType<typeof applyTableSummaryDelta>["delta"]
): number | undefined {
  return totalCounts(delta.perLeaderArmedCounts);
}

function totalCounts(counts: Record<string, number> | undefined): number | undefined {
  if (!counts) {
    return undefined;
  }

  return Object.values(counts).reduce((total, count) => total + count, 0);
}
