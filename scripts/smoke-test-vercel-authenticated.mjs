import { chromium } from "@playwright/test";
import fs from "node:fs";

const baseURL = (process.env.VERCEL_DEPLOYMENT_URL || process.argv[2] || "").replace(/\/$/, "");
const storageState = process.env.SMOKE_STORAGE_STATE || process.argv[3] || "";
const paths = (process.env.SMOKE_PATHS || "/").split(",").map((path) => path.trim()).filter(Boolean);

if (!baseURL) {
  console.error("Usage: VERCEL_DEPLOYMENT_URL=https://... SMOKE_STORAGE_STATE=auth.json npm run smoke:vercel");
  process.exit(2);
}
if (!/^https:\/\//i.test(baseURL)) {
  console.error("Refusing to smoke-test a non-HTTPS deployment URL.");
  process.exit(2);
}
if (storageState && !fs.existsSync(storageState)) {
  console.error(`Storage state does not exist: ${storageState}`);
  process.exit(2);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState: storageState || undefined,
  serviceWorkers: "block",
});
const page = await context.newPage();
const failures = [];

page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") failures.push(`console.error: ${message.text()}`);
});

try {
  for (const path of paths) {
    const target = new URL(path, `${baseURL}/`).toString();
    const response = await page.goto(target, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const finalURL = page.url();
    const status = response?.status() ?? 0;

    if (finalURL.includes("vercel.com/login") || finalURL.includes("vercel.com/sso-api")) {
      failures.push(`${path}: deployment is protected by Vercel SSO; provide an authorized storage state or use an approved staging/custom-domain access path`);
      continue;
    }
    if (status >= 400) failures.push(`${path}: HTTP ${status}`);
    await page.locator("#root").waitFor({ state: "attached", timeout: 10_000 });
    await page.waitForFunction(() => document.querySelector("#root")?.childElementCount > 0, undefined, { timeout: 15_000 });
    if (await page.locator("body").isHidden()) failures.push(`${path}: body is hidden`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (overflow) failures.push(`${path}: horizontal overflow detected`);
    console.log(`${path}\tHTTP ${status}\t${finalURL}\tPASS`);
  }

  if (failures.length) {
    console.error("Authenticated smoke test failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else {
    console.log(`Authenticated smoke test passed for ${paths.length} path(s).`);
  }
} finally {
  await context.close();
  await browser.close();
}
