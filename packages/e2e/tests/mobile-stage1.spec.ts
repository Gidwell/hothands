import { expect, test } from "@playwright/test";

test("mobile stage 1.5 discovery keeps hot traders and inline copy visible", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("market-header")).toBeVisible();
  await expect(page.getByTestId("active-signal-strip")).toBeVisible();

  const hotTraderRows = page.getByTestId("hot-trader-row");
  await expect(async () => {
    expect(await hotTraderRows.count()).toBeGreaterThanOrEqual(3);
  }).toPass();

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  for (let index = 0; index < 3; index += 1) {
    const row = hotTraderRows.nth(index);
    await expect(row).toBeVisible();
    await expect(row.getByTestId("copy-trigger")).toBeVisible();

    const box = await row.boundingBox();
    expect(box, `hot trader row ${index + 1} should have a layout box`).not.toBeNull();
    expect(box!.y, `hot trader row ${index + 1} should start inside the first viewport`).toBeGreaterThanOrEqual(0);
    expect(
      box!.y + box!.height,
      `hot trader row ${index + 1} should fit inside the first viewport`,
    ).toBeLessThanOrEqual(viewport!.height);
  }

  const firstRow = hotTraderRows.first();
  await firstRow.getByTestId("copy-trigger").click();

  const inlineCopyPanel = page.getByTestId("inline-copy-panel");
  await expect(inlineCopyPanel).toBeVisible();
  await expect(inlineCopyPanel.getByTestId("arm-copy-button")).toBeVisible();

  await expect(
    firstRow.evaluate((row) => {
      const panel = document.querySelector('[data-testid="inline-copy-panel"]');
      const next = row.nextElementSibling;

      return Boolean(panel && (row.contains(panel) || next === panel || next?.contains(panel)));
    }),
    "inline copy panel should render directly inside or after the selected trader row",
  ).resolves.toBe(true);

  const firstRowBox = await firstRow.boundingBox();
  const panelBox = await inlineCopyPanel.boundingBox();
  expect(firstRowBox, "selected trader row should still have a layout box").not.toBeNull();
  expect(panelBox, "inline copy panel should have a layout box").not.toBeNull();
  expect(panelBox!.y).toBeGreaterThanOrEqual(firstRowBox!.y);

  const spectatorRail = page.getByTestId("spectator-rail");
  await expect(spectatorRail).toBeVisible();

  const spectatorBox = await spectatorRail.boundingBox();
  expect(spectatorBox, "spectator rail should have a layout box").not.toBeNull();
  expect(spectatorBox!.height).toBeLessThan(viewport!.height * 0.5);
});

test("mobile stage 1 copy loop reaches settlement and leaderboard update", async ({ page }) => {
  await page.goto("/");
  const signalStrip = page.getByTestId("active-signal-strip");
  const leaderboard = page.getByRole("region", { name: "Hot leaderboard" });
  const firstTrader = page.getByTestId("hot-trader-row").first();

  await expect(page.getByRole("heading", { name: "Hot Hands" })).toBeVisible();
  await expect(page.getByTestId("market-header")).toContainText("BTC-USD");
  await expect(signalStrip).toBeVisible();
  await expect(leaderboard).toContainText("Copy the next BTC UP/DOWN signal");

  await expect(page.getByTestId("spectator-rail")).toBeVisible();
  await expect(page.getByLabel("IC watching")).toBeVisible();
  await expect(page.getByLabel("SP watching")).toBeVisible();

  await page.getByRole("button", { name: "Reset" }).click();
  await expect(signalStrip.getByText("Copy armed")).toBeVisible();

  await firstTrader.getByTestId("copy-trigger").click();
  const inlineCopyPanel = page.getByTestId("inline-copy-panel");
  await expect(inlineCopyPanel).toBeVisible();

  await page.getByRole("button", { name: "$500" }).click();
  await expect(inlineCopyPanel).toContainText("$500");

  await inlineCopyPanel.getByTestId("arm-copy-button").click();
  await expect(inlineCopyPanel.getByTestId("arm-copy-button")).toHaveText("Arm copy");
  await inlineCopyPanel.getByTestId("arm-copy-button").click();
  await expect(inlineCopyPanel).toBeHidden();
  await expect(firstTrader).toContainText("Armed");

  await page.getByRole("button", { name: "Next" }).click();
  await expect(signalStrip.getByText("Leader signal landed")).toBeVisible();
  await expect(signalStrip.getByText(/posted BTC (UP|DOWN)/).first()).toBeVisible();

  await page.getByRole("button", { name: "Next" }).click();
  await expect(signalStrip.getByText("Copy executed")).toBeVisible();
  await expect(signalStrip.getByText("$500 copied to BTC ticket")).toBeVisible();
  await expect(firstTrader).toContainText("Copied");

  await page.getByRole("button", { name: "Next" }).click();
  await expect(signalStrip.getByText("Settlement posted")).toBeVisible();
  await expect(signalStrip.getByText("Settlement posts +$40")).toBeVisible();

  await page.getByRole("button", { name: "Next" }).click();
  await expect(signalStrip.getByText("Hot hand updated")).toBeVisible();
  await expect(signalStrip.getByText("Mira Vale tops the leaderboard")).toBeVisible();
  await expect(page.getByLabel("Mira Vale hot score 50")).toBeVisible();
});
