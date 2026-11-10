/**
 * Schema contract for GET /v1/command-center/technicians (2026-11-10).
 *
 * This endpoint 500'd on EVERY call in production: its service_records
 * select named title, service_type, service_date, estimated_cost and
 * assigned_technician_id — none of which exist in production — and its
 * follow-up appointments select named appointment_type, also phantom.
 * PostgREST answers 42703 for a phantom column in a select OR a filter,
 * the handler throws, and Command Center (which blocks all state when
 * either of its endpoints errors) rendered 0 jobs + "An unexpected error
 * occurred." for every user. The supabase-mock test harness cannot catch
 * this class: a mock returns canned rows for any select string, so
 * column existence is invisible to it (the Strip S2 lesson). This guard
 * pins the handler's query chains to the real schema instead.
 *
 * The column lists below are hard-coded from LIVE production, verified
 * against information_schema on 2026-11-10 (SQL lane). They are NOT
 * derived from src/integrations/supabase/types.production.ts: that file
 * is proven to UNDERSTATE the live schema — it omits
 * appointments.dispatch_status, which production has (the operational-
 * jobs dig's "Failure 1" was refuted by exactly that gap). Live
 * information_schema is the only source this guard trusts; when
 * production schema changes, re-verify there and update these lists.
 */
import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "..", "..", "..", "..");

/** Live production columns, information_schema 2026-11-10. */
const LIVE_COLUMNS: Record<string, ReadonlySet<string>> = {
  service_records: new Set([
    "appointment_id", "complaint", "completed_at", "completed_by",
    "created_at", "currency_code", "customer_id", "customer_notes",
    "diagnosis", "discount_amount", "id", "internal_notes", "metadata",
    "oil_quarts_used", "quote_id", "started_at", "status", "subtotal",
    "tax_amount", "tax_rate", "technician_id", "total_amount",
    "updated_at", "vehicle_id", "work_order_id", "work_performed",
    "workspace_id",
  ]),
  appointments: new Set([
    "assigned_user_id", "confirmation_code", "created_at", "created_by",
    "customer_id", "dispatch_status", "ends_at", "id", "location_id",
    "metadata", "notes", "source", "starts_at", "status", "updated_at",
    "vehicle_id", "workspace_id",
  ]),
};

/** Extract the source of the command-center/technicians handler only. */
function handlerSource(): string {
  const source = readFileSync(
    join(repoRoot, "src/server/hono/routes/work-orders.ts"),
    "utf8",
  );
  const start = source.indexOf('"/v1/command-center/technicians"');
  if (start < 0) throw new Error("command-center/technicians route not found");
  const end = source.indexOf("workOrdersRouter.", start);
  if (end < 0) throw new Error("command-center/technicians handler is unterminated");
  return source.slice(start, end);
}

/** Split a PostgREST select on top-level commas (joins carry parens). */
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

/** Split the handler into one segment per .from("table") query chain. */
function chainsOf(handler: string): Chain[] {
  const chains: Chain[] = [];
  const fromRe = /\.from\("([a-z_]+)"\)/g;
  let match: RegExpExecArray | null;
  let previous: { table: string; index: number } | null = null;
  while ((match = fromRe.exec(handler)) !== null) {
    if (previous) {
      chains.push({
        table: previous.table,
        body: handler.slice(previous.index, match.index),
      });
    }
    previous = { table: match[1], index: match.index };
  }
  if (previous) {
    chains.push({ table: previous.table, body: handler.slice(previous.index) });
  }
  return chains;
}

describe("GET /v1/command-center/technicians vs the live production schema", () => {
  it("names only live columns in its service_records and appointments chains", () => {
    const violations: string[] = [];
    for (const chain of chainsOf(handlerSource())) {
      const live = LIVE_COLUMNS[chain.table];
      if (!live) continue; // technicians/workspaces: no live list pinned here.

      const select = chain.body.match(/\.select\("([^"]+)"\)/);
      if (select) {
        for (const part of splitSelect(select[1])) {
          if (part.includes("(")) {
            violations.push(
              `${chain.table}: unverifiable embed "${part}" — extend this guard before adding joins here`,
            );
            continue;
          }
          // PostgREST alias form is alias:column — validate the column.
          const column = part.includes(":")
            ? part.slice(part.lastIndexOf(":") + 1).trim()
            : part;
          if (!live.has(column)) {
            violations.push(`${chain.table}.${column} (select)`);
          }
        }
      }

      // PostgREST validates filter/order columns too — a phantom there
      // 42703s exactly like a phantom select column.
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

  it("windows service_records on started_at, the live day-of-service stamp", () => {
    const srChain = chainsOf(handlerSource()).find(
      (chain) => chain.table === "service_records",
    );
    if (!srChain) throw new Error("service_records chain not found in handler");
    expect(srChain.body).toContain('.gte("started_at", from)');
    expect(srChain.body).toContain('.lte("started_at", to)');
  });
});
