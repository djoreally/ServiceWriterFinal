import { readFileSync } from "node:fs";
import { join } from "node:path";

// Pins the Recon Step 9 paired code translation: every route/feature
// that exercised legacy user_id tenancy on a Step 9 table now resolves
// and stamps workspace_id. The global filter pair stays untouched.
// Named design-vs-main divergences pinned here instead of edited:
//  - the part-assignments PATCH already builds an explicit allow-list
//    update object on current main — it never carried user_id /
//    workspace_id, so there is nothing to strip (the pin is absence);
//  - the /generate route's `services` history read was already
//    translated by Step 8 — this step keys the recommendations legs
//    of the same handler by the same resolved workspace.
//
// Pruned 2026-11-13 (dead-code pass, PR #287): the pins for the removed
// Fleet OS / vehicle-import files (vehicle-intelligence service wrapper,
// service-defaults service, FleetWorkOrderCreatePage, the vehicle-import
// staging trio, commit service, workflow hook, ImportVehiclesPage) were
// retired together with those files — the code is deleted, so its tenancy
// pins are moot. The vehicles.ts pins below cover the live route surface
// and are unchanged.

const VEHICLES = readFileSync(
  join(__dirname, "../../../src/server/hono/routes/vehicles.ts"),
  "utf8",
);

function block(src: string, route: string, router: string): string {
  const start = src.indexOf(route);
  if (start < 0) throw new Error(`route not found: ${route}`);
  const next = src.indexOf(router, start + route.length);
  return src.slice(start, next < 0 ? undefined : next);
}

describe("step9 code — vehicles.ts global filter pair stays untouched", () => {
  it("filter-applications count stays an unscoped head count", () => {
    const b = block(VEHICLES, 'get("/v1/filter-applications/count"', "vehiclesRouter.");
    expect(b).toContain('.from("filter_applications")');
    expect(b).not.toContain("workspace_id");
    expect(b).not.toContain("user_id");
  });

  it("filter-cross-refs search stays unscoped", () => {
    const b = block(VEHICLES, 'get("/v1/filter-cross-refs/search"', "vehiclesRouter.");
    expect(b).toContain('.from("filter_cross_references")');
    expect(b).not.toContain("workspace_id");
    expect(b).not.toContain("user_id");
  });
});

describe("step9 code — vehicles.ts part assignments", () => {
  it("GET stays vehicle-keyed (RLS guards; no tenancy filter in either era)", () => {
    const b = block(VEHICLES, 'get("/v1/vehicle-part-assignments"', "vehiclesRouter.");
    expect(b).toContain('.from("vehicle_part_assignments")');
    expect(b).toContain(".eq(column, vehicleId)");
    // The only workspace token in the handler is the selected_workspace_id
    // hint param name — no workspace filter, no workspace resolution.
    expect(b).not.toContain('.eq("workspace_id"');
    expect(b).not.toContain("resolveWorkspaceIdForUser");
  });

  it("POST widens the owner resolution to the parent vehicle's workspace and stamps it", () => {
    const b = block(VEHICLES, 'post("/v1/vehicle-part-assignments"', "vehiclesRouter.");
    expect(b).toContain('.from("fleet_vehicles").select("user_id, workspace_id")');
    expect(b).toContain('.from("vehicles").select("user_id, workspace_id")');
    expect(b).toContain("user_id: vehicle.user_id,");
    expect(b).toContain("workspace_id: workspaceId,");
    // Fallback chain: parent row -> fleet scope -> caller's first membership.
    expect(b).toContain("scopedWorkspaceId");
    expect(b).toContain("await resolveWorkspaceIdForUser(supabase, user.id)");
    expect(b).toContain('throw new ApiError(403, "Select a workspace before assigning parts.", "forbidden")');
    // The 409 contract is unchanged.
    expect(b).toContain('"duplicate_part"');
  });

  it("PATCH's explicit update allow-list never carried tenancy keys (nothing to strip)", () => {
    const b = block(VEHICLES, 'patch("/v1/vehicle-part-assignments/:id"', "vehiclesRouter.");
    expect(b).toContain('.from("vehicle_part_assignments")');
    expect(b).not.toContain("user_id");
    expect(b).not.toContain("workspace_id");
  });

  it("DELETE stays id-keyed", () => {
    const b = block(VEHICLES, 'delete("/v1/vehicle-part-assignments/:id"', "vehiclesRouter.");
    expect(b).toContain('.from("vehicle_part_assignments").delete().eq("id", id)');
    expect(b).not.toContain("workspace_id");
  });
});

describe("step9 code — vehicles.ts recommendations", () => {
  it("GET filters by the resolved workspace, never user_id", () => {
    const b = block(VEHICLES, 'get("/v1/vehicle-recommendations"', "vehiclesRouter.");
    expect(b).toContain('.eq("workspace_id", workspaceId)');
    expect(b).toContain("scopedWorkspaceId ?? (await resolveWorkspaceIdForUser(supabase, user.id))");
    expect(b).not.toContain('.eq("user_id"');
    expect(b).toContain('.eq("is_dismissed", false)');
  });

  it("POST stamps workspace_id AFTER the body spread (no client smuggling)", () => {
    const b = block(VEHICLES, 'post("/v1/vehicle-recommendations"', "vehiclesRouter.");
    const spread = b.indexOf("...(body.rec ?? body),");
    const userStamp = b.indexOf("user_id: user.id,");
    const workspaceStamp = b.indexOf("workspace_id: workspaceId,");
    expect(spread).toBeGreaterThan(-1);
    expect(userStamp).toBeGreaterThan(spread);
    expect(workspaceStamp).toBeGreaterThan(userStamp);
  });

  it("/generate keys the existing-check and the insert by the workspace Step 8 resolved", () => {
    const b = block(VEHICLES, 'post("/v1/vehicle-recommendations/generate"', "vehiclesRouter.");
    expect(b).toContain(
      '.from("vehicle_recommendations").select("recommendation_type").eq("vehicle_id", vehicleId).eq("workspace_id", servicesWorkspaceId).eq("is_dismissed", false)',
    );
    expect(b).not.toContain('.from("vehicle_recommendations").select("recommendation_type").eq("vehicle_id", vehicleId).eq("user_id", user.id)');
    expect(b).toContain("workspace_id: servicesWorkspaceId,");
    // The Step 8 services leg is untouched.
    expect(b).toContain('.from("services").select("*").eq("vehicle_id", vehicleId).eq("workspace_id", servicesWorkspaceId)');
  });

  it("dismiss + delete stay id-keyed", () => {
    const dismiss = block(VEHICLES, 'patch("/v1/vehicle-recommendations/:id/dismiss"', "vehiclesRouter.");
    expect(dismiss).toContain("is_dismissed: true");
    expect(dismiss).not.toContain("workspace_id");
    const del = block(VEHICLES, 'delete("/v1/vehicle-recommendations/:id"', "vehiclesRouter.");
    expect(del).toContain('.from("vehicle_recommendations").delete().eq("id", id)');
  });
});
