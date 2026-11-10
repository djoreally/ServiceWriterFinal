import { readFileSync } from "node:fs";
import { join } from "node:path";

// Pins the completion-summary mileage heal (phantom fix #1, 2026-11-10).
//
// Both completion handlers — the SERVING legacy Next route
// (app/api/v1/appointments/[id]/complete/route.ts) and its shadowed Hono
// twin (src/server/hono/routes/appointments.ts) — selected
// service_records.mileage_at_service, a column that does not exist in
// production (live census 2026-11-10: service_records has 27 columns, no
// mileage column). The failed select returned data: null for the whole
// service-record read, so every completion summary fell back to
// "Completed service" / "Recorded on service record" even though the
// sends themselves fired. The ending mileage actually lives at
// service_records.metadata.mileage (proven by a production read of a
// real completed record). Both twins are pinned together so the defect
// cannot resurface when the legacy file is retired.

const LEGACY_ROUTE = readFileSync(
  join(__dirname, "../../../app/api/v1/appointments/[id]/complete/route.ts"),
  "utf8",
);
const HONO_TWIN = readFileSync(
  join(__dirname, "../../../src/server/hono/routes/appointments.ts"),
  "utf8",
);

const FILES: Array<[string, string]> = [
  ["legacy Next complete route (serving)", LEGACY_ROUTE],
  ["Hono complete twin (shadowed)", HONO_TWIN],
];

describe.each(FILES)("completion summary mileage heal — %s", (_name, src) => {
  it("never references the phantom mileage_at_service column", () => {
    expect(src).not.toContain("mileage_at_service");
  });

  it("selects the service record's metadata alongside work_performed", () => {
    expect(src).toContain(
      'db.from("service_records").select("id,work_performed,status,metadata")',
    );
  });

  it("derives the summary mileage from metadata.mileage", () => {
    expect(src).toContain(
      "const serviceMileage = object(serviceRecord?.metadata).mileage;",
    );
    expect(src).toContain(
      '"service.mileage": serviceMileage != null ? String(serviceMileage) : "Recorded on service record"',
    );
  });

  it("preserves the pre-existing fallback copy", () => {
    expect(src).toContain('"Recorded on service record"');
    expect(src).toContain(
      '"service.work_performed": serviceRecord?.work_performed || "Completed service"',
    );
  });
});
