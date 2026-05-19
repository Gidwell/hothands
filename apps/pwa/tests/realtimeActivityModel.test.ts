import { describe, expect, test } from "bun:test";
import { produceRealtimeActivityTraceById } from "@hot-hands/demo-runner";
import {
  applyRealtimeActivityItem,
  applyRealtimeActivityTrace,
  createInitialRealtimeActivityState,
} from "../src/realtimeActivityModel";

describe("simulated realtime activity model", () => {
  test("adapts fixture replay activity into a one-shot copy lifecycle", () => {
    const trace = produceRealtimeActivityTraceById("opening-night");

    expect(trace.every((item) => item.source === "fixture_replay")).toBe(true);
    const firstCycle = trace.slice(0, 5);

    expect(firstCycle.map((item) => item.event)).toEqual([
      "signal_landed",
      "copy_submitted",
      "copy_executed",
      "settlement_posted",
      "hot_hand_updated",
    ]);

    let state = createInitialRealtimeActivityState();

    state = applyRealtimeActivityItem(state, firstCycle[0]);
    expect(state).toMatchObject({
      source: "fixture_replay",
      handStatus: "signal_landed",
      isAutoplaying: false,
      isAutoArmed: false,
      latestActivity: {
        event: "signal_landed",
        source: "fixture_replay",
      },
      activeSignal: {
        signalId: "sig-open-1",
        leaderId: "trader-mira",
        market: "BTC-USD",
      },
      openCopyConfirmations: [
        {
          signalId: "sig-open-1",
          leaderId: "trader-mira",
          source: "fixture_replay",
        },
      ],
    });

    state = applyRealtimeActivityItem(state, firstCycle[1]);
    expect(state).toMatchObject({
      handStatus: "copy_submitted",
      copy: {
        receiptId: "copy-open-1",
        signalId: "sig-open-1",
        status: "submitted",
        copiedCost: 20,
      },
      openCopyConfirmations: [],
    });

    state = applyRealtimeActivityItem(state, firstCycle[2]);
    expect(state.copy).toMatchObject({
      receiptId: "copy-open-1",
      status: "executed",
    });

    state = applyRealtimeActivityItem(state, firstCycle[3]);
    expect(state).toMatchObject({
      handStatus: "settlement_posted",
      settlement: {
        signalId: "sig-open-1",
        leaderId: "trader-mira",
        pnl: 40,
        status: "settled_win",
      },
    });

    state = applyRealtimeActivityItem(state, firstCycle[4]);
    expect(state).toMatchObject({
      handStatus: "hot_hand_updated",
      hotScoreUpdates: [
        {
          leaderId: "trader-mira",
          leaderName: "Mira Vale",
          hotScore: 50,
          source: "fixture_replay",
        },
      ],
    });
  });

  test("can adapt a full trace in one pass without changing copy intent", () => {
    const state = applyRealtimeActivityTrace(
      createInitialRealtimeActivityState(),
      produceRealtimeActivityTraceById("opening-night"),
    );

    expect(state.isAutoplaying).toBe(false);
    expect(state.isAutoArmed).toBe(false);
    expect(state.openCopyConfirmations).toEqual([]);
    expect(state.latestActivity).toMatchObject({
      event: "settlement_posted",
      source: "fixture_replay",
      sequence: 11,
    });
  });
});
