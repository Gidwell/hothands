#!/usr/bin/env bun
import {
  devProcessStatePath,
  parseDevProcessState,
  type DevProcessState,
} from "./dev-process-state";
import { resolveDevTestnetConfig } from "./dev-testnet-config";

declare const Bun: {
  file: (path: string) => {
    exists: () => Promise<boolean>;
    text: () => Promise<string>;
  };
  spawnSync: (
    command: string[],
    options?: {
      stderr?: "pipe";
      stdout?: "pipe";
    },
  ) => {
    exitCode: number;
    stderr: Uint8Array;
    stdout: Uint8Array;
  };
};

declare const process: {
  argv: string[];
  cwd: () => string;
  env: Record<string, string | undefined>;
  exitCode?: number;
  kill: (pid: number, signal?: string) => void;
  stderr: { write: (text: string) => void };
  stdout: { write: (text: string) => void };
};

export function parseLsofPids(output: string): number[] {
  const pids = new Set<number>();

  for (const line of output.split("\n").slice(1)) {
    const columns = line.trim().split(/\s+/);
    const pid = Number(columns[1]);
    if (Number.isInteger(pid) && pid > 0) {
      pids.add(pid);
    }
  }

  return [...pids].sort((left, right) => left - right);
}

export function parseHotHandsDevPids(
  output: string,
  {
    apiPort,
    pwaPort,
    repoRoot,
  }: {
    apiPort: number;
    pwaPort: number;
    repoRoot: string;
  },
): number[] {
  const pids = new Set<number>();

  for (const { command, pid } of parsePsRows(output)) {
    if (isHotHandsDevCommand(command, { apiPort, pwaPort })) {
      pids.add(pid);
      continue;
    }

    if (isRepoLocalEsbuildService(command, repoRoot)) {
      pids.add(pid);
    }
  }

  return [...pids].sort((left, right) => left - right);
}

export function parseDevStatePids(text: string): number[] {
  const state = parseDevProcessState(text);
  if (!state) {
    return [];
  }

  return state.processes
    .map((processRecord) => processRecord.pid)
    .sort((left, right) => left - right);
}

export function parsePsRows(output: string): Array<{ command: string; pid: number }> {
  const rows: Array<{ command: string; pid: number }> = [];

  for (const line of output.split("\n")) {
    const match = line.trim().match(/^(\d+)\s+\d+\s+(.+)$/);
    if (!match) {
      continue;
    }

    const pid = Number(match[1]);
    const command = match[2] ?? "";
    if (Number.isInteger(pid) && pid > 0) {
      rows.push({ command, pid });
    }
  }

  return rows;
}

function listenerPidsForPort(port: number): number[] {
  const result = Bun.spawnSync(
    ["lsof", "-nP", `-iTCP:${port}`, "-sTCP:LISTEN"],
    { stdout: "pipe", stderr: "pipe" },
  );

  if (result.exitCode !== 0) {
    return [];
  }

  return parseLsofPids(new TextDecoder().decode(result.stdout));
}

export function collectLateListenerPids({
  cleanupPorts,
  knownPids,
  listenerPidsForPort,
}: {
  cleanupPorts: number[];
  knownPids: number[];
  listenerPidsForPort: (port: number) => number[];
}): number[] {
  const known = new Set(knownPids);
  const latePids = new Set<number>();

  for (const port of cleanupPorts) {
    for (const pid of listenerPidsForPort(port)) {
      if (!known.has(pid)) {
        latePids.add(pid);
      }
    }
  }

  return [...latePids].sort((left, right) => left - right);
}

function hotHandsDevPids({
  apiPort,
  pwaPort,
  psOutput,
  repoRoot,
}: {
  apiPort: number;
  pwaPort: number;
  psOutput: string;
  repoRoot: string;
}): number[] {
  return parseHotHandsDevPids(psOutput, {
    apiPort,
    pwaPort,
    repoRoot,
  });
}

async function devStatePids({
  psOutput,
  repoRoot,
}: {
  psOutput: string;
  repoRoot: string;
}): Promise<number[]> {
  const stateFile = Bun.file(devProcessStatePath(repoRoot));
  if (!(await stateFile.exists())) {
    return [];
  }

  const state = parseDevProcessState(await stateFile.text());
  if (!state) {
    return [];
  }

  return filterStatePidsStillMatchingPs(state, psOutput);
}

