/**
 * SW-42 / SW-49 — PATCH /v1/fleet/contracts/:id must not destroy stored
 * contract data the edit does not model.
 *
 * Two stored-value hazards are pinned here:
 * - pricing_rules is a JSON blob that can carry keys the contract form does
 *   not model. The handler used to replace the blob with exactly the
 *   submitted rule_engine; it now merges over the stored blob (submitted
 *   sections win, unmodelled keys survive, version_meta advances).
 * - notes is (ab)used as the version-history store, but a value that is not
 *   that JSON shape is user free text. The handler used to overwrite it with
 *   the history JSON on every save; it now leaves free-text notes untouched
 *   (the revision still lands in pricing_rules.version_meta + audit log).
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { installWebGlobals as mockInstallWebGlobals } from "../test-support/webGlobals";
import { makeServerApiMock as mockMakeServerApiMock } from "../test-support/serverApiMock";
import {
  makeSupabaseLibMock as mockMakeSupabaseLibMock,
} from "../test-support/moduleMocks";

jest.mock("next/server", () => {
  mockInstallWebGlobals();
  return jest.requireActual("next/server");
});
jest.mock("@/server/api", () =>
  mockMakeServerApiMock(jest.requireActual("@/server/api")),
);
jest.mock("@/lib/supabase", () =>
  mockMakeSupabaseLibMock(),
);

import { vehiclesRouter as vehiclesRouterRaw } from "@/server/hono/routes/vehicles";
import { testRouter } from "../test-support/routerTest";
import { calls, db, resetHarness } from "../test-support/state";

const vehiclesRouter = testRouter(vehiclesRouterRaw);

const CONTRACT_ID = "cc0e8400-e29b-41d4-a716-446655440003";
const CLIENT_ID = "cc0e8400-e29b-41d4-a716-446655440004";

const PAYLOAD = {
  fleet_client_id: CLIENT_ID,
  name: "Acme Fleet Agreement",
  start_date: "2026-01-01",
  end_date: "2026-12-31",
  is_active: false,
  change_summary: "SLA bump",
  rule_engine: {
    sla_hours: 12,
    approval: { mode: "hybrid", threshold_amount: 500, approver_role: "fleet_manager", require_photo_evidence: false },
    billing: { model: "flat_rate", invoice_frequency: "monthly", net_terms: "net_30", invoice_group: "default" },
    po: { requires_po: false, validate_remaining_balance: true },
    service_scope: { allowed_service_classes: ["oil_change"], restrict_to_profiled_services: true },
    scheduling: { enforce_location_windows: true, enforce_sla_window: true, min_dispatch_buffer_minutes: 15 },
  },
};

function contractPatch(): Record<string, unknown> {
  const entry = calls.updates.find((u) => u.table === "fleet_contracts");
  expect(entry).toBeDefined();
  return entry!.patch as Record<string, unknown>;
}

async function patchContract() {
  return vehiclesRouter.request(`/v1/fleet/contracts/${CONTRACT_ID}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload: PAYLOAD }),
  });
}

beforeEach(() => {
  resetHarness();
});

describe("PATCH /v1/fleet/contracts/:id (SW-42)", () => {
  it("merges pricing_rules over the stored blob and preserves free-text notes", async () => {
    db["fleet_contracts:single"] = {
      data: {
        pricing_rules: {
          sla_hours: 24,
          legacy_unmodelled_key: "keep-me",
          version_meta: { revision: 3 },
        },
        notes: "Call the depot before dispatch — free text",
      },
      error: null,
    };

    const res = await patchContract();
    expect(res.status).toBe(200);

    const patch = contractPatch();
    const rules = patch.pricing_rules as Record<string, unknown>;
    // Submitted values win.
    expect(rules.sla_hours).toBe(12);
    // Unmodelled stored keys survive.
    expect(rules.legacy_unmodelled_key).toBe("keep-me");
    // Revision advances from the stored version_meta.
    expect((rules.version_meta as Record<string, unknown>).revision).toBe(4);
    // Free-text notes are NOT overwritten with the version-history JSON.
    expect(patch).not.toHaveProperty("notes");
  });

  it("still appends version history when notes already hold that shape", async () => {
    db["fleet_contracts:single"] = {
      data: {
        pricing_rules: { sla_hours: 24, version_meta: { revision: 1 } },
        notes: JSON.stringify({ version_history: [{ revision: 1, change_summary: "created" }] }),
      },
      error: null,
    };

    const res = await patchContract();
    expect(res.status).toBe(200);

    const patch = contractPatch();
    const notes = JSON.parse(patch.notes as string) as { version_history: Array<Record<string, unknown>> };
    expect(notes.version_history).toHaveLength(2);
    expect(notes.version_history[1].revision).toBe(2);
    expect(notes.version_history[1].change_summary).toBe("SLA bump");
  });
});
