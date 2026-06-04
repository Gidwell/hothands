#!/usr/bin/env bun
import { resolveDevTestnetConfig } from "./dev-testnet-config";

export {};

type SpawnedProcess = {
  exited: Promise<number>;
  kill: (signal?: string) => void;
  pid: number;
};

declare const Bun: {
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
};

const repoRoot = decodeURIComponent(new URL("../../..", import.meta.url).pathname);
const config = resolveDevTestnetConfig(process.env);

const api = Bun.spawn(["bun", "run", "--cwd", "apps/api-worker", "dev:testnet"], {
  cwd: repoRoot,
  env: {
    ...process.env,
    HOST: config.apiHost,
    HOT_HANDS_TESTNET_API_PORT: String(config.apiPort),
  },
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});

try {
  const apiStartup = await Promise.race([
    waitForHealth(`${config.apiUrl}/health`).then(() => ({ status: "ready" as const })),
    api.exited.then((code) => ({ status: "exited" as const, code })),
  ]);

  if (apiStartup.status === "exited") {
    throw new Error(
      `Testnet API dev server exited before health check passed (code ${apiStartup.code}).`,
    );
  }
} catch (error) {
  api.kill("SIGTERM");
  throw error;
}

const pwa = Bun.spawn(
  [
    "bun",
    "run",
    "--cwd",
    "apps/pwa",
    "dev",
    "--",
    "--host",
    config.pwaHost,
    "--port",
    String(config.pwaPort),
  ],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      VITE_HOT_HANDS_API_URL: config.apiUrl,
    },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  },
);

const liveIndexer = config.liveIndexerCommand
  ? Bun.spawn(config.liveIndexerCommand, {
      cwd: repoRoot,
      env: process.env,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    })
  : null;

process.stdout.write(
  [
    "",
    "Hot Hands testnet dev is starting.",
    `PWA:         ${config.pwaUrl}`,
    `API:         ${config.apiUrl}`,
    `Indexer:     ${liveIndexer ? "live" : "disabled"}`,
    `Market heat: ${config.apiUrl}/testnet/market-heat`,
    `Status:      ${config.apiUrl}/testnet/indexer-status`,
    "",
    "Override ports with HOT_HANDS_TESTNET_API_PORT and HOT_HANDS_TESTNET_PWA_PORT.",
    "",
  ].join("\n"),
);

let shuttingDown = false;
const stopTestnetDev = () => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  pwa.kill("SIGTERM");
  api.kill("SIGTERM");
  liveIndexer?.kill("SIGTERM");
};

process.on("SIGINT", () => {
  stopTestnetDev();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stopTestnetDev();
  process.exit(0);
});

const exitCode = await Promise.race(
  [api.exited, pwa.exited, liveIndexer?.exited].filter(
    (exited): exited is Promise<number> => Boolean(exited),
  ),
);
stopTestnetDev();
process.exit(exitCode);

async function waitForHealth(url: string): Promise<void> {
  const deadline = Date.now() + 30_000;
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

  throw new Error(`Timed out waiting for testnet API health at ${url}`);
}