function currentPsOutput(): string {
  const result = Bun.spawnSync(["ps", "-axo", "pid,ppid,command", "-ww"], {
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode !== 0) {
    return "";
  }

  return new TextDecoder().decode(result.stdout);
}

async function main() {
  const config = resolveDevTestnetConfig(process.env);
  const repoRoot = process.cwd();
  const psOutput = currentPsOutput();
  const pids = new Set<number>();

  for (const pid of await devStatePids({ psOutput, repoRoot })) {
    pids.add(pid);
  }
  for (const port of config.cleanupPorts) {
    for (const pid of listenerPidsForPort(port)) {
      pids.add(pid);
    }
  }
  for (const pid of hotHandsDevPids({
    apiPort: config.apiPort,
    pwaPort: config.pwaPort,
    psOutput,
    repoRoot,
  })) {
    pids.add(pid);
  }

  if (pids.size === 0) {
    process.stdout.write("No Hot Hands dev listeners found.\n");
    return;
  }

  const sortedPids = [...pids].sort((left, right) => left - right);
  process.stdout.write(`Stopping Hot Hands dev listeners: ${sortedPids.join(", ")}\n`);

  for (const pid of sortedPids) {
    signalPid(pid, "SIGTERM");
  }

  const allPids = new Set(sortedPids);

  for (let pass = 0; pass < 12; pass += 1) {
    await new Promise((resolve) => setTimeout(resolve, pass === 0 ? 750 : 500));

    const latePids = collectLateListenerPids({
      cleanupPorts: config.cleanupPorts,
      knownPids: [...allPids],
      listenerPidsForPort,
    });

    if (!latePids.length) {
      break;
    }

    process.stdout.write(
      `Stopping late Hot Hands dev listeners: ${latePids.join(", ")}\n`,
    );
    for (const pid of latePids) {
      allPids.add(pid);
      signalPid(pid, "SIGTERM");
    }
  }

  for (const pid of [...allPids].sort((left, right) => left - right)) {
    signalPid(pid, "SIGKILL", { quiet: true });
  }
}

function isHotHandsDevCommand(
  command: string,
  {
    apiPort,
    pwaPort,
  }: {
    apiPort: number;
    pwaPort: number;
  },
): boolean {
  if (command.includes("packages/indexer/src/live.ts")) {
    return true;
  }

  if (
    command.includes("apps/pwa") &&
    command.includes("dev") &&
    command.includes("--port") &&
    command.includes(String(pwaPort))
  ) {
    return true;
  }

  if (
    command.includes("node_modules/.bin/vite") &&
    command.includes("--port") &&
    command.includes(String(pwaPort))
  ) {
    return true;
  }

  if (
    command.includes("node_modules/vite/bin/vite.js") &&
    command.includes("--port") &&
    command.includes(String(pwaPort))
  ) {
    return true;
  }

  return command.includes("packages/demo-runner/src/dev-testnet.ts");
}

function isRepoLocalEsbuildService(command: string, repoRoot: string): boolean {
  const normalizedRepoRoot = repoRoot.replace(/\/+$/, "");
  return (
    command.includes(`${normalizedRepoRoot}/node_modules/`) &&
    command.includes("esbuild") &&
    command.includes("--service=")
  );
}

function filterStatePidsStillMatchingPs(
  state: DevProcessState,
  psOutput: string,
): number[] {
  const rowsByPid = new Map(parsePsRows(psOutput).map((row) => [row.pid, row.command]));
  const pids = new Set<number>();

  for (const processRecord of state.processes) {
    const command = rowsByPid.get(processRecord.pid);
    if (!command) {
      continue;
    }

    if (
      commandIncludesExpectedParts(command, processRecord.command) ||
      isRepoLocalEsbuildService(command, state.cwd)
    ) {
      pids.add(processRecord.pid);
    }
  }

  return [...pids].sort((left, right) => left - right);
}

function commandIncludesExpectedParts(command: string, expectedParts: string[]): boolean {
  return expectedParts.every((part) => command.includes(part));
}

function signalPid(
  pid: number,
  signal: string,
  { quiet = false }: { quiet?: boolean } = {},
) {
  try {
    process.kill(pid, signal);
  } catch (error) {
    if (!quiet) {
      process.stderr.write(
        `Unable to ${signal} ${pid}: ${
          error instanceof Error ? error.message : String(error)
        }\n`,
      );
    }
  }
}

if ((import.meta as ImportMeta & { main?: boolean }).main) {
  try {
    await main();
  } catch (error) {
    process.exitCode = 1;
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  }
}
