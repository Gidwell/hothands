#!/usr/bin/env bun
export {};

type SpawnedProcess = {
  exited: Promise<number>;
  kill: (signal?: string) => void;
  pid: number;
};

declare const Bun: {
  file: (path: string) => { exists: () => Promise<boolean> };
  spawn: (
    command: string[],
    options: {
      cwd?: string;
      env?: Record<string, string | undefined>;
      stdin?: "inherit" | "pipe";
      stdout?: "inherit" | "pipe";
      stderr?: "inherit" | "pipe";
    },
  ) => SpawnedProcess;
};

declare const process: {
  cwd: () => string;
  env: Record<string, string | undefined>;
  exit: (code?: number) => never;
  on: (event: "SIGINT" | "SIGTERM", listener: () => void) => void;
  stdout: { write: (text: string) => void };
  stderr: { write: (text: string) => void };
};

const repoRoot = decodeURIComponent(new URL("../../..", import.meta.url).pathname);
const workerPort = Number(process.env.HOT_HANDS_LIVE_WORKER_PORT ?? 8788);
const pwaPort = Number(process.env.HOT_HANDS_LIVE_PWA_PORT ?? 5175);
const workerUrl = `http://127.0.0.1:${workerPort}`;
const pwaUrl = `http://127.0.0.1:${pwaPort}`;

const nodeBin = await resolveNodeBin();
const worker = Bun.spawn(
  [
    nodeBin,
    "node_modules/wrangler/bin/wrangler.js",
    "dev",
    "--cwd",
    "apps/api-worker",
    "--ip",
    "127.0.0.1",
    "--port",
    String(workerPort),
    "--local",
    "--log-level",
    "error",
    "--show-interactive-dev-session=false",
  ],
  {
    cwd: repoRoot,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  },
);

await waitForHealth(`${workerUrl}/health`);

const pwa = Bun.spawn(
  [
    "bun",
    "run",
    "--cwd",
    "apps/pwa",
    "dev",
    "--",
    "--host",
    "127.0.0.1",
    "--port",
    String(pwaPort),
  ],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      VITE_HOT_HANDS_API_URL: workerUrl,
    },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  },
);

process.stdout.write(
  [
    "",
    "Hot Hands live demo is starting.",
    `PWA:    ${pwaUrl}`,
    `Worker: ${workerUrl}`,
    "",
    "Push fixture activity from another terminal with:",
    "bun run demo:push-activity opening-night",
    "",
  ].join("\n"),
);

let shuttingDown = false;
const stopLiveDemo = () => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  pwa.kill("SIGTERM");
  worker.kill("SIGTERM");
};

process.on("SIGINT", () => {
  stopLiveDemo();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stopLiveDemo();
  process.exit(0);
});

const exitCode = await Promise.race([worker.exited, pwa.exited]);
stopLiveDemo();
process.exit(exitCode);

async function resolveNodeBin(): Promise<string> {
  if (process.env.HOT_HANDS_E2E_NODE_PATH) {
    return process.env.HOT_HANDS_E2E_NODE_PATH;
  }

  const home = process.env.HOME;
  if (home) {
    const bundledNode = `${home}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`;
    if (await Bun.file(bundledNode).exists()) {
      return bundledNode;
    }
  }

  return "node";
}

async function waitForHealth(url: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until Wrangler opens the local port.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  worker.kill("SIGTERM");
  throw new Error(`Timed out waiting for worker health at ${url}`);
}
