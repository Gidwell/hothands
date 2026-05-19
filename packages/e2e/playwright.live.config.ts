import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.HOT_HANDS_E2E_LIVE_PORT ?? 4174);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests",
  testMatch: /mobile-live-activity\.spec\.ts/,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: `bun run --cwd ../../apps/pwa dev -- --host 127.0.0.1 --port ${port}`,
    env: {
      VITE_HOT_HANDS_API_URL: "https://worker.example.test/live",
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    {
      name: "mobile-chrome",
      use: {
        ...devices["Pixel 7"],
      },
    },
  ],
});
