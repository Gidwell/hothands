import { defineConfig, devices } from "@playwright/test";

const pwaPort = Number(process.env.HOT_HANDS_E2E_WORKER_LIVE_PWA_PORT ?? 4175);
const workerPort = Number(
  process.env.HOT_HANDS_E2E_WORKER_LIVE_WORKER_PORT ?? 8788,
);
const baseURL = `http://127.0.0.1:${pwaPort}`;
const workerBaseURL = `http://127.0.0.1:${workerPort}`;

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
      command: "bun run support/worker-live-server.ts",
      url: `${workerBaseURL}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
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
