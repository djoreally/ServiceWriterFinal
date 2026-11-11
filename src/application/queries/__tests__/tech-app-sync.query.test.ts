import { describe, it, expect } from "@jest/globals";
import {
  bucketInspectionReports,
  bucketInspectionSteps,
  bucketJobChanges,
  bucketJobPhotos,
  bucketLocations,
  bucketRecommendations,
  composeVehicleDisplay,
  localJobStatus,
  localReportStatus,
  localStepStatus,
  mapComposedAppointmentToLocalJob,
  mapInspectionToLocalReport,
  mapJobPhotoToLocal,
  mapLocationToLocal,
  mapRecommendationToLocal,
  mapResultToLocalStep,
  type ComposedSyncAppointment,
  type ServerInspectionResultRow,
  type ServerInspectionRow,
  type ServerJobPhotoRow,
  type ServerLocationRow,
  type ServerRecommendationRow,
} from "../tech-app-sync.query";

const T0 = Date.parse("2026-11-10T12:00:00.000Z");
const T1 = Date.parse("2026-11-11T12:00:00.000Z");
const T2 = Date.parse("2026-11-11T13:00:00.000Z");

function appt(overrides: Partial<ComposedSyncAppointment> = {}): ComposedSyncAppointment {
  return {
    id: "appt-1",
    serverStatus: "scheduled",
    title: "Full Synthetic Oil Change",
    customerName: "Jane Customer",
    customerPhone: "215-555-0100",
    customerEmail: "jane@example.com",
    vehicleDisplay: "2022 BMW X5 xDrive40i",
    vin: "5UXCR6C09N9K12345",
    mileageIn: 34250,
    address: "428 Railroad Ave, Ambler, PA",
    startsAt: "2026-11-12T13:00:00.000Z",
    endsAt: "2026-11-12T13:45:00.000Z",
    durationMinutes: 45,
    estimatedCost: 133.83,
    notes: null,
    services: [{ name: "Full Synthetic Oil Change", price: 119 }],
    createdAt: new Date(T0).toISOString(),
    updatedAt: new Date(T0).toISOString(),
    ...overrides,
  };
}

describe("localJobStatus", () => {
  it("maps the server's working statuses", () => {
    expect(localJobStatus("en_route")).toBe("en_route");
    expect(localJobStatus("in_progress")).toBe("in_progress");
    expect(localJobStatus("completed")).toBe("completed");
  });

  it("reads anything not yet started as assigned", () => {
    expect(localJobStatus("scheduled")).toBe("assigned");
    expect(localJobStatus("confirmed")).toBe("assigned");
    expect(localJobStatus(null)).toBe("assigned");
    expect(localJobStatus(undefined)).toBe("assigned");
    expect(localJobStatus("something_new")).toBe("assigned");
  });
});

describe("composeVehicleDisplay", () => {
  it("joins year/make/model/trim", () => {
    expect(composeVehicleDisplay({ year: 2022, make: "BMW", model: "X5", trim: "xDrive40i" })).toBe(
      "2022 BMW X5 xDrive40i",
    );
  });

  it("skips missing parts and tolerates no vehicle", () => {
    expect(composeVehicleDisplay({ year: 2021, make: "Toyota", model: "Camry", trim: null })).toBe("2021 Toyota Camry");
    expect(composeVehicleDisplay(null)).toBe("");
    expect(composeVehicleDisplay(undefined)).toBe("");
  });
});

describe("mapComposedAppointmentToLocalJob", () => {
  it("carries the appointment id as both the row id and server_id", () => {
    const row = mapComposedAppointmentToLocalJob(appt());
    expect(row.id).toBe("appt-1");
    expect(row.server_id).toBe("appt-1");
    expect(row.services_json).toBe(JSON.stringify([{ name: "Full Synthetic Oil Change", price: 119 }]));
    expect(row.status).toBe("assigned");
  });

  it("synthesizes ends_at from the fallback duration when the server has none", () => {
    const row = mapComposedAppointmentToLocalJob(appt({ endsAt: null, durationMinutes: null }));
    expect(row.duration_minutes).toBe(45);
    expect(row.ends_at).toBe("2026-11-12T13:45:00.000Z");
  });

  it("falls back to a placeholder customer name and the created_at stamp", () => {
    const row = mapComposedAppointmentToLocalJob(appt({ customerName: null, updatedAt: null }));
    expect(row.customer_name).toBe("Customer");
    expect(row.updated_at).toBe(row.created_at);
  });
});

