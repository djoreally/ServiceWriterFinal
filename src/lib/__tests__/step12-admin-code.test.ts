import { readFileSync } from "node:fs";
import { join } from "node:path";

// Pins the Recon Step 12 paired code translation. This family has
// exactly ONE exercising site whose tenancy changes: the onboarding
// site-import latest read in platform.ts (user_id -> workspace_id via
// the file's own resolveWorkspaceIdForUser). Everything else is pinned
// UNCHANGED, per the spec's adjudication:
//  - the training pair is global — AdminTrainingRewards reads/writes
//    carry no tenancy in either era (the RLS admin gate authorizes);
//  - shop_agent_ledger was designed workspace-native — the zeroai
//    ledger module already stamps workspace_id;
//  - the weather-guard risk-logs read was already RLS-scoped by
//    construction (unscoped select; the staff policy now scopes it),
//    and the at-risk DTO composition (Lane B, PR #225) never reads
//    weather_risk_logs — its weather_* nulls are a read-path question
//    for a later build, not something this schema step rewires.

const PLATFORM = readFileSync(
  join(__dirname, "../../../src/server/hono/routes/platform.ts"),
  "utf8",
);
const TRAINING_COMPONENT = readFileSync(
  join(__dirname, "../../../src/components/admin/AdminTrainingRewards.tsx"),
  "utf8",
);
const LEDGER = readFileSync(
  join(__dirname, "../../../src/server/shop-agent/zeroai/ledger.ts"),
  "utf8",
);
const WEATHER_QUERY = readFileSync(
  join(__dirname, "../../../src/application/queries/weather-guard.query.ts"),
  "utf8",
);

function block(src: string, route: string, router: string): string {
  const start = src.indexOf(route);
  if (start < 0) throw new Error(`route not found: ${route}`);
  const next = src.indexOf(router, start + route.length);
  return src.slice(start, next < 0 ? undefined : next);
}

describe("step12 code — platform.ts onboarding site-import latest (the one translation)", () => {
  it("filters by the resolved workspace, never user_id", () => {
    const b = block(PLATFORM, 'get("/v1/platform/onboarding/site-import/latest"', "platformRouter.");
    expect(b).toContain('.from("onboarding_site_imports")');
    expect(b).toContain("const workspaceId = await resolveWorkspaceIdForUser(supabase, user.id);");
    expect(b).toContain('.eq("workspace_id", workspaceId)');
    expect(b).not.toContain('.eq("user_id"');
  });

  it("keeps the read contract: same select, completed-only, newest first, null when no workspace/import", () => {
    const b = block(PLATFORM, 'get("/v1/platform/onboarding/site-import/latest"', "platformRouter.");
    expect(b).toContain('.select("payload, warnings, status")');
    expect(b).toContain('.eq("status", "completed")');
    expect(b).toContain('.order("created_at", { ascending: false })');
    expect(b).toContain("if (!workspaceId) return json(null);");
    expect(b).toContain("if (!data?.payload) return json(null);");
  });

  it("the site-import POST still just invokes the out-of-repo edge function (its writer stamps tenancy)", () => {
    const b = block(PLATFORM, 'post("/v1/platform/onboarding/site-import"', "platformRouter.");
    expect(b).toContain('invokeEdgeFunction(c, "onboarding-site-import"');
    expect(b).not.toContain("onboarding_site_imports");
  });
});

describe("step12 code — platform.ts weather-guard adjudication (no code changes)", () => {
  it("risk-logs stays an unscoped select * ordered by evaluated_at — RLS carries the scoping", () => {
    const b = block(PLATFORM, 'get("/v1/platform/weather-guard/risk-logs"', "platformRouter.");
    expect(b).toContain('.from("weather_risk_logs")');
    expect(b).toContain('.select("*")');
    expect(b).toContain('.order("evaluated_at", { ascending: false })');
    expect(b).not.toContain('.eq("workspace_id"');
    expect(b).not.toContain('.eq("user_id"');
  });

  it("at-risk still composes its DTO from appointments and never reads the logs table", () => {
    const b = block(PLATFORM, 'get("/v1/platform/weather-guard/at-risk"', "platformRouter.");
    expect(b).toContain('.from("appointments")');
    expect(b).not.toContain('.from("weather_risk_logs")');
    expect(b).toContain("weather_risk_score: null");
    expect(b).toContain("weather_decision: null");
    expect(b).toContain("weather_evaluated_at: null");
  });

  it("the realtime subscription stays client-side on weather_risk_logs INSERTs", () => {
    expect(WEATHER_QUERY).toContain('"postgres_changes"');
    expect(WEATHER_QUERY).toContain('{ event: "INSERT", schema: "public", table: "weather_risk_logs" }');
  });
});

describe("step12 code — the global training pair stays untouched", () => {
  it("AdminTrainingRewards reads the singleton with maybeSingle and the catalog ordered — no tenancy anywhere", () => {
    expect(TRAINING_COMPONENT).toContain('supabase.from("training_reward_policy").select("*").maybeSingle()');
    expect(TRAINING_COMPONENT).toContain('supabase.from("training_modules").select("*").order("surface").order("sort_order")');
    expect(TRAINING_COMPONENT).not.toContain("workspace");
  });

  it("its updates carry exactly the spec'd field sets", () => {
    expect(TRAINING_COMPONENT).toContain("monthly_cap_cents: policy.monthly_cap_cents,");
    expect(TRAINING_COMPONENT).toContain("lifetime_cap_cents: policy.lifetime_cap_cents,");
    expect(TRAINING_COMPONENT).toContain("reward_cents: m.reward_cents,");
    expect(TRAINING_COMPONENT).toContain("active: m.active,");
  });
});

describe("step12 code — shop_agent_ledger stays untouched (workspace-native by design)", () => {
  it("the zeroai ledger module already stamps workspace_id on its insert row", () => {
    expect(LEDGER).toContain('export const LEDGER_TABLE = "shop_agent_ledger";');
    expect(LEDGER).toContain("workspace_id: chained.workspaceId,");
    expect(LEDGER).toContain("event_id: chained.eventId,");
  });
});
