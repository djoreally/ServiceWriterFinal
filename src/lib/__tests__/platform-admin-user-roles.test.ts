/**
 * Platform-admin user_roles guard (2026-11-10).
 *
 * Production user_roles has exactly three columns (live census
 * 2026-11-10): user_id, role, created_at — there is NO id column.
 * platform.ts's requirePlatformAdmin selected "id", so EVERY
 * platform-admin route 500'd with 42703 (Sentry SERVICE-WRITER-2,
 * first real production capture, 2026-11-10 15:08 EST — the owner hit
 * it opening Platform Admin). messaging.ts's mirror gate already
 * selected "role" correctly.
 *
 * This test pins EVERY user_roles select in both route files to the
 * live column set, so the gate can never drift back.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const LIVE_USER_ROLES_COLUMNS = new Set(["user_id", "role", "created_at"]);

function userRolesSelects(relPath: string): string[] {
  const src = readFileSync(join(process.cwd(), relPath), "utf8");
  const selects: string[] = [];
  const re = /\.from\(\s*"user_roles"\s*\)\s*\.select\(\s*"([^"]+)"\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) selects.push(m[1]);
  return selects;
}

describe("user_roles selects match the live production shape", () => {
  const files = [
    "src/server/hono/routes/platform.ts",
    "src/server/hono/routes/messaging.ts",
  ];

  for (const file of files) {
    it(`${file}: every user_roles select names only live columns`, () => {
      const selects = userRolesSelects(file);
      expect(selects.length).toBeGreaterThan(0);
      for (const sel of selects) {
        const cols = sel.split(",").map((s) => s.trim());
        for (const col of cols) {
          expect(LIVE_USER_ROLES_COLUMNS.has(col)).toBe(true);
        }
      }
    });
  }

  it("platform.ts requirePlatformAdmin no longer selects the phantom id", () => {
    const src = readFileSync(
      join(process.cwd(), "src/server/hono/routes/platform.ts"),
      "utf8",
    );
    const gate = src.slice(
      src.indexOf("async function requirePlatformAdmin"),
      src.indexOf("async function requirePlatformAdmin") + 500,
    );
    expect(gate).toContain('.from("user_roles")');
    expect(gate).not.toContain('.select("id")');
    expect(gate).toContain('.select("role")');
  });
});
