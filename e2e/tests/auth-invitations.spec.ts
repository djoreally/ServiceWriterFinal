import { expect, test } from "@playwright/test";
import fs from "node:fs";

const storageState = process.env.E2E_AUTH_STORAGE_STATE || "";
const workspaceId = process.env.E2E_WORKSPACE_ID || "";
const authenticated = Boolean(storageState && fs.existsSync(storageState) && workspaceId);

test("incomplete invitation links show a safe customer-facing error", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/team/join");
  await expect(page.getByText("Invalid invitation link")).toBeVisible();
  await expect(page.locator("body")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("unauthenticated users cannot enter the invitation center", async ({ page }) => {
  await page.goto("/invitations");
  await expect(page).toHaveURL(/\/login(?:\?|$)/, { timeout: 10_000 });
});

test.describe("authenticated invitation center", () => {
  test.skip(!authenticated, "Set E2E_AUTH_STORAGE_STATE and E2E_WORKSPACE_ID for authenticated deployment coverage.");
  test.use({ storageState: storageState || undefined });

  test("authorized workspace admins can open the invitation center without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/invitations?workspace_id=${encodeURIComponent(workspaceId)}`);
    await expect(page.getByRole("heading", { name: "Invitation history" })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("foreign workspace invitation data is not rendered", async ({ page }) => {
    await page.goto(`/invitations?workspace_id=${encodeURIComponent(workspaceId)}`);
    await expect(page.getByRole("heading", { name: "Invitation history" })).toBeVisible({ timeout: 15_000 });
    const response = await page.request.get(`/api/v1/invitations?workspace_id=${encodeURIComponent(workspaceId)}&limit=100`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json() as { data?: Array<{ workspace_id?: string }> };
    expect(body.data?.every((row) => row.workspace_id === workspaceId)).toBe(true);
  });
});
