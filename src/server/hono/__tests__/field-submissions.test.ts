/**
 * Field Data Collection — Phase 1 contract tests (SW-137 / SW-138).
 *
 * Grey-box through the vehicles router, same harness as vehicles.test.ts.
 * The centerpiece is the scope's proof bar, in the real live shape:
 * Dave Hamilton's 2018 Nissan NV2500 — the workspace vehicle whose
 * stored model is NULL (the federal decode calls the family "NV"),
 * whose learned tier carries engine/oil/capacity/torque from the
 * catalog wire, and whose oil filter is blank because Quick Lube
 * Data certifies no filters for 2018. Ty's ruled filter for it:
 * STP S6607.
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
import {
  authState,
  calls,
  db,
  resetHarness,
  USER_ID,
  WS_ID,
} from "../test-support/state";
import {
  normalizeFieldValue,
  parseStatedNumber,
} from "@/server/hono/lib/field-submissions";
import {
  specsFromWorkspaceRow,
  fieldEntrySources,
} from "@/server/hono/lib/data-center";

const vehiclesRouter = testRouter(vehiclesRouterRaw);

const VEHICLE_ID = "dd0e8400-e29b-41d4-a716-446655440004";
const JOB_ID = "aa0e8400-e29b-41d4-a716-446655440001";
const SUBMISSION_ID = "ff0e8400-e29b-41d4-a716-446655440001";
const NV_VIN = "1N6BF0KY7JN800080";

function seedMembership(role: string) {
  db.workspace_members = {
    data: [
      {
        workspace_id: WS_ID,
        role,
        is_active: true,
        workspaces: {
          id: WS_ID,
          name: "MOMS",
          slug: "moms",
          kind: "shop",
          timezone: "UTC",
          currency_code: "USD",
          is_active: true,
        },
      },
    ],
    error: null,
  };
}

function seedNvVehicleRow(model: string | null = null) {
  db["vehicles:single"] = {
    data: { id: VEHICLE_ID, vin: NV_VIN, year: 2018, make: "Nissan", model },
    error: null,
  };
}

/** The NV2500's learned row as production holds it: filter blank. */
function seedNvLearnedRow(overrides: Record<string, unknown> = {}) {
  db["vehicle_service_specs:single"] = {
    data: {
      engine: "4",
      oil_type: "5W-30",
      oil_capacity: "5.4 qt",
      oil_filter: null,
      source: "historical_import",
      metadata: { drain_plug_torque_ft_lbs: 25 },
      ...overrides,
    },
    error: null,
  };
}

function seedSubmissionInsert(corroborationCount = 0) {
  db["field_data_submissions:single"] = {
    data: { id: SUBMISSION_ID, corroboration_count: 0 },
    error: null,
  };
  db["rpc:record_field_submission_corroborations"] = {
    data: corroborationCount,
    error: null,
  };
}

