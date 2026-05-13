#!/usr/bin/env bun
import { produceTraceById } from "./index";

declare const process: {
  argv: string[];
  exitCode?: number;
  stdout: { write: (text: string) => void };
  stderr: { write: (text: string) => void };
};

const scenarioId = process.argv[2] ?? "opening-night";

try {
  const trace = produceTraceById(scenarioId);
  process.stdout.write(`${JSON.stringify(trace, null, 2)}\n`);
} catch (error) {
  process.exitCode = 1;
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
}
