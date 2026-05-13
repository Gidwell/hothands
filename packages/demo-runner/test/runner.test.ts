import { describe, expect, test } from "bun:test";
import {
  loadScenario,
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
