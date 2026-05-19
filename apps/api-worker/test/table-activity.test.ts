import { describe, expect, test } from "bun:test";
import type { RealtimeActivityTraceItem } from "@hot-hands/shared";
import { TableRoom, type Env } from "../src/index";
import { createTableActivityBroadcast } from "../src/table-activity";
import { addSession, armCopy, createTableState, summarizeTableState } from "../src/table-state";
import type { ServerMessage } from "../src/protocol";

describe("table activity broadcast projection", () => {
  test("emits the simulated table activity lifecycle in order and only updates hot score state", () => {
    const state = createTableState("table-1", { nowMs: 1_000, hotScore: 12 });
    addSession(state, {
      sessionId: "socket-1",
      spectatorId: "spectator-1",
      nowMs: 1_100
    });
    armCopy(state, "socket-1", "leader-1", 1_200);

    const before = summarizeTableState(state);
    const broadcast = createTableActivityBroadcast(state, lifecycleTrace());

    expect(broadcast.messages.map((message) => message.type)).toEqual([
      "table_activity",
      "table_activity",
      "table_activity",
      "table_activity",
      "table_activity",
      "table_delta"
    ]);
    expect(
      broadcast.messages
        .filter((message): message is RealtimeActivityTraceItem => message.type === "table_activity")
        .map((message) => message.event)
    ).toEqual([
      "signal_landed",
      "copy_submitted",
      "copy_executed",
      "settlement_posted",
      "hot_hand_updated"
    ]);
    expect(broadcast.messages.at(-1)).toMatchObject({
      type: "table_delta",
      tableId: "table-1",
      event: "hot_score_updated",
      spectatorCount: before.spectatorCount,
      armedCount: before.armedCount,
      perLeaderArmedCounts: before.perLeaderArmedCounts,
      hotScore: 88.5
    });
    expect(broadcast.summary).toMatchObject({
      spectatorCount: before.spectatorCount,
      armedCount: before.armedCount,
      perLeaderArmedCounts: before.perLeaderArmedCounts,
      hotScore: 88.5
    });
  });

  test("rejects activity for another table before broadcast", () => {
    const state = createTableState("table-1", { nowMs: 1_000 });

    expect(() =>
      createTableActivityBroadcast(state, [
        tableActivity({
          tableId: "table-2",
          event: "signal_landed",
          payload: { signal: signalPayload() }
        })
      ])
    ).toThrow("Activity tableId does not match table state");
  });

  test("does not mutate table state when a later activity item is invalid", () => {
    const state = createTableState("table-1", { nowMs: 1_000, hotScore: 12 });

    expect(() =>
      createTableActivityBroadcast(state, [
        tableActivity({
          sequence: 0,
          event: "hot_hand_updated",
          hotScore: 88.5,
          payload: {
            hotHand: {
              leaderChanged: true,
              currentLeaderId: "leader-1",
              score: leaderScore()
            }
          }
        }),
        tableActivity({
          sequence: 1,
          tableId: "table-2",
          event: "signal_landed",
          payload: { signal: signalPayload() }
        })
      ])
    ).toThrow("Activity tableId does not match table state");

    expect(summarizeTableState(state)).toMatchObject({
      hotScore: 12,
      updatedAtMs: 1_000
    });
  });

  test("rejects out-of-order activity sequence before broadcast", () => {
    const state = createTableState("table-1", { nowMs: 1_000 });

    expect(() =>
      createTableActivityBroadcast(state, [
        tableActivity({ sequence: 2 }),
        tableActivity({ sequence: 1 })
      ])
    ).toThrow("Activity sequence must be ordered");
  });

  test("does not emit an extra hot score delta when the score is unchanged", () => {
    const state = createTableState("table-1", { nowMs: 1_000, hotScore: 88.5 });
    const broadcast = createTableActivityBroadcast(state, [
      tableActivity({
        sequence: 0,
        event: "hot_hand_updated",
        hotScore: 88.5,
        payload: {
          hotHand: {
            leaderChanged: false,
            currentLeaderId: "leader-1",
            score: leaderScore()
          }
        }
      })
    ]);

    expect(broadcast.messages.map((message) => message.type)).toEqual([
      "table_activity"
    ]);
    expect(broadcast.summary).toMatchObject({
      hotScore: 88.5,
      updatedAtMs: 1_000
    });
  });

  test("accepts activity through the Durable Object activity endpoint", async () => {
    const room = createTableRoom("table-1");
    const response = await room.fetch(
      new Request("https://table-room/activity", {
        method: "POST",
        body: JSON.stringify(lifecycleTrace())
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      activityCount: 5,
      broadcastCount: 6,
      table: {
        tableId: "table-1",
        spectatorCount: 0,
        armedCount: 0,
        hotScore: 88.5
      }
    });
  });
});

function createTableRoom(tableId: string): TableRoom {
  return new TableRoom(
    {
      id: {
        name: tableId,
        toString: () => tableId
      }
    } as DurableObjectState,
    {} as Env
  );
}

function lifecycleTrace(): RealtimeActivityTraceItem[] {
  return [
    tableActivity({
      sequence: 0,
      sourceSequence: 1,
      event: "signal_landed",
      payload: { signal: signalPayload() }
    }),
    tableActivity({
      sequence: 1,
      sourceSequence: 2,
      event: "copy_submitted",
      label: "Vee Moss submitted copy for Alpha Cruz",
      actorId: "follower-vee",
      followerId: "follower-vee",
      receiptId: "copy-1",
      payload: { copy: copyPayload("submitted") }
    }),
    tableActivity({
      sequence: 2,
      sourceSequence: 2,
      event: "copy_executed",
      label: "Vee Moss copy executed",
      actorId: "follower-vee",
      followerId: "follower-vee",
      receiptId: "copy-1",
      payload: { copy: copyPayload("executed") }
    }),
    tableActivity({
      sequence: 3,
      sourceSequence: 3,
      event: "settlement_posted",
      label: "Alpha Cruz signal settled",
      payload: {
        settlement: {
          signalId: "signal-1",
          leaderId: "leader-1",
          status: "settled_win",
          settlementPrice: 65_500,
          pnl: 42.25
        }
      }
    }),
    tableActivity({
      sequence: 4,
      sourceSequence: 4,
      event: "hot_hand_updated",
      label: "Alpha Cruz hot score updated",
      hotScore: 88.5,
      payload: {
        hotHand: {
          leaderChanged: true,
          currentLeaderId: "leader-1",
          previousLeaderId: "leader-0",
          score: leaderScore()
        }
      }
    })
  ];
}

function tableActivity(
  overrides: Partial<Extract<ServerMessage, { type: "table_activity" }>> = {}
): RealtimeActivityTraceItem {
  return {
    type: "table_activity",
    source: "fixture_replay",
    sequence: 0,
    sourceSequence: 1,
    atMs: 2_000,
    tableId: "table-1",
    event: "signal_landed",
    label: "Alpha Cruz posted UP BTC-USD",
    actorId: "leader-1",
    leaderId: "leader-1",
    signalId: "signal-1",
    spectatorCount: 1,
    armedCount: 1,
    payload: { signal: signalPayload() },
    ...overrides
  };
}

function signalPayload() {
  return {
    signalId: "signal-1",
    leaderId: "leader-1",
    oracleId: "btc-15m",
    market: "BTC-USD",
    direction: "up" as const,
    strike: 65_000,
    expiryMs: 2_900,
    confidenceBps: 7_200,
    createdAtMs: 2_000,
    status: "copyable" as const,
    thesis: "Continuation after pullback."
  };
}

function copyPayload(status: "submitted" | "executed") {
  return {
    receiptId: "copy-1",
    signalId: "signal-1",
    followerId: "follower-vee",
    leaderId: "leader-1",
    copiedCost: 120,
    cumulativeCopiedVolume: 120,
    status
  };
}

function leaderScore() {
  return {
    rank: 1,
    traderId: "leader-1",
    handle: "alpha",
    displayName: "Alpha Cruz",
    hotScore: 88.5,
    roi: 0.24,
    pnl: 80,
    hitRate: 1,
    resolvedCount: 1,
    winStreak: 1,
    copiedVolume: 120,
    freshnessScore: 0.95,
    label: "Hot Hand" as const
  };
}
