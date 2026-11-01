/**
 * Schema contract for the Home cockpit payload (hotfix, 2026-10-31).
 *
 * Production's `appointments` table is the slim table described by
 * src/integrations/supabase/types.production.ts — this repo's deploys run
 * NO migrations, so the repo schema (types.ts, the Lovable-era shape) is
 * NOT what PostgREST serves in production. PR #152's cockpit-rows select
 * requested duration_minutes, location_address, actual_start_time and
 * estimated_cost from appointments; none of those columns exist in
 * production, so PostgREST answered 42703 for every appointment query,
 * the route threw, and Home settled on "Home data could not be loaded"
 * for every signed-in user while every other screen (which selects
 * production columns) kept working.
 *
 * This test pins the cockpit appointment select — top-level columns and
 * the customers()/vehicles() join columns — against the production
 * types, so a phantom column can never take Home down again.
 */
import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "..", "..", "..", "..");

function productionRowColumns(table: string): Set<string> {
  const source = readFileSync(
    join(repoRoot, "src/integrations/supabase/types.production.ts"),
    "utf8",
  );
  const tableStart = source.indexOf(`      ${table}: {`);
  if (tableStart < 0) throw new Error(`table ${table} not found in production types`);
  const rowStart = source.indexOf("Row: {", tableStart);
  if (rowStart < 0) throw new Error(`Row block for ${table} not found`);
  // Slice the Row block by brace counting (indentation varies).
  const braceStart = source.indexOf("{", rowStart);
  let depth = 0;
  let braceEnd = -1;
  for (let i = braceStart; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        braceEnd = i;
        break;
      }
    }
  }
  if (braceEnd < 0) throw new Error(`Row block for ${table} is unterminated`);
  const rowBlock = source.slice(braceStart, braceEnd);
  const columns = new Set<string>();
  for (const match of rowBlock.matchAll(/^\s+([a-z_]+):/gm)) {
    columns.add(match[1]);
  }
  return columns;
}

function cockpitAppointmentSelect(): string {
  const source = readFileSync(
    join(repoRoot, "src/server/hono/routes/platform.ts"),
    "utf8",
  );
  const match = source.match(/const appointmentCols =\s*"([^"]+)"/);
  if (!match) throw new Error("appointmentCols select not found in platform.ts");
  return match[1];
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

describe("cockpit-rows appointment select vs the production schema", () => {
  it("requests only columns that exist in production", () => {
    const production = {
      appointments: productionRowColumns("appointments"),
      customers: productionRowColumns("customers"),
      vehicles: productionRowColumns("vehicles"),
    };
    const missing: string[] = [];
    for (const part of splitSelect(cockpitAppointmentSelect())) {
      const join = part.match(/^([a-z_]+)\(([^)]+)\)$/);
      if (join) {
        const table = join[1] as keyof typeof production;
        for (const column of join[2].split(",").map((c) => c.trim())) {
          if (!production[table]?.has(column)) missing.push(`${table}.${column}`);
        }
      } else if (!production.appointments.has(part)) {
        missing.push(`appointments.${part}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
