import { expect, test } from "@playwright/test";

test("mobile stage 1 copy loop reaches settlement and leaderboard update", async ({ page }) => {
  await page.goto("/");
  const replayStatus = page.getByRole("region", { name: "Live replay status" });
  const copyTray = page.getByRole("region", { name: "Copy next signal tray" });
  const leaderboard = page.getByRole("region", { name: "Hot leaderboard" });

  await expect(page.getByRole("heading", { name: "Hot Hands" })).toBeVisible();
  await expect(page.getByText("BTC UP/DOWN signal market")).toBeVisible();
  await expect(page.getByText("BTC UP", { exact: true })).toBeVisible();
  await expect(page.getByText("BTC DOWN", { exact: true })).toBeVisible();

  await expect(page.getByRole("region", { name: "Spectators watching" })).toBeVisible();
  await expect(page.getByLabel("IC watching")).toBeVisible();
  await expect(page.getByLabel("SP watching")).toBeVisible();

  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByRole("heading", { name: "Copy armed" })).toBeVisible();

  await page.getByRole("button", { name: "Disarm copy" }).click();
  await expect(page.getByRole("button", { name: "Arm copy" })).toBeVisible();
  await page.getByRole("button", { name: "Arm copy" }).click();
  await expect(page.getByRole("button", { name: "Disarm copy" })).toBeVisible();

  await page.getByRole("button", { name: "$500" }).click();
  await expect(copyTray).toContainText("$500");

  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Leader signal landed" })).toBeVisible();
  await expect(replayStatus.getByText(/posted BTC (UP|DOWN)/)).toBeVisible();

  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Copy executed" })).toBeVisible();
  await expect(replayStatus.getByText("$500 copied to BTC ticket")).toBeVisible();
  await expect(copyTray.getByText("Copied receipt")).toBeVisible();

  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Settlement posted" })).toBeVisible();
  await expect(replayStatus.getByText("Settlement posts +$40")).toBeVisible();
  await expect(copyTray.getByText("Filled +$40")).toBeVisible();

  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Hot hand updated" })).toBeVisible();
  await expect(replayStatus.getByText("Mira Vale tops the leaderboard")).toBeVisible();
  await expect(leaderboard.getByText("Hot hand")).toBeVisible();
  await expect(page.getByLabel("Mira Vale hot score 50")).toBeVisible();
});
