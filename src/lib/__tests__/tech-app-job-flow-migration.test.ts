import { readFileSync } from "node:fs";
import { join } from "node:path";

// Pins the tech-app job-flow migration (20261112030000, Ty's
// approved flow of 2026-11-12) — the ordered travel leg, the
// travel record, the shift gate, and the playbook
// components/seed — against the v1 transition body it extends
// (20261112025500), so the new rules cannot silently drift out
// of the canonical transition path.

const MIGRATIONS = join(__dirname, "../../../supabase/migrations");
const FLOW = readFileSync(
  join(MIGRATIONS, "20261112030000_tech_app_job_flow.sql"),
  "utf8",
);

function bodyOf(sql: string, fn: string): string {
  const start = sql.indexOf(`create or replace function public.${fn}`);
  if (start < 0) throw new Error(`function ${fn} not found`);
  const open = sql.indexOf("as $$", start);
  const close = sql.indexOf("$$;", open);
  if (open < 0 || close < 0) throw new Error(`body of ${fn} not delimited`);
  return sql.slice(open + "as $$".length, close);
}

const V2 = bodyOf(FLOW, "technician_transition_job_v2");

describe("technician_transition_job_v2 — order", () => {
  it("en_route requires dispatch_status 'assigned'", () => {
    expect(V2).toContain("if v_dispatch_status <> 'assigned'");
    expect(V2).toContain("En route requires an assigned job");
  });

  it("arrived requires the job to be en route first", () => {
    expect(V2).toContain("if v_dispatch_status <> 'en_route'");
    expect(V2).toContain("Arrival requires the job to be en route first");
  });

  it("an en-route job cannot start work; assigned and arrived can", () => {
    expect(V2).toContain("if v_dispatch_status = 'en_route'");
    expect(V2).toContain("Tap Arrived before beginning work");
    expect(V2).toContain("v_dispatch_status not in ('assigned','arrived','started')");
  });
});

describe("technician_transition_job_v2 — travel record", () => {
  it("stamps en_route_at / arrived_at and the tap locations when provided", () => {
    expect(V2).toContain("'{en_route_at}'");
    expect(V2).toContain("'{arrived_at}'");
    expect(V2).toContain("'{en_route_lat}'");
    expect(V2).toContain("'{arrived_lat}'");
  });

  it("computes travel_duration_seconds and a haversine distance only from real locations", () => {
    expect(V2).toContain("'{travel_duration_seconds}'");
    expect(V2).toContain("3958.8 * acos(");
    expect(V2).toContain("'{travel_distance_miles}'");
    // Missing a location: the distance key is REMOVED and the
    // capture flag is false — never an estimated number.
    expect(V2).toContain("v_metadata - 'travel_distance_miles'");
    expect(V2).toContain("'{travel_distance_captured}',to_jsonb(false)");
  });

  it("stamps the dispatch_status column alongside metadata on appointments", () => {
    expect(V2).toContain("dispatch_status='en_route'");
    expect(V2).toContain("dispatch_status='arrived'");
    expect(V2).toContain("dispatch_status='started'");
  });
});

describe("technician_transition_job_v2 — shift gate", () => {
  it("en_route and start require an open shift; completion is not gated", () => {
    expect(V2).toContain("if v_next in ('en_route','in_progress','started') then");
    expect(V2).toContain("from public.time_clock_entries t");
    expect(V2).toContain("t.user_id=v_actor and t.clock_out is null");
    expect(V2).toContain("CLOCK_IN_REQUIRED");
  });
});

describe("playbook components + Oil Change seed", () => {
  it("adds components beside steps on playbooks and templates", () => {
    expect(FLOW).toContain("alter table public.service_playbooks");
    expect(FLOW).toContain("alter table public.service_playbook_templates");
    expect(FLOW).toContain("add column if not exists components jsonb not null default '[]'::jsonb");
  });

  it("seeds the Oil Change Service SOP exactly once, with drain + refill steps", () => {
    expect(FLOW).toContain("'Oil Change Service'");
    expect(FLOW).toContain("Drain the old engine oil");
    expect(FLOW).toContain("Refill with the specified oil and quantity");
    expect(FLOW).toContain("Engine oil change");
    expect(FLOW).toContain("Oil filter replacement");
    expect(FLOW).toContain("where not exists (");
  });

  it("makes templates staff-readable without opening writes", () => {
    expect(FLOW).toContain("service_playbook_templates_staff_select");
    expect(FLOW).not.toMatch(/create policy[^;]*service_playbook_templates[^;]*for (insert|update|delete)/);
  });
});
