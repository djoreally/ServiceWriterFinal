import { createClient } from "@supabase/supabase-js";

type RlsFixture = { email: string; password: string; workspaceA: string; workspaceB: string; customerA: string; invitationA: string };

const fixture = process.env.RLS_TEST_FIXTURE ? JSON.parse(process.env.RLS_TEST_FIXTURE) as RlsFixture : null;
const hasFixture = process.env.RUN_RLS_INTEGRATION === "true" && Boolean(fixture);
const testIntegration = hasFixture ? test : test.skip;

describe("authenticated cross-workspace identity RLS", () => {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL) as string;
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string;
  testIntegration("customer identity is limited to its own linked workspace and customer", async () => {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: signInError } = await client.auth.signInWithPassword({ email: fixture!.email, password: fixture!.password });
    expect(signInError).toBeNull();

    const own = await client.from("customer_users").select("workspace_id,customer_id,user_id").eq("workspace_id", fixture!.workspaceA).eq("customer_id", fixture!.customerA).limit(10);
    expect(own.error).toBeNull();

    const foreign = await client.from("invitations").select("id,workspace_id,invited_email,invited_role").eq("workspace_id", fixture!.workspaceB).limit(10);
    expect(foreign.error).toBeNull();
    expect(foreign.data ?? []).toHaveLength(0);

    const forgedInsert = await client.from("invitation_events").insert({ invitation_id: fixture!.invitationA, workspace_id: fixture!.workspaceB, event_type: "created", actor_user_id: "00000000-0000-0000-0000-000000000000" });
    expect(forgedInsert.error).not.toBeNull();

    await client.auth.signOut();
  });

  testIntegration("foreign workspace invitation rows are not visible to authenticated users", async () => {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: signInError } = await client.auth.signInWithPassword({ email: fixture!.email, password: fixture!.password });
    expect(signInError).toBeNull();
    const result = await client.from("invitations").select("id,workspace_id,customer_id").eq("workspace_id", fixture!.workspaceB).limit(10);
    expect(result.error).toBeNull();
    expect(result.data ?? []).toHaveLength(0);
    await client.auth.signOut();
  });

  testIntegration("foreign workspace operational and financial rows are not visible", async () => {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: signInError } = await client.auth.signInWithPassword({ email: fixture!.email, password: fixture!.password });
    expect(signInError).toBeNull();
    const tenantTables = ["customers", "vehicles", "appointments", "quotes", "invoices", "payments", "work_orders", "service_records", "dispatch_events", "message_logs", "fleet_clients"] as const;
    for (const table of tenantTables) {
      const result = await client.from(table).select("workspace_id").eq("workspace_id", fixture!.workspaceB).limit(10);
      expect(result.error).toBeNull();
      expect(result.data ?? []).toHaveLength(0);
    }
    await client.auth.signOut();
  });
});
