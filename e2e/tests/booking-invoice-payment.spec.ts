import { expect, test } from "@playwright/test";

const bookingUrl = process.env.E2E_PUBLIC_BOOKING_URL || "";
const authenticatedState = process.env.E2E_AUTH_STORAGE_STATE || "";
const appointmentId = process.env.E2E_APPOINTMENT_ID || "";
const invoiceId = process.env.E2E_INVOICE_ID || "";

/**
 * Critical revenue path regression coverage.
 *
 * Always-on tests protect routing/reachability without requiring seeded data.
 * Seeded environment variables unlock the full browser journey in deployment CI.
 */
test.describe("booking → invoice → payment critical path", () => {
  test("public booking command routes are not swallowed by appointment [id]", async ({ request }) => {
    for (const route of ["booking-progress", "booking-recovered", "booking-rpc"]) {
      const response = await request.post(`/api/v1/appointments/${route}`, { data: {} });
      expect(response.status(), `${route} must reach its POST handler instead of dynamic [id] routing`).not.toBe(405);
    }
  });

  test("public booking surface renders without horizontal clipping", async ({ page }) => {
    test.skip(!bookingUrl, "Set E2E_PUBLIC_BOOKING_URL to exercise a seeded tenant booking surface.");
    await page.goto(bookingUrl);
    await expect(page.locator("body")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("seeded appointment can be opened and exposes financial controls", async ({ browser }) => {
    test.skip(!authenticatedState || !appointmentId, "Set authenticated storage state and E2E_APPOINTMENT_ID for the staff revenue journey.");
    const context = await browser.newContext({ storageState: authenticatedState });
    const page = await context.newPage();
    await page.goto(`/appointments/${encodeURIComponent(appointmentId)}`);
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByText(/Financial Summary|Invoice|Payment/i).first()).toBeVisible({ timeout: 15_000 });
    await context.close();
  });

  test("seeded invoice opens without invalid-date crash", async ({ browser }) => {
    test.skip(!authenticatedState || !invoiceId, "Set authenticated storage state and E2E_INVOICE_ID for invoice/payment coverage.");
    const context = await browser.newContext({ storageState: authenticatedState });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`/invoices/${encodeURIComponent(invoiceId)}`);
    await expect(page.locator("body")).toBeVisible();
    expect(pageErrors.some((message) => /Invalid time value/i.test(message))).toBe(false);
    await context.close();
  });
});
