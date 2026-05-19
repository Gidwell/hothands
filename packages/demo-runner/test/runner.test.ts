import { describe, expect, test } from "bun:test";
import {
  loadScenario,
  produceRealtimeActivityTrace,
  produceReplayFrames,
  produceTrace,
  produceTraceById,
} from "../src/index";

describe("demo runner trace", () => {
  test("produces an ordered trace for opening night", () => {
    const trace = produceTraceById("opening-night");

    expect(trace).toHaveLength(loadScenario("opening-night").steps.length);
    expect(trace.map((event) => event.sequence)).toEqual(
      trace.map((_, index) => index),
    );
    expect(trace.at(-1)?.action).toBe("snapshot_emitted");
  });

  test("flags trap streak in the final snapshot", () => {
    const trace = produceTrace(loadScenario("trap-streak"));
    const finalEvent = trace.at(-1);

    expect(finalEvent?.action).toBe("snapshot_emitted");
    if (!finalEvent || !("snapshot" in finalEvent.payload)) {
      throw new Error("Expected final snapshot payload");
    }

    expect(finalEvent.payload.snapshot.leaders[0]?.label).toBe("Trap Streak");
  });

  test("emits score update snapshots where the hot hand leader changes", () => {
    const trace = produceTrace(loadScenario("hot-hand-swing"));
    const scoreUpdates = trace.filter((event) => event.action === "score_updated");

    expect(scoreUpdates).toHaveLength(3);

    const leadingTraderIds = scoreUpdates.map((event) => {
      if (!("snapshot" in event.payload)) {
        throw new Error("Expected score update snapshot payload");
      }

      return event.payload.snapshot.leaders[0]?.traderId;
    });

    expect(leadingTraderIds).toEqual([
      "trader-alpha",
      "trader-alpha",
      "trader-beta",
    ]);

    const leaderChangeFlags = scoreUpdates.map((event) => {
      if (!("leaderChanged" in event.payload)) {
        throw new Error("Expected score update leader change flag");
      }

      return event.payload.leaderChanged;
    });

    expect(leaderChangeFlags).toEqual([false, false, true]);

    const finalScoreUpdate = scoreUpdates.at(-1);
    if (!finalScoreUpdate || !("snapshot" in finalScoreUpdate.payload)) {
      throw new Error("Expected final score update snapshot payload");
    }

    expect(finalScoreUpdate.payload.snapshot.leaders.map((leader) => leader.traderId)).toEqual([
      "trader-beta",
      "trader-alpha",
    ]);
  });
});

describe("demo replay frames", () => {
  test("produces one browser-safe frame per hot hand swing trace event", () => {
    const scenario = loadScenario("hot-hand-swing");
    const frames = produceReplayFrames(scenario);

    expect(frames).toHaveLength(scenario.steps.length);
    expect(frames.map((frame) => frame.sequence)).toEqual(
      scenario.steps.map((_, index) => index),
    );
    expect(frames.map((frame) => frame.activity.action)).toEqual(
      scenario.steps.map((step) => step.action),
    );
    expect(frames.map((frame) => frame.state.asOfMs)).toEqual(
      scenario.steps.map((step) => step.atMs),
    );
    expect(JSON.parse(JSON.stringify(frames))).toEqual(frames);
  });

  test("carries copy activity and table state for PWA animation", () => {
    const frames = produceReplayFrames(loadScenario("hot-hand-swing"));
    const copyFrame = frames.find((frame) =>
      frame.activity.action === "copy_executed"
    );

    expect(copyFrame?.phase).toBe("copy");
    expect(copyFrame?.activity.label).toBe("Vee Moss copied Alpha Cruz");
    expect(copyFrame?.activity.copy).toEqual({
      receiptId: "copy-alpha-1",
      signalId: "sig-alpha-1",
      followerId: "follower-vee",
      leaderId: "trader-alpha",
      copiedCost: 120,
      cumulativeCopiedVolume: 120,
    });
    expect(copyFrame?.state.spectators).toBe(1);
    expect(copyFrame?.state.activeSignals.map((signal) => signal.signalId)).toEqual([
      "sig-alpha-1",
    ]);
  });

  test("exposes concise settlement activity labels", () => {
    const frames = produceReplayFrames(loadScenario("hot-hand-swing"));
    const settlementFrame = frames.find((frame) =>
      frame.activity.action === "signal_settled" &&
      frame.activity.signalId === "sig-alpha-1"
    );

    expect(settlementFrame?.phase).toBe("settlement");
    expect(settlementFrame?.activity.label).toBe("Alpha Cruz won +80");
    expect(settlementFrame?.activity.settlement).toEqual({
      signalId: "sig-alpha-1",
      leaderId: "trader-alpha",
      status: "settled_win",
      settlementPrice: 65280,
      pnl: 80,
    });
    expect(settlementFrame?.state.activeSignals.map((signal) => signal.signalId)).toEqual([]);
  });

  test("marks the beta swing frame as the leader change", () => {
    const frames = produceReplayFrames(loadScenario("hot-hand-swing"));
    const betaSwingFrame = frames.find((frame) =>
      frame.activity.action === "score_updated" &&
      frame.activity.actorId === "trader-beta" &&
      frame.state.leaderChanged
    );

    expect(betaSwingFrame?.sequence).toBe(10);
    expect(betaSwingFrame?.phase).toBe("score");
    expect(betaSwingFrame?.activity.label).toBe("Beta Shah moved into first");
    expect(betaSwingFrame?.state.currentLeader?.traderId).toBe("trader-beta");
    expect(betaSwingFrame?.state.previousLeader?.traderId).toBe("trader-alpha");
    expect(betaSwingFrame?.state.rankedLeaders.map((leader) => leader.traderId)).toEqual([
      "trader-beta",
      "trader-alpha",
    ]);
  });

  test("keeps ranked leaders deterministic across frames", () => {
    const frames = produceReplayFrames(loadScenario("hot-hand-swing"));

    expect(frames[0]?.state.rankedLeaders.map(summaryForRank)).toEqual([
      {
        rank: 1,
        traderId: "trader-alpha",
        handle: "alpha",
        displayName: "Alpha Cruz",
        hotScore: 7.5,
        label: "Cold",
      },
      {
        rank: 2,
        traderId: "trader-beta",
        handle: "beta",
        displayName: "Beta Shah",
        hotScore: 7.5,
        label: "Cold",
      },
    ]);

    expect(frames.at(-1)?.state.rankedLeaders.map(summaryForRank)).toEqual([
      {
        rank: 1,
        traderId: "trader-beta",
        handle: "beta",
        displayName: "Beta Shah",
        hotScore: 61,
        label: "Heating Up",
      },
      {
        rank: 2,
        traderId: "trader-alpha",
        handle: "alpha",
        displayName: "Alpha Cruz",
        hotScore: 56.37,
        label: "Warming",
      },
    ]);
  });
});

