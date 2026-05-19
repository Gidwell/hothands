import type { RealtimeActivityTraceItem } from "@hot-hands/shared";
import { produceRealtimeActivityTraceById } from "./index";

export type PushActivityOptions = {
  scenarioId: string;
  workerUrl: string;
  tableId?: string;
  step?: number;
  from: number;
  count?: number;
  intervalMs: number;
  fetchImpl?: typeof fetch;
  sleep?: (durationMs: number) => Promise<void>;
};

export type ParsedPushActivityArgs = {
  scenarioId: string;
  workerUrl: string;
  tableId?: string;
  step?: number;
  from: number;
  count?: number;
  intervalMs: number;
};

export type PushActivityResult = {
  scenarioId: string;
  tableId: string;
  workerUrl: string;
  postedCount: number;
  postedEvents: RealtimeActivityTraceItem["event"][];
};

export function parsePushActivityArgs(
  args: string[],
  env: Record<string, string | undefined> = {},
): ParsedPushActivityArgs {
  const scenarioId = args.find((arg) => !arg.startsWith("--")) ?? "opening-night";

  return {
    scenarioId,
    workerUrl:
      readStringFlag(args, "--worker-url") ??
      env.HOT_HANDS_WORKER_URL ??
      "http://127.0.0.1:8788",
    tableId: readStringFlag(args, "--table-id") ?? env.HOT_HANDS_TABLE_ID,
    step: readNumberFlag(args, "--step"),
    from: readNumberFlag(args, "--from") ?? 0,
    count: readNumberFlag(args, "--count"),
    intervalMs: readNumberFlag(args, "--interval-ms") ?? 650,
  };
}

export async function pushRealtimeActivity({
  scenarioId,
  workerUrl,
  tableId,
  step,
  from,
  count,
  intervalMs,
  fetchImpl = fetch,
  sleep = defaultSleep,
}: PushActivityOptions): Promise<PushActivityResult> {
  const trace = produceRealtimeActivityTraceById(scenarioId);
  const selectedItems = selectActivityItems(trace, { step, from, count });
  const resolvedTableId = tableId ?? selectedItems[0]?.tableId ?? trace[0]?.tableId;

  if (!resolvedTableId) {
    throw new Error(`Scenario ${scenarioId} has no table activity to push.`);
  }

  const endpoint = buildActivityEndpoint(workerUrl, resolvedTableId);
  for (const [index, item] of selectedItems.entries()) {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify([item]),
    });

    if (!response.ok) {
      throw new Error(
        `Worker rejected ${item.event} (${response.status}): ${await response.text()}`,
      );
    }

    if (intervalMs > 0 && index < selectedItems.length - 1) {
      await sleep(intervalMs);
    }
  }

  return {
    scenarioId,
    tableId: resolvedTableId,
    workerUrl,
    postedCount: selectedItems.length,
    postedEvents: selectedItems.map((item) => item.event),
  };
}

export function buildActivityEndpoint(workerUrl: string, tableId: string): string {
  const url = new URL(workerUrl);
  url.pathname = joinPathSegments(url.pathname, "tables", tableId, "activity");
  url.search = "";
  url.hash = "";

  return url.toString();
}

function selectActivityItems(
  trace: RealtimeActivityTraceItem[],
  {
    step,
    from,
    count,
  }: {
    step?: number;
    from: number;
    count?: number;
  },
): RealtimeActivityTraceItem[] {
  if (step !== undefined) {
    const item = trace[step];
    if (!item) {
      throw new Error(`No activity step ${step}. Trace has ${trace.length} items.`);
    }

    return [item];
  }

  const selectedItems = trace.slice(from, count === undefined ? undefined : from + count);
  if (selectedItems.length === 0) {
    throw new Error(`No activity items selected from ${from}. Trace has ${trace.length} items.`);
  }

  return selectedItems;
}

function readStringFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
}

function readNumberFlag(args: string[], flag: string): number | undefined {
  const value = readStringFlag(args, flag);
  if (value === undefined) {
    return undefined;
  }

  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw new Error(`${flag} must be a non-negative integer.`);
  }

  return numberValue;
}

function joinPathSegments(...segments: string[]): string {
  const path = segments
    .map((segment) => segment.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");

  return `/${path}`;
}

function defaultSleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}