describe("bucketJobChanges", () => {
  it("first pull (last_pulled_at = 0) reports every live row as created", () => {
    const changes = bucketJobChanges([appt(), appt({ id: "appt-2" })], 0);
    expect(changes.created.map((r) => r.id)).toEqual(["appt-1", "appt-2"]);
    expect(changes.updated).toHaveLength(0);
    expect(changes.deleted).toHaveLength(0);
  });

  it("splits created vs updated against last_pulled_at and omits unchanged rows", () => {
    const changes = bucketJobChanges(
      [
        appt({ id: "old-unchanged" }),
        appt({ id: "old-but-edited", updatedAt: new Date(T2).toISOString() }),
        appt({ id: "brand-new", createdAt: new Date(T2).toISOString(), updatedAt: new Date(T2).toISOString() }),
      ],
      T1,
    );
    expect(changes.created.map((r) => r.id)).toEqual(["brand-new"]);
    expect(changes.updated.map((r) => r.id)).toEqual(["old-but-edited"]);
    expect(changes.deleted).toHaveLength(0);
  });

  it("routes cancelled appointments to deleted, on any pull", () => {
    const first = bucketJobChanges([appt({ serverStatus: "cancelled" })], 0);
    expect(first.created).toHaveLength(0);
    expect(first.deleted).toEqual(["appt-1"]);
    const later = bucketJobChanges([appt({ serverStatus: "cancelled", updatedAt: new Date(T2).toISOString() })], T1);
    expect(later.deleted).toEqual(["appt-1"]);
  });

  it("merges extra deleted ids but never deletes an upserted row", () => {
    const changes = bucketJobChanges([appt()], 0, ["gone-1", "appt-1"]);
    expect(changes.deleted).toEqual(["gone-1"]);
    expect(changes.created.map((r) => r.id)).toEqual(["appt-1"]);
  });
});

// ---------------------------------------------------------------------------
// SYNC-1b: inspections, steps, recommendations, photos, locations.
// ---------------------------------------------------------------------------

function inspection(overrides: Partial<ServerInspectionRow> = {}): ServerInspectionRow {
  return {
    id: "insp-1",
    appointment_id: "appt-1",
    user_id: "user-1",
    notes: "All good",
    status: "completed",
    created_at: new Date(T0).toISOString(),
    updated_at: new Date(T1).toISOString(),
    ...overrides,
  };
}

function result(overrides: Partial<ServerInspectionResultRow> = {}): ServerInspectionResultRow {
  return {
    id: "res-1",
    inspection_id: "insp-1",
    item_name: "Engine Oil Level",
    item_category: "Fluids",
    status: "good",
    notes: null,
    sort_order: 0,
    created_at: new Date(T0).toISOString(),
    ...overrides,
  };
}

function recommendation(overrides: Partial<ServerRecommendationRow> = {}): ServerRecommendationRow {
  return {
    id: "rec-1",
    appointment_id: "appt-1",
    inspection_id: "insp-1",
    inspection_result_id: "res-1",
    description: "Engine air filter",
    technician_notes: "Dirty",
    price: 59,
    created_at: new Date(T0).toISOString(),
    updated_at: new Date(T0).toISOString(),
    ...overrides,
  };
}

function photo(overrides: Partial<ServerJobPhotoRow> = {}): ServerJobPhotoRow {
  return {
    id: "photo-1",
    appointment_id: "appt-1",
    technician_id: "tech-1",
    user_id: "user-1",
    photo_type: "before",
    photo_url: "https://example.com/p1.jpg",
    storage_path: "bucket/p1.jpg",
    caption: null,
    created_at: new Date(T0).toISOString(),
    ...overrides,
  };
}

