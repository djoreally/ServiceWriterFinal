/**
 * Schema contract for the service_records legs of GET /v1/operational-jobs
 * and GET /v1/tech-os/roster (phantom fix #3, 2026-11-10).
 *
 * Both handlers carried the identical broken block: a service_records
 * select naming title, service_type, estimated_cost and
 * assigned_technician_id, a day window and ordering on service_date, and
 * an appointments follow-up selecting appointment_type. None of those
 * columns exist in production (live service_records has work_performed,
 * total_amount, technician_id, started_at, …; live appointments has no
 * appointment_type), so both endpoints 42703'd on every call.
 *
 * The heal mirrors — verbatim — the sibling that was already healed in
 * production for the same defect class, GET /v1/command-center/
 * technicians (guard: command-center-technicians-selects.test.ts): the
 * same live select list, the window on started_at (the job's
 * actual/scheduled start; completed_at/created_at drift to the typing
 * day on back-dated closeouts), and the appointments leg at id,metadata.
 * The dropped DTO fields (title, service_type, estimated_cost,
 * appointment_type) have no live column and no in-repo consumer:
 * nothing reads these two routes' service_records rows (the Command
 * Center reads /v1/dispatch/operational-jobs and
 * /v1/command-center/technicians; the roster client reads
 * /v1/tech-os/roster-members), so mapping them to invented values would
 * have been worse than dropping them.
 *
 * Column lists from information_schema for production on 2026-11-10
 * (same lists the command-center guard pins).
 */
import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "..", "..", "..", "..");
const SOURCE = readFileSync(
  join(repoRoot, "src/server/hono/routes/work-orders.ts"),
  "utf8",
);

const SERVICE_RECORDS_COLUMNS: ReadonlySet<string> = new Set([
  "appointment_id", "complaint", "completed_at", "completed_by",
  "created_at", "currency_code", "customer_id", "customer_notes",
  "diagnosis", "discount_amount", "id", "internal_notes", "metadata",
  "oil_quarts_used", "quote_id", "started_at", "status", "subtotal",
  "tax_amount", "tax_rate", "technician_id", "total_amount", "updated_at",
  "vehicle_id", "work_order_id", "work_performed", "workspace_id",
]);

const APPOINTMENTS_COLUMNS: ReadonlySet<string> = new Set([
  "assigned_user_id", "confirmation_code", "created_at", "created_by",
  "customer_id", "dispatch_status", "ends_at", "id", "location_id",
  "metadata", "notes", "source", "starts_at", "status", "updated_at",
  "vehicle_id", "workspace_id",
]);

const HEALED_SELECT =
  "id,status,metadata,appointment_id,technician_id,started_at,completed_at,created_at,total_amount";

function handlerSource(route: string): string {
  const start = SOURCE.indexOf(`"${route}"`);
  if (start < 0) throw new Error(`route not found: ${route}`);
  const end = SOURCE.indexOf("workOrdersRouter.", start);
  if (end < 0) throw new Error(`route handler unterminated: ${route}`);
  return SOURCE.slice(start, end);
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

function chainViolations(chain: Chain, live: ReadonlySet<string>): string[] {
  const violations: string[] = [];
  const select = chain.body.match(/\.select\("([^"]+)"\)/);
  if (select) {
    for (const column of select[1].split(",").map((part) => part.trim())) {
      if (!live.has(column)) violations.push(`${chain.table}.${column} (select)`);
    }
  }
  for (const filter of chain.body.matchAll(
    /\.(?:eq|neq|gte|lte|lt|in|order)\(\s*"([a-z_]+)"/g,
  )) {
    if (!live.has(filter[1])) {
      violations.push(`${chain.table}.${filter[1]} (filter/order)`);
    }
  }
  return violations;
}

describe.each(["/v1/operational-jobs", "/v1/tech-os/roster"])(
  "GET %s vs the live production schema",
  (route) => {
    it("queries service_records and appointments with live columns only", () => {
      const violations: string[] = [];
      for (const chain of chainsOf(handlerSource(route))) {
        if (chain.table === "service_records") {
          violations.push(...chainViolations(chain, SERVICE_RECORDS_COLUMNS));
        }
        if (chain.table === "appointments") {
          violations.push(...chainViolations(chain, APPOINTMENTS_COLUMNS));
        }
      }
      expect(violations).toEqual([]);
    });

    it("carries the healed sibling's select list and started_at window", () => {
      const serviceChain = chainsOf(handlerSource(route)).find(
        (chain) => chain.table === "service_records",
      );
      if (!serviceChain) throw new Error(`service_records chain not found in ${route}`);
      expect(serviceChain.body).toContain(`.select("${HEALED_SELECT}")`);
      expect(serviceChain.body).toContain('.gte("started_at"');
      expect(serviceChain.body).toContain('.order("started_at"');
      expect(serviceChain.body).not.toContain("service_date");
    });

    it("reads the appointments follow-up as id,metadata (no appointment_type)", () => {
      const handler = handlerSource(route);
      expect(handler).not.toContain("appointment_type");
      const appointmentsChain = chainsOf(handler).find(
        (chain) => chain.table === "appointments",
      );
      if (!appointmentsChain) throw new Error(`appointments chain not found in ${route}`);
      expect(appointmentsChain.body).toContain('.select("id,metadata")');
    });
  },
);
