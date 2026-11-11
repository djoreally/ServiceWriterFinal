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

const VEHICLES = readFileSync(
  join(__dirname, "../../../src/server/hono/routes/vehicles.ts"),
  "utf8",
);
const INTELLIGENCE_SERVICE = readFileSync(
  join(__dirname, "../../../src/application/services/vehicle-intelligence/vehicle-intelligence.service.ts"),
  "utf8",
);
const INTELLIGENCE_TYPES = readFileSync(
  join(__dirname, "../../../src/application/services/vehicle-intelligence/types.ts"),
  "utf8",
);
const SERVICE_DEFAULTS = readFileSync(
  join(__dirname, "../../../src/application/services/service-defaults/service-defaults.service.ts"),
  "utf8",
);
const WORK_ORDER_CREATE_PAGE = readFileSync(
  join(__dirname, "../../../src/legacy-pages/fleet-os/FleetWorkOrderCreatePage.tsx"),
  "utf8",
);
const IMPORT_TYPES = readFileSync(
  join(__dirname, "../../../src/features/vehicle-import/types.ts"),
  "utf8",
);
const BATCH_SERVICE = readFileSync(
  join(__dirname, "../../../src/features/vehicle-import/services/batch.service.ts"),
  "utf8",
);
const PIPELINE = readFileSync(
  join(__dirname, "../../../src/features/vehicle-import/pipeline.ts"),
  "utf8",
);
const STAGING = readFileSync(
  join(__dirname, "../../../src/features/vehicle-import/services/staging-persistence.service.ts"),
  "utf8",
);
const COMMIT_SERVICE = readFileSync(
  join(__dirname, "../../../src/features/vehicle-import/services/commit.service.ts"),
  "utf8",
);
const WORKFLOW = readFileSync(
  join(__dirname, "../../../src/features/vehicle-import/useVehicleImportWorkflow.ts"),
  "utf8",
);
const IMPORT_PAGE = readFileSync(
  join(__dirname, "../../../src/legacy-pages/fleet-os/ImportVehiclesPage.tsx"),
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

describe("step9 code — vehicle intelligence chain", () => {
  it("the input type gains workspaceId and the upsert stamps it (onConflict unchanged)", () => {
    expect(INTELLIGENCE_TYPES).toContain("workspaceId: string | null");
    expect(INTELLIGENCE_SERVICE).toContain("workspace_id: input.workspaceId,");
    expect(INTELLIGENCE_SERVICE).toContain('onConflict: "vehicle_id"');
    // The override read/update stay vehicle-keyed.
    const override = block(INTELLIGENCE_SERVICE, "applyVehicleIntelligenceOverride", "export async function");
    expect(override).not.toContain("workspace_id");
  });

  it("service-defaults reads profiles by workspace_id, never user_id", () => {
    expect(SERVICE_DEFAULTS).toContain("workspaceId: string | null");
    expect(SERVICE_DEFAULTS).toContain('.eq("workspace_id", input.workspaceId)');
    expect(SERVICE_DEFAULTS).not.toContain('.eq("user_id", input.userId)');
    expect(SERVICE_DEFAULTS).toContain("workspaceId: input.workspaceId,");
  });

  it("the work-order create page threads the selected workspace", () => {
    expect(WORK_ORDER_CREATE_PAGE).toContain('import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";');
    expect(WORK_ORDER_CREATE_PAGE).toContain("workspaceId: getSelectedWorkspaceId(),");
  });
});

describe("step9 code — vehicle-import staging trio", () => {
  it("the Batch type and its builders carry workspaceId beside createdBy", () => {
    expect(IMPORT_TYPES).toContain("workspaceId: string | null");
    expect(BATCH_SERVICE).toContain("workspaceId: string | null;");
    expect(BATCH_SERVICE).toContain("workspaceId: args.workspaceId,");
    expect(PIPELINE).toContain("workspaceId: string | null;");
  });

  it("persistImportBatch stamps the batch's workspace", () => {
    const b = block(STAGING, "persistImportBatch", "export async function");
    expect(b).toContain("workspace_id: batch.workspaceId,");
    expect(b).toContain("created_by: batch.createdBy,");
  });

  it("persistImportRows takes the batch's workspace as a parameter and stamps every row", () => {
    expect(STAGING).toContain("persistImportRows(rows: VehicleImportRow[], workspaceId: string | null)");
    const b = block(STAGING, "persistImportRows", "export async function");
    expect(b).toContain("workspace_id: workspaceId,");
  });

  it("hydrateImportSession round-trips the workspace back onto the Batch", () => {
    expect(STAGING).toContain("workspace_id: string | null;");
    expect(STAGING).toContain("workspaceId: batchRow.workspace_id,");
  });

  it("appendImportAuditLog takes workspaceId and stamps it", () => {
    const b = block(STAGING, "appendImportAuditLog", "export async function");
    expect(b).toContain("workspaceId: string | null;");
    expect(b).toContain("workspace_id: input.workspaceId,");
    expect(b).toContain("actor_id: input.actorId,");
  });

  it("listImportHistory keeps its created_by actor filter (actor view, RLS-bounded)", () => {
    const b = block(STAGING, "listImportHistory", "export async function");
    expect(b).toContain('.eq("created_by", createdBy)');
  });
});

describe("step9 code — commit service", () => {
  it("intelligence inputs gain the batch's workspace", () => {
    expect(COMMIT_SERVICE).toContain("workspaceId: session.batch.workspaceId,");
    expect(COMMIT_SERVICE).toContain("await upsertVehicleIntelligenceProfiles(intelligenceInputs);");
  });

  it("the rollback audit insert stamps the workspace resolved from the batch row", () => {
    const b = block(COMMIT_SERVICE, "rollbackImportedBatch", "export async function");
    expect(b).toContain('.from("vehicle_import_batches")');
    expect(b).toContain('.select("workspace_id")');
    expect(b).toContain("workspace_id: batchRow.workspace_id,");
    expect(b).toContain('event_type: "rollback_completed"');
  });
});

describe("step9 code — workflow + page threading", () => {
  it("loadFile/loadPaste accept the workspace and hand it to the session builders", () => {
    expect(WORKFLOW).toContain("const loadFile = async (file: File, createdBy: string, workspaceId: string | null) => {");
    expect(WORKFLOW).toContain("const loadPaste = async (input: string, createdBy: string, workspaceId: string | null) => {");
    expect(WORKFLOW.match(/ {6}workspaceId,\n {6}sheetTitle:/g)).toHaveLength(2);
  });

  it("every persistImportRows call passes its batch's workspace", () => {
    expect(WORKFLOW).not.toMatch(/persistImportRows\((next|processed|committed)\.rows\)/);
    expect(WORKFLOW.match(/persistImportRows\(next\.rows, next\.batch\.workspaceId\)/g)).toHaveLength(8);
    expect(WORKFLOW).toContain("persistImportRows(processed.rows, processed.batch.workspaceId)");
    expect(WORKFLOW).toContain("persistImportRows(committed.rows, committed.batch.workspaceId)");
  });

  it("every appendImportAuditLog call carries its batch's workspace (15 sites)", () => {
    const sites = WORKFLOW.match(/workspaceId: (next|processed|failed|session|committed)\.batch\.workspaceId,/g) ?? [];
    expect(sites).toHaveLength(15);
  });

  it("the page sources the workspace from getSelectedWorkspaceId at both entry points", () => {
    expect(IMPORT_PAGE).toContain('import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";');
    expect(IMPORT_PAGE).toContain('await workflow.loadFile(file, user?.id || "unknown-user", getSelectedWorkspaceId());');
    expect(IMPORT_PAGE).toContain('void workflow.loadPaste(input, user?.id || "unknown-user", getSelectedWorkspaceId());');
  });
});
