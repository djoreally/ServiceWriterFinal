/**
 * Schema contract for the tech-app workspace reads (phantom fix, 2026-11-10):
 * GET /v1/tech-app/job-workspace, GET /v1/tech-app/job-workspace-v2,
 * GET /v1/tech-app/job-detail, POST /v1/tech-app/appointment-notes.
 *
 * All four handlers keyed their appointment reads on appointments.user_id —
 * a column that does not exist in production — so every call 42703'd:
 * - job-workspace / job-workspace-v2 scoped `.eq("user_id", user.id)` and
 *   then used `appointment.user_id` as the workspace key for the catalog
 *   and technician legs; their appointment_items selects also named
 *   name/status/technician_notes and their service_catalog selects named
 *   base_price/duration_minutes (live: description/item_type and
 *   labor_price/estimated_minutes).
 * - job-detail had TWO registrations. The serving (first) one combined
 *   the user_id filter with a read of the non-existent `services` table,
 *   and its { appointment, service } shape is not what the repo's
 *   consumer (src/application/queries/tech-app.query.ts
 *   fetchTechJobDetailBundle) reads. The shadowed bundle registration
 *   was healed instead (live columns + locations embed; the
 *   service_catalog(name, price) embed named a phantom price column)
 *   and the first registration was removed — the jobs/:id/runtime
 *   precedent from phantom fix #2. Its source resolution previously
 *   called get_technician_job_workspace_v1, an RPC that does not exist
 *   in production; it now probes the appointments table (the only job
 *   table production has) and keeps the explicit 404 for anything else.
 * - appointment-notes updated with `.eq("user_id", user.id)`.
 *
 * The heal follows the file's Step 4 idiom: resolveCallerWorkspaceId
 * (exactly-one-active-membership resolution via workspace_members) and
 * workspace_id scoping. This guard pins the registrations and every
 * query chain's columns, because mocked-supabase tests cannot see this
 * defect class (the Strip S2 lesson, same as the command-center and
 * job-runtime guards).
 *
 * Column lists: appointments / appointment_items / service_catalog /
 * appointment_services / customers / vehicles / technicians / locations
 * from the LIVE production census of 2026-11-10; threads / job_comments
 * / job_photos from the Step 5 migration DDL (20261110143000) that
 * created them in production.
 */
import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "..", "..", "..", "..");
const SOURCE = readFileSync(
  join(repoRoot, "src/server/hono/routes/work-orders.ts"),
  "utf8",
);

