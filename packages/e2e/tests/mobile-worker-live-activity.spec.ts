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
