/**
 * Schema contract for the tech-app sync push (SYNC-2, 2026-11-11):
 * POST /v1/tech-app/sync/push in src/server/hono/routes/work-orders.ts.
 *
 * Same guard style as the pull contract test: mocked-supabase tests
 * cannot see phantom columns, so the handler's shape is pinned
 * against the live production census the pull test documents —
 * every write keys on columns the pull reads back, scope is the
 * caller's workspace + assignments, and job status moves only
 * through the canonical transition RPC.
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
  const start = SOURCE.indexOf('workOrdersRouter.post("/v1/tech-app/sync/push"');
  expect(start).toBeGreaterThan(-1);
  const rest = SOURCE.slice(start + 10);
  const next = rest.indexOf("workOrdersRouter.");
  return next === -1 ? rest : rest.slice(0, next);
}

describe("POST /v1/tech-app/sync/push — registration + scoping", () => {
  it("registers exactly once", () => {
    const matches = SOURCE.match(/workOrdersRouter\.post\("\/v1\/tech-app\/sync\/push"/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("resolves the caller's workspace server-side before applying anything", () => {
    const block = handlerBlock();
    expect(block).toContain("requireCallerWorkspaceId(c)");
    expect(block).toContain('.eq("assigned_user_id", user.id)');
  });

  it("answers with per-table counts, an errors map, and a timestamp", () => {
    const block = handlerBlock();
    expect(block).toContain("applied");
    expect(block).toContain("errors");
    expect(block).toContain("timestamp: Date.now()");
  });
});

describe("POST /v1/tech-app/sync/push — apply semantics", () => {
  it("moves job status only through technician_transition_job_v1", () => {
    const block = handlerBlock();
    expect(block).toContain('db.rpc("technician_transition_job_v1"');
    expect(block).toContain('p_source: "appointment"');
    // The push never inserts or deletes appointments.
    expect(block).not.toContain('.from("appointments").insert');
    expect(block).not.toContain('.from("appointments").delete');
  });

  it("writes the tables the pull reads back", () => {
    const block = handlerBlock();
    for (const table of [
      "service_inspections",
      "inspection_results",
      "service_recommendations",
      "job_photos",
      "location_history",
    ]) {
      expect(block).toContain(`.from("${table}")`);
    }
  });

  it("replaces a report's steps wholesale (delete then insert)", () => {
    const block = handlerBlock();
    const deleteAt = block.indexOf('.from("inspection_results")\n          .delete()');
    const insertAt = block.indexOf('.from("inspection_results").insert(inserts)');
    expect(deleteAt).toBeGreaterThan(-1);
    expect(insertAt).toBeGreaterThan(deleteAt);
  });

  it("scopes locations to the caller's technicians row", () => {
    const block = handlerBlock();
    expect(block).toContain('.from("technicians")');
    expect(block).toContain("technician_id: technicianId");
  });
});
