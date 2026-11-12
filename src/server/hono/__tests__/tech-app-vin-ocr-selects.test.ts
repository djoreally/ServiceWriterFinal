/**
 * Schema contract for the tech-app VIN photo decode:
 * POST /v1/tech-app/jobs/:appointmentId/vin-ocr in
 * src/server/hono/routes/work-orders.ts (2026-11-12).
 *
 * The door reads a VIN from a photo for a technician standing at
 * the vehicle. The office's generic /v1/vin/ocr cannot serve it:
 * it is a dead provider stub (501 provider_not_configured), and
 * it carries no job scope. This contract pins the tech-app door:
 * - registration exactly once, as a POST on the appointment id,
 * - the caller's workspace resolved server-side, and the read
 *   refused unless the appointment is assigned to the caller,
 * - the request validated by the pure planner and the provider
 *   configured from the environment (GEMINI_API_KEY primary) —
 *   never a hardcoded provider — with the house not-configured
 *   answer when no key is present,
 * - decode-only: no table writes anywhere in the handler, so the
 *   vehicle door's save stays the only way a VIN is recorded.
 * Behavior of the planner / config / parser is tested in
 * src/application/commands/__tests__/tech-app-vin-ocr.command.test.ts.
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
  const start = SOURCE.indexOf('workOrdersRouter.post("/v1/tech-app/jobs/:appointmentId/vin-ocr"');
  expect(start).toBeGreaterThan(-1);
  const rest = SOURCE.slice(start + 10);
  const next = rest.indexOf("workOrdersRouter.");
  return next === -1 ? rest : rest.slice(0, next);
}

describe("POST /v1/tech-app/jobs/:appointmentId/vin-ocr — registration + scoping", () => {
  it("registers exactly once", () => {
    const matches = SOURCE.match(/workOrdersRouter\.post\("\/v1\/tech-app\/jobs\/:appointmentId\/vin-ocr"/g) ?? [];
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

  it("refuses cancelled jobs", () => {
    expect(handlerBlock()).toContain("job_cancelled");
  });
});

describe("POST /v1/tech-app/jobs/:appointmentId/vin-ocr — provider + honesty", () => {
  it("validates the photo through the pure planner", () => {
    const block = handlerBlock();
    expect(block).toContain("planVinOcrRequest(body)");
    expect(block).toContain("invalid_vin_photo");
  });

  it("reads the provider config from the environment — no provider hardcoded in the route", () => {
    const block = handlerBlock();
    expect(block).toContain("readVinOcrConfig(process.env)");
    expect(block).toContain("integrationUnavailable");
    expect(block).not.toContain("api.openai.com");
  });

  it("is decode-only: no table writes and no storage upload in the handler", () => {
    const block = handlerBlock();
    expect(block.match(/\.update\(/g) ?? []).toHaveLength(0);
    expect(block.match(/\.insert\(/g) ?? []).toHaveLength(0);
    expect(block).not.toContain(".storage");
  });
});