function postFieldValue(body: Record<string, unknown>) {
  return vehiclesRouter.request("/v1/tech-app/data-center/field-values", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function submissionInserts() {
  return calls.inserts.filter((i) => i.table === "field_data_submissions");
}

function learnedUpserts() {
  return calls.upserts.filter((u) => u.table === "vehicle_service_specs");
}

function globalTableWrites() {
  return [...calls.inserts, ...calls.updates, ...calls.upserts].filter(
    (w) => w.table === "vehicle_specifications" || w.table === "qld_spec_cache",
  );
}

beforeEach(() => {
  resetHarness();
});

describe("POST /v1/tech-app/data-center/field-values — the NV2500 proof bar", () => {
  const nvBody = {
    field: "oil_filter",
    value: "STP S6607",
    vehicle_id: VEHICLE_ID,
    vin: NV_VIN,
    year: 2018,
    make: "Nissan",
    model: "NV",
    source_surface: "job_details",
    job_id: JOB_ID,
  };

  it("fills the blank learned filter, labeled field entry; global tables and QLD untouched", async () => {
    seedMembership("technician");
    seedNvVehicleRow(null); // production shape: stored model is NULL
    seedNvLearnedRow();
    seedSubmissionInsert();

    const res = await postFieldValue(nvBody);
    expect(res.status).toBe(201);
    const body = await res.json();

    // The submission landed in quarantine, attributed.
    expect(submissionInserts()).toHaveLength(1);
    const filed = submissionInserts()[0].rows as Record<string, unknown>;
    expect(filed).toMatchObject({
      workspace_id: WS_ID,
      submitted_by: USER_ID,
      submitted_by_role: "technician",
      vin: NV_VIN,
      vehicle_id: VEHICLE_ID,
      year: 2018,
      make: "Nissan",
      model: "NV", // the caller's resolved identity fills the row's blank
      engine: "4", // from the learned row
      field: "oil_filter",
      value_as_stated: "STP S6607",
      value_normalized: "STP S6607",
      source_surface: "job_details",
      source_job_id: JOB_ID,
      status: "submitted",
    });

    // Corroboration counting was invoked for the new submission.
    expect(calls.rpc).toContainEqual({
      fn: "record_field_submission_corroborations",
      params: { p_submission_id: SUBMISSION_ID },
    });

    // Blanks-only write-through: the filter filled, everything else
    // on the learned row preserved, provenance stamped.
    expect(learnedUpserts()).toHaveLength(1);
    const learned = learnedUpserts()[0].rows as Record<string, unknown>;
    expect(learned).toMatchObject({
      workspace_id: WS_ID,
      vehicle_id: VEHICLE_ID,
      engine: "4",
      oil_type: "5W-30",
      oil_capacity: "5.4 qt",
      oil_filter: "STP S6607",
    });
    const metadata = learned.metadata as Record<string, unknown>;
    expect(metadata.drain_plug_torque_ft_lbs).toBe(25);
    const provenance = metadata.field_provenance as Record<
      string,
      { submission_id: string; by: string }
    >;
    expect(provenance.oil_filter.submission_id).toBe(SUBMISSION_ID);
    expect(provenance.oil_filter.by).toBe(USER_ID);

    // The response re-renders the field with its provenance label.
    expect(body.data.writeThrough).toEqual({ applied: true, reason: "filled_blank" });
    expect(body.data.learnedSpecs.oilFilter).toBe("STP S6607");
    expect(body.data.fieldEntries).toEqual({ oilFilter: SUBMISSION_ID });
    expect(body.data.submission.status).toBe("submitted");

    // Ty's law: nothing reached the shared tables or QLD's cache.
    expect(globalTableWrites()).toHaveLength(0);
  });

  it("a second submission with a different value does NOT overwrite the first", async () => {
    seedMembership("technician");
    seedNvVehicleRow(null);
    // The first submission already landed: filter filled + stamped.
    seedNvLearnedRow({
      oil_filter: "STP S6607",
      metadata: {
        drain_plug_torque_ft_lbs: 25,
        field_provenance: {
          oil_filter: { submission_id: SUBMISSION_ID, by: USER_ID, at: "2026-11-13T22:00:00.000Z" },
        },
      },
    });
    seedSubmissionInsert();

    const res = await postFieldValue({ ...nvBody, value: "WIX 57502" });
    expect(res.status).toBe(201);
    const body = await res.json();

    // The disagreement is recorded — as a submission, nothing more.
    expect(submissionInserts()).toHaveLength(1);
    expect((submissionInserts()[0].rows as Record<string, unknown>).value_normalized).toBe("WIX 57502");
    expect(body.data.writeThrough).toEqual({ applied: false, reason: "already_present" });
    expect(learnedUpserts()).toHaveLength(0);
    expect(body.data.learnedSpecs.oilFilter).toBe("STP S6607");
    expect(body.data.fieldEntries).toEqual({ oilFilter: SUBMISSION_ID });
    expect(globalTableWrites()).toHaveLength(0);
  });

  it("a submission against an office-settled value leaves it intact and records the disagreement", async () => {
    seedMembership("technician");
    seedNvVehicleRow(null);
    // The office settled the filter itself: no field provenance.
    seedNvLearnedRow({ oil_filter: "NAPA Gold 7502" });
    seedSubmissionInsert();

    const res = await postFieldValue(nvBody);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(submissionInserts()).toHaveLength(1);
    expect(body.data.writeThrough).toEqual({ applied: false, reason: "already_present" });
    expect(learnedUpserts()).toHaveLength(0);
    expect(body.data.learnedSpecs.oilFilter).toBe("NAPA Gold 7502");
    // Not labeled a field entry — the office's value keeps its own name.
    expect(body.data.fieldEntries).toEqual({});
  });

  it("tire size and pressure get their learned home in the metadata pocket (Decision 2)", async () => {
    seedMembership("technician");
    seedNvVehicleRow(null);
    seedNvLearnedRow({ metadata: {} });
    seedSubmissionInsert();

    const sizeRes = await postFieldValue({
      field: "tire_size",
      value: "265/70R17",
      vehicle_id: VEHICLE_ID,
      vin: NV_VIN,
    });
    expect(sizeRes.status).toBe(201);
    const sizeBody = await sizeRes.json();
    expect(sizeBody.data.writeThrough).toEqual({ applied: true, reason: "filled_blank" });
    expect(sizeBody.data.learnedSpecs.tireSize).toBe("265/70R17");
    const sizeUpsert = learnedUpserts()[0].rows as Record<string, unknown>;
    expect((sizeUpsert.metadata as Record<string, unknown>).tire_size).toBe("265/70R17");

    const pressureRes = await postFieldValue({
      field: "tire_pressure",
      value: "35 psi",
      vehicle_id: VEHICLE_ID,
      vin: NV_VIN,
    });
    expect(pressureRes.status).toBe(201);
    const pressureBody = await pressureRes.json();
    expect(pressureBody.data.learnedSpecs.tirePressurePsi).toBe(35);
    const pressureUpsert = learnedUpserts()[1].rows as Record<string, unknown>;
    expect((pressureUpsert.metadata as Record<string, unknown>).tire_pressure_psi).toBe(35);
  });

  it("a bare-VIN submission with no workspace vehicle records the claim without write-through", async () => {
    seedMembership("technician");
    db["vehicles:single"] = { data: null, error: null };
    seedSubmissionInsert();

    const res = await postFieldValue({
      field: "oil_filter",
      value: "STP S6607",
      vin: NV_VIN,
      year: 2018,
      make: "Nissan",
      model: "NV",
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.writeThrough).toEqual({ applied: false, reason: "no_vehicle" });
    expect(body.data.learnedSpecs).toBeNull();
    expect(submissionInserts()).toHaveLength(1);
    expect(learnedUpserts()).toHaveLength(0);
  });

  it("rejects an unknown field and an empty value before anything is written", async () => {
    seedMembership("technician");
    const badField = await postFieldValue({ field: "warp_drive", value: "on", vin: NV_VIN });
    expect(badField.status).toBe(400);
    const empty = await postFieldValue({ field: "oil_filter", value: "   ", vin: NV_VIN });
    expect(empty.status).toBe(400);
    expect(submissionInserts()).toHaveLength(0);
  });

  it("requires authentication and an active workspace membership", async () => {
    seedMembership("technician");
    authState.mode = "unauthorized";
    const unauthenticated = await postFieldValue({ field: "oil_filter", value: "X", vin: NV_VIN });
    expect(unauthenticated.status).toBe(401);

    authState.mode = "ok";
    db.workspace_members = { data: [], error: null };
    const noWorkspace = await postFieldValue({ field: "oil_filter", value: "X", vin: NV_VIN });
    expect(noWorkspace.status).toBe(403);
    expect(submissionInserts()).toHaveLength(0);
  });

  it("carries the corroboration count the database counted", async () => {
    seedMembership("technician");
    seedNvVehicleRow(null);
    seedNvLearnedRow();
    seedSubmissionInsert(2);
    const res = await postFieldValue(nvBody);
    expect(res.status).toBe(201);
    expect((await res.json()).data.submission.corroboration_count).toBe(2);
  });
});

describe("POST /v1/tech-app/data-center/field-values/:id/retract", () => {
  function seedLandedSubmission() {
    db["field_data_submissions:single"] = {
      data: {
        id: SUBMISSION_ID,
        status: "submitted",
        field: "oil_filter",
        vehicle_id: VEHICLE_ID,
        value_normalized: "STP S6607",
      },
      error: null,
    };
    seedNvLearnedRow({
      oil_filter: "STP S6607",
      metadata: {
        drain_plug_torque_ft_lbs: 25,
        field_provenance: {
          oil_filter: { submission_id: SUBMISSION_ID, by: USER_ID, at: "2026-11-13T22:00:00.000Z" },
        },
      },
    });
  }

  it("owner retracts: submission superseded (audit-logged), its learned value cleared", async () => {
    seedMembership("owner");
    seedLandedSubmission();
    const res = await vehiclesRouter.request(
      `/v1/tech-app/data-center/field-values/${SUBMISSION_ID}/retract`,
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ ok: true, learned_cleared: true });
    const update = calls.updates.find((u) => u.table === "field_data_submissions");
    expect((update!.patch as Record<string, unknown>).status).toBe("superseded");
    const learned = learnedUpserts()[0].rows as Record<string, unknown>;
    expect(learned.oil_filter).toBeNull();
    expect((learned.metadata as Record<string, unknown>).field_provenance).toBeUndefined();
    expect(calls.inserts.some((i) => i.table === "audit_logs")).toBe(true);
  });

  it("a technician cannot retract (owner-scope only, Decision 1)", async () => {
    seedMembership("technician");
    seedLandedSubmission();
    const res = await vehiclesRouter.request(
      `/v1/tech-app/data-center/field-values/${SUBMISSION_ID}/retract`,
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
    );
    expect(res.status).toBe(403);
    expect(calls.updates.filter((u) => u.table === "field_data_submissions")).toHaveLength(0);
  });
});

describe("POST /v1/vehicle-specs/promote-parts — re-pointed at the queue", () => {
  it("files submissions instead of writing the global reference table", async () => {
    seedMembership("owner");
    seedSubmissionInsert();
    const res = await vehiclesRouter.request("/v1/vehicle-specs/promote-parts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        year: 2018,
        make: "Nissan",
        model: "NV2500",
        engine: "4",
        parts: [
          { part_category: "oil_filter", part_number: "STP S6607" },
          { part_category: "air_filter", part_number: "AF-6607" },
        ],
      }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ ok: true, submissions: 2 });
    expect(submissionInserts()).toHaveLength(2);
    for (const insert of submissionInserts()) {
      expect((insert.rows as Record<string, unknown>).source_surface).toBe("parts_registry");
      expect((insert.rows as Record<string, unknown>).workspace_id).toBe(WS_ID);
    }
    // The old door's whole point is gone: no write of any kind
    // reaches the global table, and no learned row moves either —
    // the claims are application-level, awaiting verification.
    expect(globalTableWrites()).toHaveLength(0);
    expect(learnedUpserts()).toHaveLength(0);
  });

  it("keeps the legacy skip contract when there is nothing to file", async () => {
    seedMembership("owner");
    const res = await vehiclesRouter.request("/v1/vehicle-specs/promote-parts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ year: 2018, make: "Nissan", parts: [] }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ ok: true, skipped: true });
    expect(submissionInserts()).toHaveLength(0);
  });
});

describe("office doors file submissions silently (Decision 4)", () => {
  it("PATCH /v1/vehicles/:id files the office's set spec values", async () => {
    seedNvVehicleRow("NV2500");
    seedNvLearnedRow();
    seedSubmissionInsert();
    const res = await vehiclesRouter.request(`/v1/vehicles/${VEHICLE_ID}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace_id: WS_ID, oil_filter: "NAPA Gold 7502" }),
    });
    expect(res.status).toBe(200);
    // The office's own direct write still happened (trusted door)…
    expect(learnedUpserts().length).toBeGreaterThanOrEqual(1);
    // …and the same claim was filed for the collection.
    const officeFilings = submissionInserts().filter(
      (i) => (i.rows as Record<string, unknown>).source_surface === "vehicle_page",
    );
    expect(officeFilings).toHaveLength(1);
    expect(officeFilings[0].rows).toMatchObject({
      field: "oil_filter",
      value_as_stated: "NAPA Gold 7502",
      vehicle_id: VEHICLE_ID,
      submitted_by: USER_ID,
    });
    expect(globalTableWrites()).toHaveLength(0);
  });

  it("PATCH clears a field-entry stamp when the office overwrites that field", async () => {
    seedNvVehicleRow("NV2500");
    seedNvLearnedRow({
      oil_filter: "STP S6607",
      metadata: {
        field_provenance: {
          oil_filter: { submission_id: SUBMISSION_ID, by: USER_ID, at: "2026-11-13T22:00:00.000Z" },
        },
      },
    });
    seedSubmissionInsert();
    const res = await vehiclesRouter.request(`/v1/vehicles/${VEHICLE_ID}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace_id: WS_ID, oil_filter: "NAPA Gold 7502" }),
    });
    expect(res.status).toBe(200);
    const officeUpsert = learnedUpserts()[0].rows as Record<string, unknown>;
    expect(officeUpsert.oil_filter).toBe("NAPA Gold 7502");
    expect((officeUpsert.metadata as Record<string, unknown>).field_provenance).toBeUndefined();
  });

  it("POST /v1/vehicles files the office's spec values from creation", async () => {
    db["vehicles:single"] = {
      data: { id: VEHICLE_ID, vin: NV_VIN },
      error: null,
    };
    db["vehicle_service_specs:single"] = { data: null, error: null };
    seedSubmissionInsert();
    const res = await vehiclesRouter.request("/v1/vehicles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspace_id: WS_ID,
        year: 2018,
        make: "Nissan",
        model: "NV2500",
        oil_filter: "WIX 57502",
      }),
    });
    expect(res.status).toBe(201);
    const officeFilings = submissionInserts().filter(
      (i) => (i.rows as Record<string, unknown>).source_surface === "vehicle_page",
    );
    expect(officeFilings).toHaveLength(1);
    expect(officeFilings[0].rows).toMatchObject({
      field: "oil_filter",
      value_as_stated: "WIX 57502",
    });
  });
});

