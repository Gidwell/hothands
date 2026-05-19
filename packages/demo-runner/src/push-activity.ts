#!/usr/bin/env bun
import { parsePushActivityArgs, pushRealtimeActivity } from "./live-demo";

declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exitCode?: number;
  stdout: { write: (text: string) => void };
  stderr: { write: (text: string) => void };
};

try {
  const options = parsePushActivityArgs(process.argv.slice(2), process.env);
  const result = await pushRealtimeActivity(options);

  process.stdout.write(
    [
      `Pushed ${result.postedCount} activity item(s) to ${result.tableId}.`,
      `Worker: ${result.workerUrl}`,
      `Events: ${result.postedEvents.join(", ")}`,
    ].join("\n"),
  );
  process.stdout.write("\n");
} catch (error) {
  process.exitCode = 1;
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
}
