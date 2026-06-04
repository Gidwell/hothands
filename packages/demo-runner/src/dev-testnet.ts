#!/usr/bin/env bun
import {
  buildDevProcessState,
  devProcessStatePath,
  formatRepoPathWarning,
} from "./dev-process-state";
import { parseHotHandsDevPids } from "./dev-cleanup";
import { resolveDevTestnetConfig } from "./dev-testnet-config";

export {};

type SpawnedProcess = {
  exited: Promise<number>;
  kill: (signal?: string) => void;
  pid: number;
};

type ManagedProcess = {
  command: string[];
  exited: boolean;
  name: string;
  process: SpawnedProcess;
};

declare const Bun: {
  spawn: (
    command: string[],
    options: {
      cwd?: string;
      detached?: boolean;
      env?: Record<string, string | undefined>;
      stdin?: "inherit" | "pipe";
      stdout?: "inherit" | "pipe";
      stderr?: "inherit" | "pipe";
    },
  ) => SpawnedProcess;
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
  write: (path: string, value: string) => Promise<number>;
};

declare const process: {
  cwd: () => string;
  env: Record<string, string | undefined>;
  exit: (code?: number) => never;
  kill: (pid: number, signal?: string) => void;
  on: (event: "SIGINT" | "SIGTERM", listener: () => void) => void;
  pid: number;
  stdout: { write: (text: string) => void };
  stderr: { write: (text: string) => void };
};

const repoRoot = decodeURIComponent(new URL("../../..", import.meta.url).pathname);
const config = resolveDevTestnetConfig(process.env);
const processes: ManagedProcess[] = [];
let shuttingDown = false;
const repoPathWarning = formatRepoPathWarning(repoRoot);

if (repoPathWarning) {
  process.stderr.write(`${repoPathWarning}\n`);
}

let api: SpawnedProcess | null = null;
let pwa: SpawnedProcess | null = null;
let liveIndexer: SpawnedProcess | null = null;

try {
  process.stdout.write("Starting Hot Hands testnet dev...\n");

  api = spawnManaged("api", config.apiCommand, {
    HOST: config.apiHost,
    HOT_HANDS_TESTNET_API_PORT: String(config.apiPort),
  }).process;
  await writeDevState();
  await waitForManagedHttp({
    process: api,
    serviceName: "testnet API",
    url: `${config.apiUrl}/health`,
  });

  pwa = spawnManaged("pwa", config.pwaCommand, {
    VITE_HOT_HANDS_API_URL: config.apiUrl,
  }).process;
  await writeDevState();
  await waitForManagedHttp({
    process: pwa,
    serviceName: "PWA",
    url: config.pwaUrl,
  });

  liveIndexer = config.liveIndexerCommand
    ? spawnManaged("indexer", config.liveIndexerCommand).process
    : null;
  await writeDevState();

  process.stdout.write(formatReadyMessage(liveIndexer !== null));
} catch (error) {
  await stopTestnetDev();
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

async function stopTestnetDev() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  for (const managed of [...processes].reverse()) {
    signalManagedProcess(managed, "SIGTERM");
  }

  await waitForProcesses(processes, 1_500);

  for (const managed of [...processes].reverse()) {
    if (!managed.exited) {
      signalManagedProcess(managed, "SIGKILL");
    }
  }

  await stopFallbackDevProcesses();
}

process.on("SIGINT", () => {
  void stopTestnetDev().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void stopTestnetDev().finally(() => process.exit(0));
});

const exitCode = await Promise.race(
  [api?.exited, pwa?.exited, liveIndexer?.exited].filter(
    (exited): exited is Promise<number> => Boolean(exited),
  ),
);
await stopTestnetDev();
process.exit(exitCode);

function spawnManaged(
  name: string,
  command: string[],
  env: Record<string, string | undefined> = {},
): ManagedProcess {
  const managed = {
    command,
    exited: false,
    name,
    process: Bun.spawn(command, {
      cwd: repoRoot,
      detached: true,
      env: {
        ...process.env,
        ...env,
        HOT_HANDS_DEV_PROCESS: name,
      },
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    }),
  };

  void managed.process.exited.finally(() => {
    managed.exited = true;
  });
  processes.push(managed);
  return managed;
}