function location(overrides: Partial<ServerLocationRow> = {}): ServerLocationRow {
  return {
    id: "loc-1",
    technician_id: "tech-1",
    latitude: 40.15,
    longitude: -75.22,
    accuracy: 8,
    heading: null,
    speed: null,
    recorded_at: new Date(T0).toISOString(),
    ...overrides,
  };
}

describe("localReportStatus / mapInspectionToLocalReport", () => {
  it("maps completed and reads everything else as in_progress", () => {
    expect(localReportStatus("completed")).toBe("completed");
    expect(localReportStatus("draft")).toBe("in_progress");
    expect(localReportStatus(null)).toBe("in_progress");
  });

  it("stamps completed_at from updated_at only for completed reports", () => {
    const done = mapInspectionToLocalReport(inspection());
    expect(done.completed_at).toBe(new Date(T1).toISOString());
    expect(done.technician_id).toBe("user-1");
    expect(done.overall_notes).toBe("All good");
    const open = mapInspectionToLocalReport(inspection({ status: "draft" }));
    expect(open.completed_at).toBeNull();
    expect(open.status).toBe("in_progress");
  });
});

describe("bucketInspectionReports", () => {
  it("creates everything on a first pull", () => {
    const changes = bucketInspectionReports([inspection()], 0);
    expect(changes.created.map((r) => r.id)).toEqual(["insp-1"]);
    expect(changes.updated).toEqual([]);
    expect(changes.deleted).toEqual([]);
  });

  it("buckets created vs updated against last_pulled_at", () => {
    const created = bucketInspectionReports(
      [inspection({ created_at: new Date(T2).toISOString(), updated_at: new Date(T2).toISOString() })],
      T1,
    );
    expect(created.created).toHaveLength(1);
    const updated = bucketInspectionReports([inspection()], T0 + 1000);
    expect(updated.updated.map((r) => r.id)).toEqual(["insp-1"]);
    const unchanged = bucketInspectionReports([inspection()], T2);
    expect(unchanged.created).toEqual([]);
    expect(unchanged.updated).toEqual([]);
  });

  it("routes cancelled reports and reports of deleted jobs to deleted", () => {
    const cancelled = bucketInspectionReports([inspection({ status: "cancelled" })], 0);
    expect(cancelled.deleted).toEqual(["insp-1"]);
    const orphaned = bucketInspectionReports([inspection()], 0, new Set(["appt-1"]));
    expect(orphaned.deleted).toEqual(["insp-1"]);
    expect(orphaned.created).toEqual([]);
  });
});

describe("localStepStatus", () => {
  it("maps the full production union vocabulary", () => {
    expect(localStepStatus("good")).toBe("pass");
    expect(localStepStatus("pass")).toBe("pass");
    expect(localStepStatus("fail")).toBe("fail");
    expect(localStepStatus("urgent")).toBe("fail");
    expect(localStepStatus("attention")).toBe("warn");
    expect(localStepStatus("warning")).toBe("warn");
    expect(localStepStatus("not_applicable")).toBe("na");
    expect(localStepStatus("not_checked")).toBe("unchecked");
    expect(localStepStatus(null)).toBe("unchecked");
    expect(localStepStatus("something_new")).toBe("unchecked");
  });
});

describe("mapResultToLocalStep", () => {
  it("keys the step by sort_order and mirrors created_at into updated_at", () => {
    const step = mapResultToLocalStep(result({ sort_order: 3, status: "attention" }));
    expect(step.step_key).toBe("3");
    expect(step.sort_index).toBe(3);
    expect(step.status).toBe("warn");
    expect(step.label).toBe("Engine Oil Level");
    expect(step.updated_at).toBe(step.created_at);
  });
});

