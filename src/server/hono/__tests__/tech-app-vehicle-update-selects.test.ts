/**
 * Schema contract for the tech-app vehicle-field update:
 * PATCH /v1/tech-app/jobs/:appointmentId/vehicle in
 * src/server/hono/routes/work-orders.ts (2026-11-12).
 *
 * The door lets the assigned technician correct mileage / VIN /
 * plate on the job's vehicle. The canonical PATCH /v1/vehicles/:id
 * cannot serve the tech app (the app holds neither a vehicle id
 * nor a workspace id, and that route checks workspace role only),
 * so this contract pins the tech-app scope instead:
 * - registration exactly once, as a PATCH on the appointment id,
 * - the caller's workspace resolved server-side,
 * - the appointment read workspace-scoped, and the write refused
 *   unless the appointment is assigned to the caller,
 * - validation delegated to the pure planner
 *   (planVehicleFieldUpdate — behavior-tested in
 *   src/application/commands/__tests__/tech-app-vehicle.command.test.ts),
 * - the update lands on the ONE vehicles row (workspace-scoped,
 *   by the appointment's vehicle_id) and answers the saved values,
 * - nothing about invoices, pricing, or the appointment itself.
 */
import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "..", "..", "..", "..");
const SOURCE = readFileSync(
  join(repoRoot, "src/server/hono/routes/work-orders.ts"),
  "utf8",
);

function handlerBlock(): string {
  const start = SOURCE.indexOf('workOrdersRouter.patch("/v1/tech-app/jobs/:appointmentId/vehicle"');
  expect(start).toBeGreaterThan(-1);
  const rest = SOURCE.slice(start + 10);
  const next = rest.indexOf("workOrdersRouter.");
  return next === -1 ? rest : rest.slice(0, next);
}

describe("PATCH /v1/tech-app/jobs/:appointmentId/vehicle — registration + scoping", () => {
  it("registers exactly once", () => {
    const matches = SOURCE.match(/workOrdersRouter\.patch\("\/v1\/tech-app\/jobs\/:appointmentId\/vehicle"/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("resolves the caller's workspace server-side", () => {
    expect(handlerBlock()).toContain("requireCallerWorkspaceId(c)");
  });

  it("reads the appointment workspace-scoped and refuses jobs not assigned to the caller", () => {
    const block = handlerBlock();
    expect(block).toContain('.from("appointments")');
    expect(block).toContain('.eq("workspace_id", workspaceId)');
    expect(block).toContain("assigned_user_id");
    expect(block).toContain("job_not_assigned");
  });

  it("refuses cancelled jobs and jobs with no vehicle on record", () => {
    const block = handlerBlock();
    expect(block).toContain("job_cancelled");
    expect(block).toContain("job_has_no_vehicle");
  });
});

describe("PATCH /v1/tech-app/jobs/:appointmentId/vehicle — the write", () => {
  it("validates through the pure planner before any write", () => {
    const block = handlerBlock();
    expect(block).toContain("planVehicleFieldUpdate(body)");
    expect(block).toContain("invalid_vehicle_fields");
    expect(block.indexOf("planVehicleFieldUpdate(body)")).toBeLessThan(block.indexOf('.from("vehicles")'));
  });

  it("updates the single vehicles row, scoped by workspace + the appointment's vehicle_id", () => {
    const block = handlerBlock();
    expect(block).toContain('.from("vehicles")');
    expect(block).toContain(".update(plan.patch as never)");
    expect(block).toContain('.eq("id", vehicleId)');
    expect(block).toContain('.select("id, vin, license_plate, mileage")');
  });

  it("answers the saved vehicle values", () => {
    const block = handlerBlock();
    expect(block).toContain("vehicle_id:");
    expect(block).toContain("license_plate:");
    expect(block).toContain("mileage:");
  });

  it("never touches invoices, pricing, or the appointment row", () => {
    const block = handlerBlock();
    expect(block.toLowerCase()).not.toContain("invoice");
    // Exactly one .update( in the whole handler: the vehicles write.
    expect(block.match(/\.update\(/g) ?? []).toHaveLength(1);
    expect(block).not.toContain("unit_price");
  });
});
