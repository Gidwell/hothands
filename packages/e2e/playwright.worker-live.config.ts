import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pwaPort = Number(process.env.HOT_HANDS_E2E_WORKER_LIVE_PWA_PORT ?? 4175);
const workerPort = Number(
  process.env.HOT_HANDS_E2E_WORKER_LIVE_WORKER_PORT ?? 8788,
);
const baseURL = `http://127.0.0.1:${pwaPort}`;
const workerBaseURL = `http://127.0.0.1:${workerPort}`;
const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(packageRoot, "../..");
const apiWorkerRoot = path.join(repoRoot, "apps/api-worker");
const wranglerBin = path.join(repoRoot, "node_modules/wrangler/bin/wrangler.js");
const nodeBin = resolveNodeBin();

export default defineConfig({
  testDir: "./tests",
  testMatch: /mobile-worker-live-activity\.spec\.ts/,
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: [
        shellQuote(nodeBin),
        shellQuote(wranglerBin),
        "--cwd",
        shellQuote(apiWorkerRoot),
        "dev",
        "--ip",
        "127.0.0.1",
        "--port",
        String(workerPort),
        "--local",
        "--log-level",
        "error",
        "--show-interactive-dev-session=false",
      ].join(" "),
      env: {
        WRANGLER_SEND_METRICS: "false",
      },
      url: `${workerBaseURL}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `bun run --cwd ../../apps/pwa dev -- --host 127.0.0.1 --port ${pwaPort}`,
      env: {
        VITE_HOT_HANDS_API_URL: workerBaseURL,
      },
      url: baseURL,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
  projects: [
    {
      name: "mobile-chrome",
      use: {
        ...devices["Pixel 7"],
      },
    },
  ],
});

function shellQuote(value: string): string {
  return JSON.stringify(value);
}

function resolveNodeBin(): string {
  if (process.env.HOT_HANDS_E2E_NODE_PATH) {
    return process.env.HOT_HANDS_E2E_NODE_PATH;
  }

  const codexBundledNode = path.join(
    os.homedir(),
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node",
  );
  if (existsSync(codexBundledNode)) {
    return codexBundledNode;
  }

  return "node";
}