describe("bucketInspectionSteps", () => {
  it("sends steps whose parent report is in the change set", () => {
    const reportChanges = bucketInspectionReports([inspection()], 0);
    const changes = bucketInspectionSteps([result()], reportChanges, T2);
    expect(changes.created.map((r) => r.id)).toEqual(["res-1"]);
  });

  it("omits steps of an unchanged report when the step itself is old", () => {
    const reportChanges = bucketInspectionReports([inspection()], T2);
    const changes = bucketInspectionSteps([result()], reportChanges, T1);
    expect(changes.created).toEqual([]);
    expect(changes.deleted).toEqual([]);
  });

  it("sends a newly created step even when its report is unchanged", () => {
    const reportChanges = bucketInspectionReports([inspection()], T2);
    const changes = bucketInspectionSteps(
      [result({ created_at: new Date(T2).toISOString() })],
      reportChanges,
      T1,
    );
    expect(changes.created.map((r) => r.id)).toEqual(["res-1"]);
  });

  it("deletes the steps of a deleted report", () => {
    const reportChanges = bucketInspectionReports([inspection({ status: "cancelled" })], 0);
    const changes = bucketInspectionSteps([result()], reportChanges, 0);
    expect(changes.deleted).toEqual(["res-1"]);
    expect(changes.created).toEqual([]);
  });
});

describe("mapRecommendationToLocal / bucketRecommendations", () => {
  it("maps fields and coerces a numeric-string price", () => {
    const rec = mapRecommendationToLocal(recommendation({ price: "59.00" }));
    expect(rec.report_id).toBe("insp-1");
    expect(rec.step_id).toBe("res-1");
    expect(rec.recommended_service).toBe("Engine air filter");
    expect(rec.estimated_cost).toBe(59);
    expect(rec.urgency).toBeNull();
    expect(mapRecommendationToLocal(recommendation({ price: null })).estimated_cost).toBeNull();
  });

  it("buckets by timestamps and deletes with the job", () => {
    expect(bucketRecommendations([recommendation()], 0).created).toHaveLength(1);
    const updated = bucketRecommendations(
      [recommendation({ updated_at: new Date(T2).toISOString() })],
      T1,
    );
    expect(updated.updated).toHaveLength(1);
    const deleted = bucketRecommendations([recommendation()], 0, new Set(["appt-1"]));
    expect(deleted.deleted).toEqual(["rec-1"]);
  });
});

describe("mapJobPhotoToLocal / bucketJobPhotos", () => {
  it("falls back to storage_path and the user id", () => {
    const mapped = mapJobPhotoToLocal(photo({ photo_url: null, technician_id: null }));
    expect(mapped.photo_url).toBe("bucket/p1.jpg");
    expect(mapped.technician_id).toBe("user-1");
    expect(mapped.updated_at).toBe(mapped.created_at);
    expect(mapped.local_path).toBeNull();
  });

  it("creates by created_at only and deletes with the job", () => {
    expect(bucketJobPhotos([photo()], 0).created).toHaveLength(1);
    expect(bucketJobPhotos([photo()], T1).created).toEqual([]);
    const deleted = bucketJobPhotos([photo()], 0, new Set(["appt-1"]));
    expect(deleted.deleted).toEqual(["photo-1"]);
  });
});

describe("mapLocationToLocal / bucketLocations", () => {
  it("coerces numeric strings and fills all stamps from recorded_at", () => {
    const mapped = mapLocationToLocal(location({ latitude: "40.15", accuracy: "8" }));
    expect(mapped.latitude).toBe(40.15);
    expect(mapped.accuracy).toBe(8);
    expect(mapped.created_at).toBe(mapped.recorded_at);
    expect(mapped.updated_at).toBe(mapped.recorded_at);
  });

  it("buckets by recorded_at", () => {
    expect(bucketLocations([location()], 0).created).toHaveLength(1);
    expect(bucketLocations([location()], T1).created).toEqual([]);
    expect(
      bucketLocations([location({ recorded_at: new Date(T2).toISOString() })], T1).created,
    ).toHaveLength(1);
  });
});
