import { describe, expect, test } from "bun:test";
import { getScenario, scenarios } from "../src/index";

describe("scenario fixtures", () => {
  test("exports required Stage 1 fixtures", () => {
    expect(Object.keys(scenarios).sort()).toEqual([
      "opening-night",
      "trap-streak",
    ]);
  });

  test("keeps steps in deterministic chronological order", () => {
    for (const scenario of Object.values(scenarios)) {
      const ordered = [...scenario.steps].sort((a, b) => a.atMs - b.atMs);
      expect(scenario.steps).toEqual(ordered);
    }
  });

  test("loads a scenario by id", () => {
    expect(getScenario("opening-night").title).toBe("Opening Night");
  });
});
