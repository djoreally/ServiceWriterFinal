import { expect, test } from "@playwright/test";
import fs from "node:fs";

const storageState = process.env.E2E_AUTH_STORAGE_STATE || "";
const authenticated = Boolean(storageState && fs.existsSync(storageState));

const legacyTabs = [
  ["email", "comms"],
  ["sms", "comms"],
  ["tax", "payments"],
  ["billing", "payments"],
  ["hours", "booking"],
  ["calendar", "integrations"],
  ["gdpr", "advanced"],
] as const;

test("unauthenticated settings access remains protected", async ({ page }) => {
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login(?:\?|$)/, { timeout: 10_000 });
});

test.describe("authenticated settings regression suite", () => {
  test.skip(!authenticated, "Set E2E_AUTH_STORAGE_STATE for authenticated Settings regression coverage.");
  test.use({ storageState: storageState || undefined });

  for (const [legacy, canonical] of legacyTabs) {
    test(`legacy tab ${legacy} resolves to ${canonical} with visible settings content`, async ({ page }) => {
      await page.goto(`/settings?tab=${legacy}`);
      await expect(page).toHaveURL(new RegExp(`\\?tab=${canonical}(?:&|$)`), { timeout: 10_000 });
      await expect(page.getByRole("heading", { name: /Settings|Business setup/i }).first()).toBeVisible();
      await expect(page.locator("body")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }

  test("unknown settings tab falls back to business instead of blank content", async ({ page }) => {
    await page.goto("/settings?tab=does-not-exist");
    await expect(page).toHaveURL(/\?tab=business(?:&|$)/, { timeout: 10_000 });
    await expect(page.getByText("Business Profile")).toBeVisible({ timeout: 10_000 });
  });

  test("settings save action stays inside the visible viewport", async ({ page }) => {
    await page.goto("/settings?tab=business");
    const save = page.getByRole("button", { name: /Save settings|Save & open dashboard/i });
    await expect(save).toBeVisible({ timeout: 10_000 });
    const box = await save.boundingBox();
    expect(box).not.toBeNull();
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    if (box && viewport) {
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    }
  });
});
