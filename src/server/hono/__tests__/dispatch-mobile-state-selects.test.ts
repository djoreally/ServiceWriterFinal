/**
 * Schema contract for GET /v1/dispatch/mobile-state (phantom fix, 2026-11-10).
 *
 * The jobs leg selected appointments.priority / location_address /
 * location_lat / location_lng — none of which exist in production (live
 * census 2026-11-10: appointments has 17 columns, location lives behind
 * location_id -> locations, plus metadata). PostgREST rejected the select
 * (42703), so the entire mobile-state payload failed for every technician.
 *
 * Heal: `priority` has no live source and is dropped from the select. The
 * jobs leg selects location_id + the locations embed, and the flat
 * location_address / location_lat / location_lng fields the mobile client
 * reads are composed server-side (withMobileJobLocation) from the linked
 * locations row first, falling back to metadata — the canonical read model
 * documented on the geocode-backfill handler in the same file.
 *
 * This guard pins the jobs select's columns and the composition, because
 * mocked-supabase tests cannot see this defect class (the Strip S2 lesson,
 * same as the job-runtime and tech-app workspace guards).
 */
import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "..", "..", "..", "..");
const SOURCE = readFileSync(
  join(repoRoot, "src/server/hono/routes/appointments.ts"),
  "utf8",
);

const LIVE_COLUMNS: Record<string, ReadonlySet<string>> = {
  appointments: new Set([
    "assigned_user_id", "confirmation_code", "created_at", "created_by",
    "customer_id", "dispatch_status", "ends_at", "id", "location_id",
    "metadata", "notes", "source", "starts_at", "status", "updated_at",
    "vehicle_id", "workspace_id",
  ]),
  customers: new Set([
    "address_line1", "address_line2", "city", "company_name",
    "country_code", "created_at", "created_by", "email", "first_name",
    "id", "last_name", "metadata", "notes", "phone", "postal_code",
    "region", "status", "updated_at", "workspace_id",
  ]),
  vehicles: new Set([
    "color", "created_at", "customer_id", "id", "license_plate", "make",
    "metadata", "mileage", "mileage_unit", "model", "notes",
    "plate_region", "status", "trim", "updated_at", "vin", "workspace_id",
    "year",
  ]),
  locations: new Set([
    "address_line1", "address_line2", "city", "country_code",
    "created_at", "id", "is_active", "latitude", "location_type",
    "longitude", "name", "phone", "postal_code", "region", "updated_at",
    "workspace_id",
  ]),
};

function handlerSource(registration: string): string {
  const start = SOURCE.indexOf(registration);
  if (start < 0) throw new Error(`route not found: ${registration}`);
  const end = SOURCE.indexOf("appointmentsRouter.", start + registration.length);
  if (end < 0) throw new Error(`handler is unterminated: ${registration}`);
  return SOURCE.slice(start, end);
}

function splitSelect(select: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of select) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

const handler = handlerSource('appointmentsRouter.get("/v1/dispatch/mobile-state"');

function jobsSelect(): string {
  const fromIdx = handler.indexOf('.from("appointments")');
  if (fromIdx < 0) throw new Error("mobile-state handler has no appointments query");
  const select = handler.slice(fromIdx).match(/\.select\(\s*"([^"]+)"/);
  if (!select) throw new Error("mobile-state appointments query has no select");
  return select[1];
}

describe("GET /v1/dispatch/mobile-state jobs leg", () => {
  it("is registered exactly once", () => {
    const occurrences = SOURCE.split('"/v1/dispatch/mobile-state"').length - 1;
    expect(occurrences).toBe(1);
  });

  it("selects only live appointments columns (no priority / location_*)", () => {
    const parts = splitSelect(jobsSelect());
    for (const part of parts) {
      const embed = part.match(/^([a-z_]+)\(([^)]*)\)$/);
      if (embed) {
        const live = LIVE_COLUMNS[embed[1]];
        expect(live).toBeDefined();
        for (const col of embed[2].split(",").map((c) => c.trim())) {
          expect(live!.has(col)).toBe(true);
        }
      } else {
        expect(LIVE_COLUMNS.appointments.has(part)).toBe(true);
      }
    }
    expect(parts).not.toContain("priority");
    expect(parts).not.toContain("location_address");
    expect(parts).not.toContain("location_lat");
    expect(parts).not.toContain("location_lng");
  });

  it("carries the locations embed and location_id for server-side composition", () => {
    const parts = splitSelect(jobsSelect());
    expect(parts).toContain("location_id");
    expect(parts.some((p) => p.startsWith("locations("))).toBe(true);
  });

  it("stays workspace- and assignment-scoped", () => {
    expect(handler).toContain('.eq("workspace_id", workspaceId)');
    expect(handler).toContain('.eq("assigned_user_id", userId)');
  });

  it("composes the flat location_* fields from locations, falling back to metadata", () => {
    expect(handler).toContain("withMobileJobLocation(row)");
    expect(SOURCE).toContain("function withMobileJobLocation");
    const helperStart = SOURCE.indexOf("function withMobileJobLocation");
    const helper = SOURCE.slice(helperStart, helperStart + 1600);
    expect(helper).toContain("location.address_line1");
    expect(helper).toContain("metadata.location_address");
    expect(helper).toContain("location?.latitude ?? metadata.location_lat ?? null");
    expect(helper).toContain("location?.longitude ?? metadata.location_lng ?? null");
    // The embed itself is stripped from the payload rows.
    expect(helper).toContain("const { locations, ...rest } = row;");
  });
});
