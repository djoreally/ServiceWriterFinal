/**
 * Schema contract for GET /v1/jobs/:id/runtime (phantom fix #2, 2026-11-10).
 *
 * This route had TWO registrations in work-orders.ts. Hono serves the
 * FIRST match, and the first registration was a pre-recon legacy shape:
 * its appointment select named user_id, service_catalog_id, title,
 * assigned_technician_id, estimated_cost and service_date; its items
 * select named name/technician_notes/status; its invoice leg selected
 * balance_due/due_date/paid_at and filtered on invoices.appointment_id;
 * its payments select named method. None of those exist in production,
 * so the job-runtime bundle — the tech app's canonical "open a job"
 * read — 42703'd on every call. The second registration was already
 * live-shaped and workspace-scoped, and its response shape is the one
 * the repo's only runtime consumer (src/application/queries/
 * get-job-runtime.query.ts, whose ChecklistRow is {status, is_required,
 * step_name} and which reads items via item_type/description and the
 * appointment via customers/vehicles embeds + assigned_user_id) was
 * written against. The fix removed the first registration; this guard
 * pins that exactly one registration remains and that its query chains
 * name only live columns. (Mocked-supabase tests cannot see this class
 * of defect — the Strip S2 lesson, same as the command-center guard.)
 *
 * Column lists: appointments / appointment_items / service_records /
 * invoices / payments / customers / vehicles from the LIVE production
 * census of 2026-11-10; job_execution_checklists from the Step 5
 * migration DDL (20261110143000) that created it in production.
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
  service_records: new Set([
    "appointment_id", "complaint", "completed_at", "completed_by",
    "created_at", "currency_code", "customer_id", "customer_notes",
    "diagnosis", "discount_amount", "id", "internal_notes", "metadata",
    "oil_quarts_used", "quote_id", "started_at", "status", "subtotal",
    "tax_amount", "tax_rate", "technician_id", "total_amount",
    "updated_at", "vehicle_id", "work_order_id", "work_performed",
    "workspace_id",
  ]),
  invoices: new Set([
    "amount_paid", "created_at", "created_by", "customer_id", "due_at",
    "id", "invoice_number", "issued_at", "metadata", "status", "subtotal",
    "tax_total", "total", "updated_at", "vehicle_id", "work_order_id",
    "workspace_id",
  ]),
  payments: new Set([
    "amount", "created_at", "created_by", "currency_code", "customer_id",
    "id", "invoice_id", "metadata", "paid_at", "provider",
    "provider_payment_id", "status", "updated_at", "workspace_id",
  ]),
  job_execution_checklists: new Set([
    "completed_at", "completed_by", "created_at", "evidence_url", "id",
    "is_required", "job_id", "job_source", "notes", "requires_photo",
    "status", "step_key", "step_name", "step_order", "updated_at",
    "user_id", "workspace_id",
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
};

function handlerSource(): string {
  const start = SOURCE.indexOf('"/v1/jobs/:id/runtime"');
  if (start < 0) throw new Error("jobs/:id/runtime route not found");
  const end = SOURCE.indexOf("workOrdersRouter.", start);
  if (end < 0) throw new Error("jobs/:id/runtime handler is unterminated");
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

describe("GET /v1/jobs/:id/runtime vs the live production schema", () => {
  it("is registered exactly once (the phantom Gen-1 registration is gone)", () => {
    const registrations = SOURCE.match(/workOrdersRouter\.get\("\/v1\/jobs\/:id\/runtime"/g) ?? [];
    expect(registrations).toHaveLength(1);
  });

  it("names only live columns in every query chain", () => {
    const violations: string[] = [];
    for (const chain of chainsOf(handlerSource())) {
      const live = LIVE_COLUMNS[chain.table];
      if (!live) {
        violations.push(`${chain.table}: table has no pinned live column list — extend this guard`);
        continue;
      }
      const select = chain.body.match(/\.select\("([^"]+)"\)/);
      if (select) {
        for (const part of splitSelect(select[1])) {
          if (part.includes("(")) {
            // Embed: table(col, col, ...) — validate both sides.
            const embedTable = part.slice(0, part.indexOf("(")).trim();
            const embedLive = LIVE_COLUMNS[embedTable];
            if (!embedLive) {
              violations.push(`${chain.table}: unpinned embed "${embedTable}"`);
              continue;
            }
            const inner = part.slice(part.indexOf("(") + 1, part.lastIndexOf(")"));
            for (const col of inner.split(",").map((s) => s.trim())) {
              if (!embedLive.has(col)) violations.push(`${embedTable}.${col} (embed select)`);
            }
            continue;
          }
          const column = part.includes(":")
            ? part.slice(part.lastIndexOf(":") + 1).trim()
            : part;
          if (!live.has(column)) violations.push(`${chain.table}.${column} (select)`);
        }
      }
      for (const filter of chain.body.matchAll(
        /\.(?:eq|neq|gte|lte|in|order)\(\s*"([a-z_]+)"/g,
      )) {
        if (!live.has(filter[1])) {
          violations.push(`${chain.table}.${filter[1]} (filter/order)`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("links invoice and payments through metadata->>appointment_id (the live hop)", () => {
    const handler = handlerSource();
    const invoiceChain = chainsOf(handler).find((chain) => chain.table === "invoices");
    const paymentsChain = chainsOf(handler).find((chain) => chain.table === "payments");
    expect(invoiceChain?.body).toContain('.eq("metadata->>appointment_id", jobId)');
    expect(paymentsChain?.body).toContain('.eq("metadata->>appointment_id", jobId)');
  });

  it("reads the checklist from job_execution_checklists in the consumer's row shape", () => {
    const checklistChain = chainsOf(handlerSource()).find(
      (chain) => chain.table === "job_execution_checklists",
    );
    if (!checklistChain) throw new Error("job_execution_checklists chain not found");
    expect(checklistChain.body).toContain('.select("status,is_required,step_name")');
    expect(checklistChain.body).toContain('.eq("job_source", "appointment")');
  });
});
