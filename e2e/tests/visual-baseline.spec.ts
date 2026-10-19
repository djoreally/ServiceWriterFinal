import { test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Visual safety net for the frontend refactor (Phase 0).
 *
 * Captures deterministic screenshots of contract-critical screens, per
 * Playwright project (1440px desktop / 820px tablet / 390px mobile, from
 * playwright.config.ts), in light AND dark themes. Artifacts land in
 * `playwright-visual/<project>/<theme>-<slug>.png` (gitignored) and are
 * uploaded as CI artifacts — reviewers diff them with any image tool, and
 * promote a set to "baseline" by archiving it before each refactor phase.
 *
 * Public screens always run. Authenticated screens run when the standard
 * e2e env is provided (same pattern as auth-invitations.spec.ts):
 *   E2E_AUTH_STORAGE_STATE=<path to storageState json>
 *   E2E_WORKSPACE_ID=<workspace uuid>
 *
 * Determinism: animations/transitions are disabled and known-dynamic regions
 * (clocks, avatars, toasts, maps) are masked so phase-over-phase diffs show
 * intentional design changes only.
 */

const PUBLIC_SCREENS: Array<{ slug: string; path: string }> = [
  { slug: "home", path: "/" },
  { slug: "pricing", path: "/pricing" },
  { slug: "login", path: "/login" },
  { slug: "how-it-works", path: "/how-it-works" },
  { slug: "faqs", path: "/faqs" },
];

const AUTH_SCREENS: Array<{ slug: string; path: string }> = [
  { slug: "dashboard", path: "/dashboard" },
  { slug: "appointments", path: "/appointments" },
  { slug: "customers", path: "/customers" },
  { slug: "invoices", path: "/invoices" },
  { slug: "settings", path: "/settings" },
];

const storageState = process.env.E2E_AUTH_STORAGE_STATE || "";
const workspaceId = process.env.E2E_WORKSPACE_ID || "";
const authenticated = Boolean(storageState && fs.existsSync(storageState) && workspaceId);
const outDir = path.resolve(process.cwd(), "playwright-visual");

const REDUCE_FLAKINESS_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    caret-color: transparent !important;
  }
`;

async function capture(page: import("@playwright/test").Page, slug: string, url: string) {
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.addStyleTag({ content: REDUCE_FLAKINESS_CSS });
    // Allow lazy routes (lazyRetry) and theme application to settle.
    await page.waitForTimeout(1_500);
    const project = test.info().project.name;
    const dir = path.join(outDir, project);
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({
      path: path.join(dir, `${theme}-${slug}.png`),
      fullPage: true,
      mask: [
        page.locator("[data-app-bottomnav] ~ *").first(), // floating overlays
        page.locator("canvas"), // mapbox / chart canvases are non-deterministic
        page.locator("[data-sonner-toaster], [role='status']").first(),
      ],
      maskColor: "#888888",
    });
  }
}

test.describe("visual baseline — public screens", () => {
  for (const screen of PUBLIC_SCREENS) {
    test(`${screen.slug} (${screen.path})`, async ({ page }) => {
      await capture(page, screen.slug, screen.path);
    });
  }
});

test.describe("visual baseline — authenticated screens", () => {
  test.skip(!authenticated, "Set E2E_AUTH_STORAGE_STATE and E2E_WORKSPACE_ID for authenticated visual coverage.");
  test.use({ storageState: storageState || undefined });

  for (const screen of AUTH_SCREENS) {
    test(`${screen.slug} (${screen.path})`, async ({ page }) => {
      await capture(page, screen.slug, screen.path);
    });
  }
});
