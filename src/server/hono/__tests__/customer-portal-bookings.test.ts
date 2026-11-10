/**
 * Schema contract for GET /v1/crm/customer-portal/bookings (phantom fix,
 * 2026-11-10).
 *
 * The handler ran a direct appointments query naming eight columns
 * production does not have (title, scheduled_date, scheduled_time,
 * duration_minutes, estimated_cost, guest_name, management_token, user_id),
 * filtered on two more phantom columns (customer_account_id, guest_email),
 * ordered on scheduled_date/time, and embedded service_catalog — which has
 * no FK path from appointments. Every call 42703'd (live census 2026-11-10:
 * appointments has 17 columns, none of those).
 *
 * Heal: keep the customer_accounts ownership verification (that table and
 * its user_id column are live), then delegate the read to
 * get_customer_portal_appointments_v1 — the canonical portal RPC the
 * sibling /customer-portal/appointments handler already serves — and
 * project its rows to the consumer's CustomerBookingRow shape
 * (src/application/queries/customer-booking.query.ts).
 *
 * This guard pins the delegation and the projection, because
 * mocked-supabase tests cannot see this defect class (the Strip S2 lesson,
 * same as the job-runtime and tech-app workspace guards).
 */
import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "..", "..", "..", "..");
const SOURCE = readFileSync(
  join(repoRoot, "src/server/hono/routes/crm.ts"),
  "utf8",
);
const CONSUMER = readFileSync(
  join(repoRoot, "src/application/queries/customer-booking.query.ts"),
  "utf8",
);

function handlerSource(registration: string): string {
  const start = SOURCE.indexOf(registration);
  if (start < 0) throw new Error(`route not found: ${registration}`);
  const end = SOURCE.indexOf("crmRouter.", start + registration.length);
  if (end < 0) throw new Error(`handler is unterminated: ${registration}`);
  return SOURCE.slice(start, end);
}

const handler = handlerSource('crmRouter.get("/v1/crm/customer-portal/bookings"');

describe("GET /v1/crm/customer-portal/bookings", () => {
  it("delegates the read to the canonical portal RPC", () => {
    expect(handler).toContain('.rpc("get_customer_portal_appointments_v1")');
    // Both portal handlers now serve the same canonical read.
    const rpcCalls = SOURCE.split('.rpc("get_customer_portal_appointments_v1")').length - 1;
    expect(rpcCalls).toBe(2);
  });

  it("no longer queries appointments directly (no phantom select/filter/order)", () => {
    expect(handler).not.toContain('.from("appointments")');
    expect(handler).not.toContain(".or(");
    expect(handler).not.toContain('.order("scheduled_date"');
    expect(handler).not.toContain("service_catalog:service_catalog");
  });

  it("keeps the customer_accounts ownership verification", () => {
    expect(handler).toContain('.from("customer_accounts")');
    expect(handler).toContain('account.user_id !== user.id');
    expect(handler).toContain('"You can only view your own bookings"');
  });

  it("projects exactly the consumer's CustomerBookingRow fields", () => {
    const dto = CONSUMER.slice(CONSUMER.indexOf("interface CustomerBookingRow"));
    const fields = [...dto.slice(0, dto.indexOf("}")).matchAll(/^\s{2}([a-z_]+)[?:]/gm)].map((m) => m[1]);
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) {
      expect(handler).toContain(`${field}:`);
    }
    // Legacy nullability rules from the sibling handler's projection.
    expect(handler).toContain('title: r.title ?? ""');
    expect(handler).toContain("duration_minutes: r.duration_minutes ?? 0");
    expect(handler).toContain("service_catalog: r.service_catalog_name ? { name: r.service_catalog_name } : null");
  });

  it("keeps the email param validation and the most-recent-first order", () => {
    expect(handler).toContain('z.string().email().max(320).parse(params.get("email"))');
    expect(handler).toContain("b.scheduled_date.localeCompare(a.scheduled_date)");
  });
});
