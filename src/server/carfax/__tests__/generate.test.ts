import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generateCarfaxFeedRun } from "../generate";
import type { CarfaxFeedRunRecorder } from "../runs";
import type {
  CarfaxExportServiceRecord,
  CarfaxFeedBusiness,
  CarfaxSourceRow,
} from "@/lib/carfax/feed";

/**
 * The generator's proof surface. The golden case drives the REAL generator —
 * pull composition, row mapping, validation, formatter — with the records
 * the reviewed sample was curated from, and requires its output to equal
 * the shipped sample byte-for-byte.
 */

const FIXTURES_DIR = join(
  process.cwd(),
  "src/application/commands/__tests__/fixtures",
);
const fixture = JSON.parse(
  readFileSync(join(FIXTURES_DIR, "carfax-sample-services.json"), "utf8"),
) as { business: CarfaxFeedBusiness; services: CarfaxExportServiceRecord[] };
const SHIPPED_SAMPLE = readFileSync(
  join(FIXTURES_DIR, "carfax-sample-expected.txt"),
  "utf8",
).replace(/\n$/, "");

const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-11-13T12:00:00.000Z");

/** Reverse the feed mapping: an export record back into its source row. */
function toSourceRow(record: CarfaxExportServiceRecord): CarfaxSourceRow {
  const v = record.vehicles;
  return {
    id: record.id,
    work_performed: record.description,
    metadata: {
      service_number: record.service_number,
      service_type: record.service_type,
    },
    completed_at: record.service_date ? `${record.service_date}T12:00:00.000Z` : null,
    created_at: record.created_at,
    vehicles: {
      vin: v.vin,
      make: v.make,
      model: v.model,
      year: v.year,
      license_plate: v.license_plate,
      plate_region: v.plate_state,
      mileage: v.mileage,
      mileage_unit: v.odometer_measure,
    },
    service_record_line_items: [
      ...(record.labor_items ?? []).map((item, i) => ({
        id: `${record.id}-labor-${i}`,
        item_type: "labor",
        description: item.description,
        quantity: null,
        labor_hours: 1,
        sort_order: i,
        created_at: record.created_at,
      })),
      ...(record.service_items ?? []).map((item, i) => ({
        id: `${record.id}-part-${i}`,
        item_type: "part",
        description: item.description,
        quantity: item.quantity,
        labor_hours: 0,
        sort_order: 100 + i,
        created_at: record.created_at,
      })),
    ],
  };
}

function makeDb(rows: CarfaxSourceRow[]) {
  const tables: Record<string, unknown> = {
    workspaces: { name: fixture.business.business_name },
    workspace_settings: {
      phone: fixture.business.phone,
      address_line1: fixture.business.address,
      address_line2: null,
      city: fixture.business.city,
      region: fixture.business.state,
      postal_code: fixture.business.postal_code,
      website_url: fixture.business.website_url,
      operational_settings: {
        carfax: { location_id: fixture.business.carfax_location_id },
      },
    },
    service_records: rows,
  };
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        not: () => chain,
        order: () => chain,
        maybeSingle: async () => ({ data: tables[table] ?? null, error: null }),
        then: (resolve: (value: { data: unknown; error: null }) => void) =>
          resolve({ data: tables[table] ?? null, error: null }),
      };
      return chain;
    },
  };
}

function makeRecorder() {
  const calls: Array<Record<string, unknown>> = [];
  const recorder: CarfaxFeedRunRecorder = {
    start: async (run) => {
      calls.push({ phase: "start", ...run });
      return "run-1";
    },
    finish: async (runId, finish) => {
      calls.push({ phase: "finish", runId, ...finish });
    },
  };
  return { recorder, calls };
}

const SFTP_OK = {
  ok: true as const,
  config: {
    host: "data.carfax.com",
    port: 22,
    username: "sw-feed",
    password: "not-a-real-password",
    remoteDir: "/",
  },
};

