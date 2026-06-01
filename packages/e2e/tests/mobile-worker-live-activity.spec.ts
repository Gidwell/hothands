import { expect, test } from "@playwright/test";
import { produceRealtimeActivityTraceById } from "@hot-hands/demo-runner";

const tableId = "btc-15m";
const workerPort = Number(
  process.env.HOT_HANDS_E2E_WORKER_LIVE_WORKER_PORT ?? 8788,
);
const workerBaseURL = `http://127.0.0.1:${workerPort}`;

test("mobile PWA renders worker activity broadcast over a real WebSocket", async ({
  page,
  request,
}) => {
  const [openingActivity] = produceRealtimeActivityTraceById("opening-night");

  await page.goto("/");
  await expect(page.getByTestId("activity-connection-status")).toHaveText("Live");

  const response = await request.post(
    `${workerBaseURL}/tables/${tableId}/activity`,
    {
      data: [openingActivity],
    },
  );

  expect(response.status()).toBe(200);
  await expect(page.getByTestId("spectator-rail")).toHaveAttribute(
    "data-source",
    "worker_realtime",
  );
  await expect(page.getByTestId("spectator-rail")).toContainText(
    openingActivity.label,
  );
});

test("mobile Testnet market heat mode renders worker API rows", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByTestId("market-heat-mode").click();

  const preview = page.getByTestId("market-heat-preview");
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("Captured");
  await expect(preview).toContainText("Alpha Cruz");
  await expect(preview).toContainText("Mina Park");
  await expect(preview).toContainText("Vee Moss");

  const rows = page.getByTestId("market-heat-row");
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText("Strike");
  await expect(rows.first()).toContainText("67.0K");
  await expect(rows.first()).toContainText("Copy now");
  await expect(rows.nth(1)).toContainText("Strike");
  await expect(rows.nth(1)).toContainText("66.0K");
  await expect(rows.nth(1)).toContainText("Watch next");
  await expect(rows.nth(2)).toContainText("Strike");
  await expect(rows.nth(2)).toContainText("68.0K");
});
