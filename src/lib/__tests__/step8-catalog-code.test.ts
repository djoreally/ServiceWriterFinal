import { readFileSync } from "node:fs";
import { join } from "node:path";

// Pins the Recon Step 8 paired code translation: every route that
// exercised legacy user_id tenancy on a Step 8 table now resolves and
// filters by workspace_id (requireWorkspaceAuth on the shop routes;
// an explicit membership gate on the platform routes, which run on the
// admin client). The named exceptions stay untouched: shop_pricing is
// already canonical, benchmark_pricing is global, the price_quote_requests
// pair is pre-tenancy. Item #16's ghost `services` read in tech-app
// job-detail is pinned ABSENT — that serving handler was removed by the
// phantom fix series; the surviving handler reads appointment_services.

const WORK_ORDERS = readFileSync(
  join(__dirname, "../../../src/server/hono/routes/work-orders.ts"),
  "utf8",
);
const PLATFORM = readFileSync(
  join(__dirname, "../../../src/server/hono/routes/platform.ts"),
  "utf8",
);
const VEHICLES = readFileSync(
  join(__dirname, "../../../src/server/hono/routes/vehicles.ts"),
  "utf8",
);
const RECURRING_QUERY = readFileSync(
  join(__dirname, "../../../src/application/queries/recurring-services.query.ts"),
  "utf8",
);
const RECURRING_COMMAND = readFileSync(
  join(__dirname, "../../../src/application/commands/recurring-services.command.ts"),
  "utf8",
);
const REPAIR_PRICING_QUERY = readFileSync(
  join(__dirname, "../../../src/application/queries/repair-pricing.query.ts"),
  "utf8",
);
const PLAYBOOKS_COMMAND = readFileSync(
  join(__dirname, "../../../src/application/commands/playbooks.command.ts"),
  "utf8",
);
const PLAYBOOK_SEED_COMMAND = readFileSync(
  join(__dirname, "../../../src/application/commands/playbook-seed.command.ts"),
  "utf8",
);

function block(src: string, route: string, router: string): string {
  const start = src.indexOf(route);
  if (start < 0) throw new Error(`route not found: ${route}`);
  const next = src.indexOf(router, start + route.length);
  return src.slice(start, next < 0 ? undefined : next);
}

describe("step8 code — work-orders recurring services", () => {
  it("GET gates on the named workspace and filters by it (the any-user read is closed)", () => {
    const b = block(WORK_ORDERS, 'get("/v1/recurring-services"', "workOrdersRouter.");
    expect(b).toContain("requireWorkspaceAuth(c, workspaceId, undefined)");
    expect(b).toContain('.eq("workspace_id", workspaceId)');
    expect(b).not.toContain('.eq("user_id"');
    expect(b).not.toContain('searchParams.get("user_id")');
  });

  it("POST takes workspace_id in the body, gates on it, and stamps it", () => {
    const b = block(WORK_ORDERS, 'post("/v1/recurring-services"', "workOrdersRouter.");
    expect(b).toContain("workspace_id: z.string().uuid()");
    expect(b).toContain("requireWorkspaceAuth(c, body.workspace_id, undefined)");
    expect(b).toContain("workspace_id: body.workspace_id,");
    expect(b).not.toContain("user_id: body.user_id");
    expect(b).not.toContain("user_id: z.");
  });
});

describe("step8 code — work-orders /v1/services pair", () => {
  const SELECT_TAIL =
    "payment_status, created_at, updated_at, workspace_id";

  it("GET /v1/services requires a workspace and swaps user_id for workspace_id", () => {
    const b = block(WORK_ORDERS, 'get("/v1/services"', "workOrdersRouter.");
    expect(b).toContain("requireWorkspaceAuth(c, workspaceId, undefined)");
    expect(b).toContain(SELECT_TAIL);
    expect(b).toContain('.eq("workspace_id", workspaceId)');
    expect(b).not.toContain('.eq("user_id"');
    expect(b).not.toContain("updated_at, user_id");
  });

  it("GET /v1/services/:id scopes by id + workspace", () => {
    const b = block(WORK_ORDERS, 'get("/v1/services/:id"', "workOrdersRouter.");
    expect(b).toContain("requireWorkspaceAuth(c, workspaceId, undefined)");
    expect(b).toContain(SELECT_TAIL);
    expect(b).toContain('.eq("id", c.req.param("id")).eq("workspace_id", workspaceId)');
    expect(b).not.toContain('.eq("user_id"');
    expect(b).not.toContain("updated_at, user_id");
  });
});

