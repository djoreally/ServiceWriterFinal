import { expect, test } from "@playwright/test";

test("public homepage renders without horizontal overflow on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page).toHaveTitle(/Service Writer/i);
  // The production entrypoint performs a bounded version check before mounting
  // React; wait for the root to contain the homepage before asserting visibility.
  await expect(page.locator("#root")).not.toBeEmpty({ timeout: 10_000 });
  await expect(page.locator("body")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