describe("realtime activity trace adapter", () => {
  test("projects hot hand swing replay into JSON-safe Stage 2 activity items", () => {
    const items = produceRealtimeActivityTrace(loadScenario("hot-hand-swing"));

    expect(items.map((item) => item.event)).toEqual([
      "signal_landed",
      "copy_submitted",
      "copy_executed",
      "settlement_posted",
      "hot_hand_updated",
      "signal_landed",
      "settlement_posted",
      "hot_hand_updated",
      "signal_landed",
      "settlement_posted",
      "hot_hand_updated",
    ]);
    expect(JSON.parse(JSON.stringify(items))).toEqual(items);

    const signalItem = items[0];
    expect(signalItem).toEqual({
      type: "table_activity",
      source: "fixture_replay",
      sequence: 0,
      sourceSequence: 1,
      atMs: 1_786_575_610_000,
      tableId: "btc-15m",
      event: "signal_landed",
      label: "Alpha Cruz posted UP BTC-USD",
      actorId: "trader-alpha",
      leaderId: "trader-alpha",
      signalId: "sig-alpha-1",
      spectatorCount: 1,
      armedCount: 0,
      payload: {
        signal: {
          signalId: "sig-alpha-1",
          leaderId: "trader-alpha",
          oracleId: "btc-15m",
          market: "BTC-USD",
          direction: "up",
          strike: 65_000,
          expiryMs: 1_786_575_900_000,
          confidenceBps: 7_200,
          createdAtMs: 1_786_575_610_000,
          status: "copyable",
          thesis: "High-conviction continuation after the first pullback.",
        },
      },
    });

    const copySubmittedItem = items.find((item) => item.event === "copy_submitted");
    expect(copySubmittedItem).toEqual({
      type: "table_activity",
      source: "fixture_replay",
      sequence: 1,
      sourceSequence: 2,
      atMs: 1_786_575_620_000,
      tableId: "btc-15m",
      event: "copy_submitted",
      label: "Vee Moss submitted copy for Alpha Cruz",
      actorId: "follower-vee",
      leaderId: "trader-alpha",
      followerId: "follower-vee",
      signalId: "sig-alpha-1",
      receiptId: "copy-alpha-1",
      spectatorCount: 1,
      armedCount: 0,
      payload: {
        copy: {
          receiptId: "copy-alpha-1",
          signalId: "sig-alpha-1",
          followerId: "follower-vee",
          leaderId: "trader-alpha",
          copiedCost: 120,
          cumulativeCopiedVolume: 120,
          status: "submitted",
        },
      },
    });

    const copyExecutedItem = items.find((item) => item.event === "copy_executed");
    expect(copyExecutedItem?.payload).toEqual({
      copy: {
        receiptId: "copy-alpha-1",
        signalId: "sig-alpha-1",
        followerId: "follower-vee",
        leaderId: "trader-alpha",
        copiedCost: 120,
        cumulativeCopiedVolume: 120,
        status: "executed",
      },
    });

    const settlementItem = items.find((item) =>
      item.event === "settlement_posted" &&
      item.signalId === "sig-alpha-1"
    );
    expect(settlementItem?.payload).toEqual({
      settlement: {
        signalId: "sig-alpha-1",
        leaderId: "trader-alpha",
        status: "settled_win",
        settlementPrice: 65_280,
        pnl: 80,
      },
    });

    const hotHandItem = items.find((item) =>
      item.event === "hot_hand_updated" &&
      item.leaderId === "trader-beta"
    );
    expect(hotHandItem).toMatchObject({
      event: "hot_hand_updated",
      label: "Beta Shah moved into first",
      actorId: "trader-beta",
      leaderId: "trader-beta",
      hotScore: 61,
      payload: {
        hotHand: {
          leaderChanged: true,
          currentLeaderId: "trader-beta",
          previousLeaderId: "trader-alpha",
          score: {
            traderId: "trader-beta",
            hotScore: 61,
            pnl: 40,
            label: "Heating Up",
          },
        },
      },
    });
  });
});

function summaryForRank(leader: {
  rank: number;
  traderId: string;
  handle: string;
  displayName: string;
  hotScore: number;
  label: string;
}) {
  return {
    rank: leader.rank,
    traderId: leader.traderId,
    handle: leader.handle,
    displayName: leader.displayName,
    hotScore: leader.hotScore,
    label: leader.label,
  };
}