const LIVE_COLUMNS: Record<string, ReadonlySet<string>> = {
  appointments: new Set([
    "assigned_user_id", "confirmation_code", "created_at", "created_by",
    "customer_id", "dispatch_status", "ends_at", "id", "location_id",
    "metadata", "notes", "source", "starts_at", "status", "updated_at",
    "vehicle_id", "workspace_id",
  ]),
  appointment_items: new Set([
    "added_at_service", "appointment_id", "created_at", "description",
    "id", "is_prepaid", "item_type", "metadata", "quantity",
    "service_catalog_id", "sort_order", "unit_price", "updated_at",
    "workspace_id",
  ]),
  service_catalog: new Set([
    "category", "created_at", "description", "estimated_minutes", "id",
    "inspection_template_id", "is_active", "labor_price", "metadata",
    "name", "updated_at", "workspace_id",
  ]),
  appointment_services: new Set([
    "added_at_service", "appointment_id", "created_at", "description",
    "id", "is_prepaid", "name", "price", "quantity", "service_catalog_id",
    "updated_at", "vehicle_id",
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
  technicians: new Set([
    "accepted_at", "account_status", "address", "assigned_at",
    "assigned_van_id", "auth_user_id", "avatar_url",
    "avg_job_duration_minutes", "background_check_date",
    "background_check_status", "base_hourly_rate", "bio", "callback_rate",
    "certifications", "city", "commission_percentage", "country",
    "created_at", "current_latitude", "current_location",
    "current_longitude", "custom_fields", "customer_rating_avg",
    "data_origin", "deactivated_at", "deactivated_by", "deleted_at",
    "display_name", "drivers_license_expiration", "drivers_license_expiry",
    "drivers_license_number", "drivers_license_state",
    "drivers_license_url", "drug_test_date", "drug_test_status", "email",
    "emergency_contact_name", "emergency_contact_phone",
    "emergency_contact_relationship", "employee_id", "employment_type",
    "first_name", "full_name", "hire_date", "home_address", "home_lat",
    "home_latitude", "home_lng", "home_longitude", "home_zip",
    "hourly_rate", "id", "import_batch_id", "insurance_info",
    "insurance_verified", "invitation_id", "invited_at", "invited_by",
    "is_active", "jobs_completed_mtd", "last_clock_in", "last_clock_out",
    "last_location_update", "last_name", "latitude",
    "license_expiration_date", "location_tracking_enabled",
    "location_updated_at", "longitude", "max_daily_capacity_hours",
    "max_jobs_per_day", "name", "notes", "offboarding_notes",
    "onboarding_completed", "origin_source", "overtime_rate", "pay_type",
    "payroll_type", "performance_score", "phone", "preferences",
    "redo_rate", "retained_auth_user_id", "revenue_generated_mtd", "role",
    "salary", "service_radius_miles", "skills", "state", "status",
    "team_id", "termination_date", "updated_at", "upsell_rate", "user_id",
    "weekly_capacity_hours", "working_hours", "workspace_id", "zip_code",
  ]),
  locations: new Set([
    "address_line1", "address_line2", "city", "country_code",
    "created_at", "id", "is_active", "latitude", "location_type",
    "longitude", "name", "phone", "postal_code", "region", "updated_at",
    "workspace_id",
  ]),
  threads: new Set([
    "created_at", "created_by", "deleted_at", "id", "job_id",
    "job_source", "subject", "updated_at", "workspace_id",
  ]),
  job_comments: new Set([
    "appointment_id", "author_id", "author_name", "body", "created_at",
    "id", "workspace_id",
  ]),
  operational_jobs: new Set([
    "created_at", "id", "job_id", "job_source", "updated_at",
    "workspace_id",
  ]),
  job_photos: new Set([
    "appointment_id", "business_user_id", "caption", "captured_at",
    "created_at", "file_name", "file_size", "id", "is_required",
    "location", "photo_type", "photo_url", "storage_path",
    "technician_id", "uploaded_by", "user_id", "workspace_id",
  ]),
};

function handlerSource(registration: string): string {
  const start = SOURCE.indexOf(registration);
  if (start < 0) throw new Error(`route not found: ${registration}`);
  const end = SOURCE.indexOf("workOrdersRouter.", start + registration.length);
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

interface Chain {
  table: string;
  body: string;
}

function chainsOf(handler: string): Chain[] {
  const chains: Chain[] = [];
  const fromRe = /\.from\("([a-z_]+)"\)/g;
  let match: RegExpExecArray | null;
  let previous: { table: string; index: number } | null = null;
  while ((match = fromRe.exec(handler)) !== null) {
    if (previous) {
      chains.push({ table: previous.table, body: handler.slice(previous.index, match.index) });
    }
    previous = { table: match[1], index: match.index };
  }
  if (previous) {
    chains.push({ table: previous.table, body: handler.slice(previous.index) });
  }
  return chains;
}

function violationsIn(handler: string): string[] {
  const violations: string[] = [];
  for (const chain of chainsOf(handler)) {
    const live = LIVE_COLUMNS[chain.table];
    if (!live) {
      violations.push(`${chain.table}: table has no pinned live column list — extend this guard`);
      continue;
    }
    const select = chain.body.match(/\.select\(\s*(?:"([^"]+)"|`([^`]+)`)/);
    const selectText = select?.[1] ?? select?.[2];
    if (selectText && selectText.trim() !== "*") {
      for (const part of splitSelect(selectText.replace(/\s+/g, " "))) {
        if (part.includes("(")) {
          const embedTable = part.slice(0, part.indexOf("(")).trim();
          const embedLive = LIVE_COLUMNS[embedTable];
          if (!embedLive) {
            violations.push(`${chain.table}: unpinned embed "${embedTable}"`);
            continue;
          }
          const inner = part.slice(part.indexOf("(") + 1, part.lastIndexOf(")"));
          for (const col of inner.split(",").map((s) => s.trim())) {
            if (col && !embedLive.has(col)) violations.push(`${embedTable}.${col} (embed select)`);
          }
          continue;
        }
        const column = part.includes(":")
          ? part.slice(part.lastIndexOf(":") + 1).trim()
          : part;
        if (column && !live.has(column)) violations.push(`${chain.table}.${column} (select)`);
      }
    }
    for (const filter of chain.body.matchAll(
      /\.(?:eq|neq|gte|lte|in|order|is)\(\s*"([a-z_]+)"/g,
    )) {
      if (!live.has(filter[1])) {
        violations.push(`${chain.table}.${filter[1]} (filter/order)`);
      }
    }
    for (const update of chain.body.matchAll(/\.update\(\{\s*([a-z_]+)\s*:/g)) {
      if (!live.has(update[1])) {
        violations.push(`${chain.table}.${update[1]} (update payload)`);
      }
    }
  }
  return violations;
}

const JOB_WORKSPACE = 'workOrdersRouter.get("/v1/tech-app/job-workspace",';
const JOB_WORKSPACE_V2 = 'workOrdersRouter.get("/v1/tech-app/job-workspace-v2",';
const JOB_DETAIL = 'workOrdersRouter.get("/v1/tech-app/job-detail",';
const APPOINTMENT_NOTES = 'workOrdersRouter.post("/v1/tech-app/appointment-notes",';

describe("tech-app workspace reads vs the live production schema", () => {
  it("registers each healed route exactly once (the job-detail Gen-1 is gone)", () => {
    for (const registration of [JOB_WORKSPACE, JOB_WORKSPACE_V2, JOB_DETAIL, APPOINTMENT_NOTES]) {
      expect(SOURCE.split(registration).length - 1).toBe(1);
    }
  });

  it("scopes appointments by workspace_id, never by the phantom user_id", () => {
    expect(handlerSource(JOB_WORKSPACE)).toContain('.eq("workspace_id", callerWorkspaceId)');
    expect(handlerSource(JOB_WORKSPACE_V2)).toContain('.eq("workspace_id", callerWorkspaceId)');
    expect(handlerSource(APPOINTMENT_NOTES)).toContain('.eq("workspace_id", workspaceId)');
    for (const registration of [JOB_WORKSPACE, JOB_WORKSPACE_V2, JOB_DETAIL, APPOINTMENT_NOTES]) {
      expect(handlerSource(registration)).not.toContain('.eq("user_id"');
    }
  });

  it("derives job-workspace's downstream workspace from appointment.workspace_id", () => {
    expect(handlerSource(JOB_WORKSPACE)).toContain("const workspaceId = appointment.workspace_id;");
    expect(handlerSource(JOB_WORKSPACE)).not.toContain("appointment.user_id");
  });

  it("names only live columns in every query chain of all four handlers", () => {
    for (const registration of [JOB_WORKSPACE, JOB_WORKSPACE_V2, JOB_DETAIL, APPOINTMENT_NOTES]) {
      expect(violationsIn(handlerSource(registration))).toEqual([]);
    }
  });

  it("job-detail resolves its source without the absent workspace RPC and keeps the explicit 404", () => {
    const handler = handlerSource(JOB_DETAIL);
    expect(handler).not.toMatch(/\(supabase\.rpc as any\)\(\s*"get_technician_job_workspace_v1"/);
    expect(handler).not.toContain('.from("services")');
    expect(handler).toContain('"job_unresolved"');
    expect(handler).toContain('const source: string | null = probe ? "appointment" : null;');
  });
});
