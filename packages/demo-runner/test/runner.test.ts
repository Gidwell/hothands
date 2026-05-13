import { describe, expect, test } from "bun:test";
import { loadScenario, produceTrace, produceTraceById } from "../src/index";

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