describe("step8 code — work-orders repair-pricing shop pair", () => {
  it("GET catalog-benchmarks requires + filters the workspace", () => {
    const b = block(WORK_ORDERS, 'get("/v1/repair-pricing/catalog-benchmarks"', "workOrdersRouter.");
    expect(b).toContain("requireWorkspaceAuth(c, workspaceId, undefined)");
    expect(b).toContain('.select("*").eq("workspace_id", workspaceId)');
    expect(b).not.toContain("user_id");
  });

  it("POST catalog-benchmarks re-keys the upsert payload; conflict target unchanged", () => {
    const b = block(WORK_ORDERS, 'post("/v1/repair-pricing/catalog-benchmarks"', "workOrdersRouter.");
    expect(b).toContain("workspace_id: z.string().uuid()");
    expect(b).toContain("requireWorkspaceAuth(c, body.workspace_id, undefined)");
    expect(b).toContain('onConflict: "service_catalog_id,vin"');
    expect(b).not.toContain("user_id");
  });

  it("GET shop-quote-requests requires + filters the workspace", () => {
    const b = block(WORK_ORDERS, 'get("/v1/repair-pricing/shop-quote-requests"', "workOrdersRouter.");
    expect(b).toContain("requireWorkspaceAuth(c, workspaceId, undefined)");
    expect(b).toContain('.select("*").eq("workspace_id", workspaceId)');
    expect(b).not.toContain("user_id");
  });

  it("PATCH shop-quote-requests scopes the update to the caller's workspace", () => {
    const b = block(WORK_ORDERS, 'patch("/v1/repair-pricing/shop-quote-requests/:id"', "workOrdersRouter.");
    expect(b).toContain("workspace_id: z.string().uuid()");
    expect(b).toContain("requireWorkspaceAuth(c, body.workspace_id, undefined)");
    expect(b).toContain('.eq("id", c.req.param("id")).eq("workspace_id", body.workspace_id)');
    expect(b).not.toContain("user_id");
  });
});

describe("step8 code — work-orders named exceptions stay untouched", () => {
  it("shop-pricing keeps its canonical shape", () => {
    const b = block(WORK_ORDERS, 'get("/v1/shop-pricing"', "workOrdersRouter.");
    expect(b).toContain('.from("shop_pricing_rules")');
    expect(b).toContain('.select("rule_key, value, workspace_id").eq("workspace_id", workspaceId)');
  });

  it("the platform benchmarks route stays unfiltered (global table)", () => {
    const b = block(WORK_ORDERS, 'get("/v1/repair-pricing/benchmarks"', "workOrdersRouter.");
    expect(b).toContain('.from("benchmark_pricing")');
    expect(b).not.toContain("workspace_id");
  });

  it("the platform quote-requests pair stays unscoped (pre-tenancy exception)", () => {
    const b = block(WORK_ORDERS, 'get("/v1/repair-pricing/quote-requests"', "workOrdersRouter.");
    expect(b).toContain('.from("price_quote_requests")');
    expect(b).not.toContain("workspace_id");
  });
});

describe("step8 code — vehicles recommendations (services history read)", () => {
  it("filters services by the resolved workspace, never user_id", () => {
    const b = block(VEHICLES, 'post("/v1/vehicle-recommendations/generate"', "vehiclesRouter.");
    expect(b).toContain('.eq("workspace_id", servicesWorkspaceId)');
    expect(b).toContain("resolveWorkspaceIdForUser(supabase, user.id)");
    expect(b).not.toContain('.from("services").select("*").eq("vehicle_id", vehicleId).eq("user_id", user.id)');
  });
});

