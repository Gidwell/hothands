import type { DemoScenario } from "../../shared/src/index";
import { openingNightScenario } from "./opening-night";
import { trapStreakScenario } from "./trap-streak";

export { openingNightScenario, trapStreakScenario };

export const scenarios = {
  "opening-night": openingNightScenario,
  "trap-streak": trapStreakScenario,
} satisfies Record<string, DemoScenario>;

export type ScenarioId = keyof typeof scenarios;

export function getScenario(scenarioId: string): DemoScenario {
  const scenario = scenarios[scenarioId as ScenarioId];
  if (!scenario) {
    const known = Object.keys(scenarios).join(", ");
    throw new Error(`Unknown scenario "${scenarioId}". Known scenarios: ${known}`);
  }

  return scenario;
}
