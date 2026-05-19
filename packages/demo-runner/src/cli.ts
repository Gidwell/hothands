#!/usr/bin/env bun
import {
  produceRealtimeActivityTraceById,
  produceReplayFramesById,
  produceTraceById,
} from "./index";

declare const process: {
  argv: string[];
  exitCode?: number;
  stdout: { write: (text: string) => void };
  stderr: { write: (text: string) => void };
};

const args = process.argv.slice(2);
const framesMode = args.includes("--frames");
const realtimeMode = args.includes("--realtime");
const scenarioId = args.find((arg) => !arg.startsWith("--")) ?? "opening-night";

try {
  const output = realtimeMode
    ? produceRealtimeActivityTraceById(scenarioId)
    : framesMode
      ? produceReplayFramesById(scenarioId)
      : produceTraceById(scenarioId);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
} catch (error) {
  process.exitCode = 1;
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
}