describe("step8 code — platform playbooks", () => {
  it("the gate is a workspace membership check on the admin client", () => {
    expect(PLATFORM).toContain("async function requirePlaybookWorkspace(");
    expect(PLATFORM).toContain("async function assertCallerWorkspaceMembership(");
    expect(PLATFORM).toContain('.from("workspace_members")');
    expect(PLATFORM).not.toContain("requirePlaybookUser");
  });

  it("list/create/patch/delete are all workspace-scoped", () => {
    const list = block(PLATFORM, 'get("/v1/platform/playbooks"', "platformRouter.");
    expect(list).toContain("requirePlaybookWorkspace(c, url.searchParams.get(\"workspace_id\"))");
    expect(list).toContain('.eq("workspace_id", workspaceId)');
    expect(list).toContain('.select("*, service_catalog(id, name)")');

    const create = block(PLATFORM, 'post("/v1/platform/playbooks"', "platformRouter.");
    expect(create).toContain("requirePlaybookWorkspace(c, body.workspace_id)");
    expect(create).toContain("insert({ ...row, workspace_id: workspaceId })");
    expect(create).toContain("delete row.user_id;");
    expect(create).toContain("delete row.workspace_id;");

    const patch = block(PLATFORM, 'patch("/v1/platform/playbooks/:id"', "platformRouter.");
    expect(patch).toContain('.eq("id", c.req.param("id")).eq("workspace_id", workspaceId)');

    const del = block(PLATFORM, 'delete("/v1/platform/playbooks/:id"', "platformRouter.");
    expect(del).toContain('.eq("id", c.req.param("id")).eq("workspace_id", workspaceId)');
  });

  it("seed re-keys its catalog match and stamps workspace_id", () => {
    const b = block(PLATFORM, 'post("/v1/platform/playbooks/seed"', "platformRouter.");
    expect(b).toContain('.from("service_catalog")');
    expect(b).toContain('.eq("workspace_id", workspaceId)');
    expect(b).toContain("workspace_id: workspaceId,");
    expect(b).not.toContain('.eq("user_id", userId)');
    expect(b).not.toContain("user_id: userId,");
  });
});

describe("step8 code — platform service-images", () => {
  it("GET resolves the parent service's workspace and gates on membership", () => {
    const b = block(PLATFORM, 'get("/v1/platform/service-images"', "platformRouter.");
    expect(b).toContain('.from("services")');
    expect(b).toContain("await assertCallerWorkspaceMembership(admin, uid, parent.workspace_id as string)");
    expect(b).toContain("userId: uid");
  });

  it("POST derives workspace_id from the parent row and keeps the user_id actor stamp", () => {
    const b = block(PLATFORM, 'post("/v1/platform/service-images"', "platformRouter.");
    expect(b).toContain("await assertCallerWorkspaceMembership(admin, uid, parent.workspace_id as string)");
    expect(b).toContain("workspace_id: parent.workspace_id,");
    expect(b).toContain("user_id: uid,");
  });

  it("DELETE verifies membership in the image's workspace before deleting (was: no check)", () => {
    const b = block(PLATFORM, 'delete("/v1/platform/service-images/:id"', "platformRouter.");
    expect(b).toContain("await assertCallerWorkspaceMembership(admin, uid, image.workspace_id as string)");
    expect(b).toContain('.from("service_images").delete().eq("id", c.req.param("id"))');
  });
});

describe("step8 code — client modules", () => {
  it("recurring-services query + command send workspace_id, never user_id", () => {
    expect(RECURRING_QUERY).toContain("query: { workspace_id: workspaceId }");
    expect(RECURRING_COMMAND).toContain("workspace_id: context.workspaceId,");
    expect(RECURRING_COMMAND).not.toContain("user_id: user.id,");
  });

  it("repair-pricing resolves the workspace inside the module and sends it on all four calls", () => {
    expect(REPAIR_PRICING_QUERY).toContain("resolveCurrentWorkspace()");
    expect(REPAIR_PRICING_QUERY).toContain("query: { workspace_id: workspaceId }");
    expect(REPAIR_PRICING_QUERY).toContain("workspace_id: workspaceId,");
    expect(REPAIR_PRICING_QUERY).toContain("{ workspace_id: workspaceId, status,");
    expect(REPAIR_PRICING_QUERY).not.toContain("userId");
    expect(REPAIR_PRICING_QUERY).not.toContain("user_id");
  });

  it("playbook commands take workspaceId and send workspace_id on all five + seed", () => {
    expect(PLAYBOOKS_COMMAND).toContain("workspace_id: workspaceId,");
    expect(PLAYBOOKS_COMMAND).toContain("query: { workspace_id: workspaceId }");
    expect(PLAYBOOKS_COMMAND).not.toContain("user_id");
    expect(PLAYBOOKS_COMMAND).not.toContain("userId");
    expect(PLAYBOOK_SEED_COMMAND).toContain("seedPlaybooksFromTemplates(workspaceId: string)");
    expect(PLAYBOOK_SEED_COMMAND).toContain("workspace_id: workspaceId,");
  });
});

describe("step8 code — Item #16 ghost read stays gone", () => {
  it("the serving tech-app job-detail handler never reads the services table", () => {
    const b = block(WORK_ORDERS, 'get("/v1/tech-app/job-detail"', "workOrdersRouter.");
    expect(b).not.toContain('.from("services")');
    expect(b).toContain('.from("appointment_services")');
  });
});
