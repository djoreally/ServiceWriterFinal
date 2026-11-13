/**
 * Admin front door (2026-11-10) — the three breaks the admin
 * examination verified against CURRENT main:
 *
 * 1. GET /v1/platform/stats called rpc("get_platform_stats"), which
 *    never existed in production (the Oct-10 file is a raising stub).
 *    The migration in this PR authors it for real; this test pins its
 *    contract: the six keys the handler maps, SECURITY DEFINER (the
 *    route's client is RLS-bound), and the Item-4 revenue definition
 *    (payments where status = 'succeeded').
 * 2. organization-360's per-org legs still filtered workspace-keyed
 *    tables by user_id (customers, vehicles, appointments, invoices,
 *    inventory_items have workspace_id and — except inventory_items —
 *    no user_id at all), read the phantom appointments.actual_end_time,
 *    and filtered invoices by a deleted_at column invoices don't have.
 *    Every one of those reads 42703s. The profiles leg and the users
 *    list were already healed by the Step 3 follow-up; the count legs
 *    are healed here.
 * 3. The Carfax settings PUT was an UPDATE against a possibly-absent
 *    platform_settings row: zero rows touched, success reported,
 *    nothing saved. It now selects first and inserts on first save.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const platform = readFileSync(
  join(process.cwd(), "src/server/hono/routes/platform.ts"),
  "utf8",
);
const vehicles = readFileSync(
  join(process.cwd(), "src/server/hono/routes/vehicles.ts"),
  "utf8",
);
const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20261110202000_platform_stats_rpc.sql",
  ),
  "utf8",
);

function block(src: string, startMarker: string, endMarker: string): string {
  const start = src.indexOf(startMarker);
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe("get_platform_stats migration", () => {
  it("creates the function as security definer with the handler's six keys", () => {
    expect(migration).toContain(
      "create or replace function public.get_platform_stats()",
    );
    expect(migration).toContain("security definer");
    for (const key of [
      "usersCount",
      "vehiclesCount",
      "servicesCount",
      "appointmentsCount",
      "totalRevenue",
      "shopsCount",
    ]) {
      expect(migration).toContain(`'${key}'`);
    }
  });

  it("counts revenue by the collected definition and services as service_records", () => {
    expect(migration).toContain("from public.payments where status = 'succeeded'");
    expect(migration).toContain("from public.service_records");
    expect(migration).toContain("from public.workspaces where is_active");
  });

  it("counts users as distinct active workspace members (business_profiles is empty in production)", () => {
    // Corrected by 20261110203000 after the first live verify returned
    // usersCount 0: business_profiles has zero rows in production, so
    // the original definition would have shown a false "0 users".
    const correction = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20261110203000_platform_stats_users_definition.sql",
      ),
      "utf8",
    );
    expect(correction).toContain(
      "count(distinct user_id) from public.workspace_members where is_active",
    );
    expect(correction).toContain(
      "create or replace function public.get_platform_stats()",
    );
  });

  it("grants execute to authenticated, never leaves it public", () => {
    expect(migration).toContain(
      "revoke all on function public.get_platform_stats() from public",
    );
    expect(migration).toContain(
      "grant execute on function public.get_platform_stats() to authenticated",
    );
  });
});

describe("organization-360 workspace-keyed legs", () => {
  const org360 = block(
    platform,
    'platformRouter.get("/v1/platform/admin/organization-360"',
    '// ---------------------------------------------------------------------------\n// Platform — stats, users, plans, system health',
  );

  it("counts rows by workspace_id, not user_id", () => {
    expect(org360).toContain('.eq("workspace_id", workspaceId)');
    expect(org360).not.toContain('.eq("user_id", userId)');
    expect(org360).not.toContain('.eq("user_id", workspaceId)');
  });

  it("never reads the phantom appointments.actual_end_time", () => {
    expect(org360).not.toContain("actual_end_time");
  });

  it("never filters invoices by their nonexistent deleted_at", () => {
    expect(org360).not.toContain("deleted_at");
  });

  it("keeps the one legitimately owner-keyed leg: team_user_links by owner_user_id", () => {
    expect(org360).toContain(
      '.from("team_user_links").select("id", { count: "exact", head: true }).eq("owner_user_id", userId)',
    );
  });
});

describe("carfax settings PUT persists on first save", () => {
  const put = block(
    vehicles,
    'vehiclesRouter.put("/v1/admin/carfax/settings"',
    'vehiclesRouter.get("/v1/admin/carfax/export-stats"',
  );

  it("selects the existing row before writing", () => {
    expect(put).toContain('.from("platform_settings")');
    expect(put).toContain('.select("id")');
    expect(put).toContain('.eq("key", "carfax")');
  });

  it("inserts when the row is absent and updates by id when present", () => {
    expect(put).toContain('.insert({ key: "carfax", value: body.config as never })');
    expect(put).toContain('.eq("id", existing.id)');
  });
});
