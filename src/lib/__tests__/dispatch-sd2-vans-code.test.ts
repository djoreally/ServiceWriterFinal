import { readFileSync } from "node:fs";
import { join } from "node:path";

// Pins the Dispatch S-D2 (Step 10) code translation: the vans reads move
// from the pre-recon creator key (.eq("user_id", user.id)) to the
// caller's resolved workspace; the create insert stamps workspace_id;
// the PATCH can no longer move a van between workspaces or rewrite its
// creator. Sites are the step91012 spec §6's exercised list.

const VEHICLES = readFileSync(
  join(__dirname, "../../../src/server/hono/routes/vehicles.ts"),
  "utf8",
);
const WORK_ORDERS = readFileSync(
  join(__dirname, "../../../src/server/hono/routes/work-orders.ts"),
  "utf8",
);

function block(src: string, route: string, router: string): string {
  const start = src.indexOf(route);
  if (start < 0) throw new Error(`route not found: ${route}`);
  const next = src.indexOf(router, start + route.length);
  return src.slice(start, next < 0 ? undefined : next);
}

describe("dispatch S-D2 vans code translation (vehicles.ts)", () => {
  it("stock: vans list is workspace-scoped", () => {
    const b = block(VEHICLES, '"/v1/vans/stock"', "vehiclesRouter.");
    expect(b).toContain('.eq("workspace_id", vanWorkspaceId)');
    expect(b).not.toContain('.from("vans")\n    .select("id, name")\n    .eq("user_id"');
  });

  it("detail: the van read is workspace-scoped", () => {
    const b = block(VEHICLES, '"/v1/vans/:id/detail"', "vehiclesRouter.");
    expect(b).toContain('client.from("vans").select("*").eq("id", vanId).eq("workspace_id", techWorkspaceId).single()');
  });

  it("create: the insert stamps workspace_id and keeps the creator stamp", () => {
    const b = block(VEHICLES, 'vehiclesRouter.post("/v1/vans"', "vehiclesRouter.");
    expect(b).toContain("workspace_id: vanWorkspaceId,");
    expect(b).toContain("user_id: user.id,");
  });

  it("patch: id / user_id / workspace_id are stripped from the passthrough body", () => {
    const b = block(VEHICLES, '"/v1/vans/:id"', "vehiclesRouter.");
    expect(b).toContain("const { id: _id, user_id: _userId, workspace_id: _workspaceId, ...patch } = rawPatch ?? {};");
    expect(b).toContain('.update(patch).eq("id", vanId)');
    expect(b).not.toContain(".update(body.payload ?? body)");
  });

  it("map-data: the vans leg is workspace-scoped", () => {
    const b = block(VEHICLES, '"/v1/fleet/map-data"', "vehiclesRouter.");
    expect(b).toContain('.eq("workspace_id", techWorkspaceId)');
  });

  it("vans-overview: the vans list is workspace-scoped", () => {
    const b = block(VEHICLES, '"/v1/fleet/vans-overview"', "vehiclesRouter.");
    expect(b).toContain('db.from("vans").select("*").eq("workspace_id", techWorkspaceId).order("name")');
  });
});

describe("dispatch S-D2 vans code translation (work-orders.ts)", () => {
  it("tech-app context: the latest-van read is workspace-scoped", () => {
    const b = block(WORK_ORDERS, '"/v1/tech-app/context"', "workOrdersRouter.");
    expect(b).toContain('(supabase.from("vans") as any).select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(1).maybeSingle()');
  });

  it("tech-app more: the van list resolves and scopes to the caller's workspace", () => {
    const b = block(WORK_ORDERS, '"/v1/tech-app/more"', "workOrdersRouter.");
    expect(b).toContain("const workspaceId = await resolveCallerWorkspaceId(supabase, user.id);");
    expect(b).toContain('(supabase.from("vans") as any).select("*").eq("workspace_id", workspaceId)');
  });

  it("tech-app inventory (first registration): the vans leg is workspace-scoped", () => {
    const b = block(WORK_ORDERS, '"/v1/tech-app/inventory"', "workOrdersRouter.");
    expect(b).toContain('(supabase.from("vans") as any).select("*").eq("workspace_id", workspaceId)');
    // The stale van_inventory select in this handler is a separate,
    // already-reported defect — this step deliberately leaves it.
    expect(b).toContain('.eq("technician_id", technician.id).order("item_name")');
  });
});