describe("GET /v1/tech-app/data-center/vehicle — field entries surface with labels", () => {
  it("returns learned tire facts and the field-entry map for stamped values", async () => {
    seedMembership("technician");
    seedNvVehicleRow("NV");
    seedNvLearnedRow({
      oil_filter: "STP S6607",
      metadata: {
        drain_plug_torque_ft_lbs: 25,
        tire_size: "265/70R17",
        tire_pressure_psi: 35,
        field_provenance: {
          oil_filter: { submission_id: SUBMISSION_ID, by: USER_ID, at: "2026-11-13T22:00:00.000Z" },
        },
      },
    });
    const res = await vehiclesRouter.request(
      `/v1/tech-app/data-center/vehicle?vin=${NV_VIN}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.specs.oilFilter).toBe("STP S6607");
    expect(body.specs.tireSize).toBe("265/70R17");
    expect(body.specs.tirePressurePsi).toBe(35);
    expect(body.fieldEntries).toEqual({ oilFilter: SUBMISSION_ID });
    expect(body.fieldEntryFields).toEqual(["oilFilter"]);
  });
});

describe("field value normalization", () => {
  it("canonicalizes units where a parser exists and never merges distinct part claims", () => {
    expect(normalizeFieldValue("oil_capacity", "5.4 qt")).toBe("5.4");
    expect(normalizeFieldValue("oil_capacity", "5.4 quarts")).toBe("5.4");
    expect(normalizeFieldValue("drain_plug_torque", "25 ft-lb")).toBe("25");
    expect(normalizeFieldValue("tire_pressure", "35 psi")).toBe("35");
    expect(normalizeFieldValue("tire_size", "265/70 R17")).toBe("265/70R17");
    expect(normalizeFieldValue("oil_filter", "stp  s6607")).toBe("STP S6607");
    expect(normalizeFieldValue("oil_filter", "NAPA Gold 7502")).not.toBe(
      normalizeFieldValue("oil_filter", "WIX 57502"),
    );
    expect(parseStatedNumber("25 ft-lb")).toBe(25);
    expect(parseStatedNumber("no number")).toBeNull();
  });

  it("specsFromWorkspaceRow reads the tire pocket and fieldEntrySources honors stamps", () => {
    const row = {
      oil_type: "5W-30",
      oil_capacity: "5.4 qt",
      oil_filter: "STP S6607",
      metadata: {
        tire_size: "265/70R17",
        tire_pressure_psi: 35,
        field_provenance: {
          oil_filter: { submission_id: SUBMISSION_ID },
          tire_size: { submission_id: "another-submission" },
        },
      },
    };
    const specs = specsFromWorkspaceRow(row);
    expect(specs.tireSize).toBe("265/70R17");
    expect(specs.tirePressurePsi).toBe(35);
    expect(fieldEntrySources(row, specs, "4")).toEqual({
      oilFilter: SUBMISSION_ID,
      tireSize: "another-submission",
    });
  });
});
