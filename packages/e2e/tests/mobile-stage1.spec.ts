import { expect, test, type Locator, type Page } from "@playwright/test";

test("mobile stage 1.5 discovery keeps hot traders and inline copy visible", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("market-header")).toBeVisible();
  await expect(page.getByTestId("active-signal-strip")).toBeVisible();
  await expect(page.getByTestId("active-signal-strip").getByText("Copy ready")).toBeVisible();
  await expect(page.getByTestId("inline-copy-panel")).toHaveCount(0);
  await expect(page.getByTestId("scenario-selector")).toBeHidden();
  await expect(page.getByTestId("replay-next")).toBeHidden();
  await expect(page.getByTestId("replay-reset")).toBeHidden();
  await expect(demoAffordance(page)).toBeVisible();

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
  await expect(inlineCopyPanel.getByTestId("close-copy-panel")).toBeVisible();
  await expect(inlineCopyPanel.getByRole("button", { name: "$100" })).toBeVisible();
  await expect(inlineCopyPanel.getByRole("button", { name: "$250" })).toBeVisible();
  await expect(inlineCopyPanel.getByRole("button", { name: "$500" })).toBeVisible();

  const frozenOrder = await traderNames(hotTraderRows);
  await openDemoControls(page);
  await page.getByTestId("replay-next").click();
  await expect(page.getByTestId("active-signal-strip").getByText("Leader signal landed")).toBeVisible();
  expect(await traderNames(hotTraderRows)).toEqual(frozenOrder);

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

  await inlineCopyPanel.getByTestId("close-copy-panel").click();
  await expect(inlineCopyPanel).toBeHidden();
});

test("mobile stage 1 copy loop reaches settlement and leaderboard update", async ({ page }) => {
  await page.goto("/");
  const signalStrip = page.getByTestId("active-signal-strip");
  const leaderboard = page.getByRole("region", { name: "Hot leaderboard" });
  const miraTrader = page.getByTestId("hot-trader-row").filter({ hasText: "Mira Vale" });

  await expect(page.getByTestId("market-header")).toBeVisible();
  await expect(page.getByTestId("market-header")).toContainText("BTC-USD");
  await expect(signalStrip).toBeVisible();
  await expect(leaderboard).toContainText("Copy the next BTC UP/DOWN signal");

  await expect(page.getByTestId("spectator-rail")).toBeVisible();
  await expect(page.getByTestId("spectator-rail")).toContainText("watching");

  await expect(page.getByTestId("scenario-selector")).toBeHidden();
  await expect(page.getByTestId("replay-next")).toBeHidden();
  await expect(page.getByTestId("replay-reset")).toBeHidden();
  await openDemoControls(page);

  await page.getByTestId("replay-reset").click();
  await expect(signalStrip.getByText("Copy ready")).toBeVisible();

  await expect(miraTrader).toHaveCount(1);
  await miraTrader.getByTestId("copy-trigger").click();
  const inlineCopyPanel = page.getByTestId("inline-copy-panel");
  await expect(inlineCopyPanel).toBeVisible();

  await page.getByRole("button", { name: "$500" }).click();
  await expect(inlineCopyPanel).toContainText("$500");

  await inlineCopyPanel.getByTestId("arm-copy-button").click();
  await expect(inlineCopyPanel.getByTestId("arm-copy-button")).toHaveText("Pause copy");
  await expect(miraTrader).toContainText("Armed");

  await page.getByTestId("replay-next").click();
  await expect(signalStrip.getByText("Leader signal landed")).toBeVisible();
  await expect(signalStrip.getByText(/posted BTC (UP|DOWN)/).first()).toBeVisible();

  await page.getByTestId("replay-next").click();
  await expect(signalStrip.getByText("Copy executed")).toBeVisible();
  await expect(signalStrip.getByText("$500 copied to BTC ticket")).toBeVisible();
  await expect(miraTrader).toContainText("Copied");

  await page.getByTestId("replay-next").click();
  await expect(signalStrip.getByText("Settlement posted")).toBeVisible();
  await expect(signalStrip.getByText("Settlement posts +$40")).toBeVisible();

  await page.getByTestId("replay-next").click();
  await expect(signalStrip.getByText("Hot hand updated")).toBeVisible();
  await expect(signalStrip.getByText("Mira Vale tops the leaderboard")).toBeVisible();
  await expect(miraTrader).toContainText("50");
});

function demoAffordance(page: Page) {
  return page.getByRole("button", { name: /demo/i });
}

async function openDemoControls(page: Page) {
  await demoAffordance(page).click();
  await expect(page.getByTestId("scenario-selector")).toBeVisible();
  await expect(page.getByTestId("replay-next")).toBeVisible();
  await expect(page.getByTestId("replay-reset")).toBeVisible();
}

async function traderNames(rows: Locator) {
  const names: string[] = [];
  const count = await rows.count();

  for (let index = 0; index < count; index += 1) {
    names.push(await rows.nth(index).getByRole("heading").innerText());
  }

  return names;
}