describe("generateCarfaxFeedRun — golden sample", () => {
  it("reproduces the shipped sample byte-for-byte for the same input", async () => {
    const { recorder, calls } = makeRecorder();
    const result = await generateCarfaxFeedRun({
      db: makeDb(fixture.services.map(toSourceRow)),
      workspaceId: WORKSPACE_ID,
      kind: "HIST",
      now: NOW,
      recorder,
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("generated");
    expect(result.fileName).toBe("SW_HIST_RO_11132026.txt");
    expect(result.recordCount).toBe(17);
    expect(result.rowCount).toBe(18);
    expect(result.content).toBe(SHIPPED_SAMPLE);
    expect(result.sha256).toBe(
      createHash("sha256").update(SHIPPED_SAMPLE, "utf8").digest("hex"),
    );
    expect(calls).toEqual([
      expect.objectContaining({ phase: "start", kind: "HIST", dryRun: false }),
      expect.objectContaining({
        phase: "finish",
        status: "generated",
        recordCount: 17,
        rowCount: 18,
        sha256: result.sha256,
        error: null,
      }),
    ]);
  });
});

describe("generateCarfaxFeedRun — validation refusal", () => {
  it("refuses the whole file when a record carries a placeholder VIN", async () => {
    const bad = JSON.parse(JSON.stringify(fixture.services[0])) as CarfaxExportServiceRecord;
    bad.vehicles = { ...bad.vehicles, vin: "5TDGBRCH3LS111111" };
    const { recorder, calls } = makeRecorder();
    const uploader = jest.fn(async () => undefined);

    const result = await generateCarfaxFeedRun({
      db: makeDb([toSourceRow(bad)]),
      workspaceId: WORKSPACE_ID,
      kind: "HIST",
      now: NOW,
      recorder,
      upload: true,
      sftpConfig: SFTP_OK,
      uploader,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("validation_failed");
    expect(result.content).toBeNull();
    expect(result.errors.join(" ")).toMatch(/placeholder/);
    expect(uploader).not.toHaveBeenCalled();
    expect(calls).toContainEqual(
      expect.objectContaining({ phase: "finish", status: "validation_failed" }),
    );
  });
});

describe("generateCarfaxFeedRun — dry run", () => {
  it("generates, validates, and records without any network call", async () => {
    const { recorder, calls } = makeRecorder();
    const uploader = jest.fn(async () => undefined);

    const result = await generateCarfaxFeedRun({
      db: makeDb(fixture.services.map(toSourceRow)),
      workspaceId: WORKSPACE_ID,
      kind: "HIST",
      now: NOW,
      recorder,
      dryRun: true,
      upload: true,
      sftpConfig: SFTP_OK,
      uploader,
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("dry_run");
    expect(result.content).toBe(SHIPPED_SAMPLE);
    expect(uploader).not.toHaveBeenCalled();
    expect(calls).toContainEqual(
      expect.objectContaining({ phase: "start", dryRun: true }),
    );
    expect(calls).toContainEqual(
      expect.objectContaining({ phase: "finish", status: "dry_run", rowCount: 18 }),
    );
  });
});

describe("generateCarfaxFeedRun — transfer", () => {
  it("fails safe and records the failure when SFTP is not configured", async () => {
    const { recorder, calls } = makeRecorder();
    const uploader = jest.fn(async () => undefined);

    const result = await generateCarfaxFeedRun({
      db: makeDb(fixture.services.map(toSourceRow)),
      workspaceId: WORKSPACE_ID,
      kind: "HIST",
      now: NOW,
      recorder,
      upload: true,
      sftpConfig: { ok: false, missing: ["CARFAX_SFTP_HOST", "CARFAX_SFTP_USER"] },
      uploader,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("upload_failed");
    expect(result.error).toContain("CARFAX_SFTP_HOST");
    expect(result.content).toBe(SHIPPED_SAMPLE);
    expect(uploader).not.toHaveBeenCalled();
    expect(calls).toContainEqual(
      expect.objectContaining({
        phase: "finish",
        status: "upload_failed",
        sha256: result.sha256,
      }),
    );
  });

  it("uploads the built file and records it when configured", async () => {
    const { recorder, calls } = makeRecorder();
    const uploader = jest.fn(async () => undefined);

    const result = await generateCarfaxFeedRun({
      db: makeDb(fixture.services.map(toSourceRow)),
      workspaceId: WORKSPACE_ID,
      kind: "HIST",
      now: NOW,
      recorder,
      upload: true,
      sftpConfig: SFTP_OK,
      uploader,
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("uploaded");
    expect(uploader).toHaveBeenCalledWith(
      SFTP_OK.config,
      "SW_HIST_RO_11132026.txt",
      SHIPPED_SAMPLE,
    );
    expect(calls).toContainEqual(
      expect.objectContaining({ phase: "finish", status: "uploaded", error: null }),
    );
  });

  it("records an uploader failure as upload_failed without throwing", async () => {
    const { recorder } = makeRecorder();
    const uploader = jest.fn(async () => {
      throw new Error("SFTP upload to data.carfax.com failed: connection reset");
    });

    const result = await generateCarfaxFeedRun({
      db: makeDb(fixture.services.map(toSourceRow)),
      workspaceId: WORKSPACE_ID,
      kind: "HIST",
      now: NOW,
      recorder,
      upload: true,
      sftpConfig: SFTP_OK,
      uploader,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("upload_failed");
    expect(result.error).toContain("connection reset");
  });
});
