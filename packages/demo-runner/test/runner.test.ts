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
});
