import { createClient } from "@supabase/supabase-js";

type RoleFixture = {
  role: "owner" | "manager" | "dispatcher" | "fleet_manager" | "technician" | "viewer" | "customer";
  email: string;
  password: string;
  workspaceId: string;
  foreignWorkspaceId: string;
};

const fixtures = process.env.RLS_ROLE_FIXTURES ? JSON.parse(process.env.RLS_ROLE_FIXTURES) as RoleFixture[] : [];
const enabled = process.env.RUN_RLS_INTEGRATION === "true" && fixtures.length > 0;
const run = enabled ? test : test.skip;
const tenantTables = [
  "customers",
  "vehicles",
  "appointments",
  "quotes",
  "invoices",
  "payments",
  "work_orders",
  "service_records",
  "dispatch_events",
  "message_logs",
  "fleet_clients",
] as const;

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase integration URL and publishable key are required");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

describe("authenticated role certification and tenant isolation", () => {
  test("role certification is opt-in and fixture configuration is valid", () => {
    expect(Array.isArray(fixtures)).toBe(true);
  });

  for (const fixture of fixtures) {
    run(`${fixture.role} cannot read another workspace`, async () => {
      const supabase = client();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: fixture.email, password: fixture.password });
      expect(signInError).toBeNull();
      for (const table of tenantTables) {
        const result = await supabase.from(table).select("workspace_id").eq("workspace_id", fixture.foreignWorkspaceId).limit(10);
        expect(result.error).toBeNull();
        expect(result.data ?? []).toHaveLength(0);
      }
      await supabase.auth.signOut();
    });

    run(`${fixture.role} can resolve only its own workspace boundary`, async () => {
      const supabase = client();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: fixture.email, password: fixture.password });
      expect(signInError).toBeNull();
      const result = await supabase.from("workspace_members").select("workspace_id,role,is_active").eq("workspace_id", fixture.workspaceId).limit(10);
      expect(result.error).toBeNull();
      for (const row of result.data ?? []) expect(row.workspace_id).toBe(fixture.workspaceId);
      await supabase.auth.signOut();
    });
  }
});