async function writeDevState() {
  const state = buildDevProcessState({
    config,
    processes: processes.map((managed) => ({
      command: managed.command,
      name: managed.name,
      pid: managed.process.pid,
    })),
    repoRoot,
  });

  await Bun.write(devProcessStatePath(repoRoot), `${JSON.stringify(state, null, 2)}\n`);
}

function signalManagedProcess(managed: ManagedProcess, signal: string) {
  let signaled = false;
  try {
    process.kill(-managed.process.pid, signal);
    signaled = true;
  } catch {
    // Some local runtimes do not put detached Bun children in a Unix process
    // group. Fall through and signal the child PID directly.
  }

  try {
    process.kill(managed.process.pid, signal);
    signaled = true;
  } catch {
    // Bun's child handle can still know how to signal the process when
    // process.kill cannot.
  }

  try {
    managed.process.kill(signal);
    signaled = true;
  } catch {
    // Report below if every signal path failed.
  }

  if (!signaled) {
    try {
      managed.process.kill(signal);
    } catch (error) {
      process.stderr.write(
        `Unable to ${signal} ${managed.name} (${managed.process.pid}): ${
          error instanceof Error ? error.message : String(error)
        }\n`,
      );
    }
  }
}

async function stopFallbackDevProcesses() {
  const pids = parseHotHandsDevPids(currentPsOutput(), {
    apiPort: config.apiPort,
    pwaPort: config.pwaPort,
    repoRoot,
  }).filter((pid) => pid !== process.pid);

  if (pids.length === 0) {
    return;
  }

  for (const pid of pids) {
    signalPid(pid, "SIGTERM", { quiet: true });
  }

  await new Promise((resolve) => setTimeout(resolve, 500));

  for (const pid of pids) {
    signalPid(pid, "SIGKILL", { quiet: true });
  }
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

async function waitForProcesses(
  managedProcesses: readonly ManagedProcess[],
  timeoutMs: number,
): Promise<void> {
  await Promise.race([
    Promise.allSettled(managedProcesses.map((managed) => managed.process.exited)),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

async function waitForManagedHttp({
  process: managedProcess,
  serviceName,
  url,
}: {
  process: SpawnedProcess;
  serviceName: string;
  url: string;
}): Promise<void> {
  const startup = await Promise.race([
    waitForHttp(url).then(() => ({ status: "ready" as const })),
    managedProcess.exited.then((code) => ({ status: "exited" as const, code })),
  ]);

  if (startup.status === "exited") {
    throw new Error(`${serviceName} exited before ${url} became reachable (code ${startup.code}).`);
  }
}

async function waitForHttp(url: string): Promise<void> {
  const deadline = Date.now() + config.readinessTimeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the local Bun API opens the port.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(formatReadinessTimeoutMessage(url));
}

function formatReadinessTimeoutMessage(url: string): string {
  return [
    `Timed out after ${config.readinessTimeoutMs}ms waiting for ${url}.`,
    "The dev launcher will shut down the partial stack. Run `bun run dev:cleanup` if a port still looks stuck.",
    repoPathWarning,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function formatReadyMessage(indexerEnabled: boolean): string {
  return [
    "",
    "Hot Hands testnet dev is ready.",
    `PWA:         ${config.pwaUrl}`,
    `API:         ${config.apiUrl}`,
    `Indexer:     ${indexerEnabled ? "live" : "disabled"}`,
    `Market heat: ${config.apiUrl}/testnet/market-heat`,
    `Status:      ${config.apiUrl}/testnet/indexer-status`,
    "",
    `Pidfile:     ${devProcessStatePath(repoRoot)}`,
    "Cleanup:     bun run dev:cleanup",
    "Override ports with HOT_HANDS_TESTNET_API_PORT and HOT_HANDS_TESTNET_PWA_PORT.",
    "",
  ].join("\n");
}
