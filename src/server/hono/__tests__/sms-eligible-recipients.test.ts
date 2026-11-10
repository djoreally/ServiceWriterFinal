/**
 * Schema contract for GET /v1/sms/eligible-recipients (phantom fix,
 * 2026-11-10).
 *
 * The handler selected appointments.scheduled_date / scheduled_time and
 * customers(name) and ordered by scheduled_date. Production has none of
 * those (live census 2026-11-10: the appointment schedule is starts_at;
 * customers carries first_name / last_name / company_name, no `name`), so
 * every call 42703'd and the SMS campaign recipient picker never loaded.
 *
 * Heal: select id, status, starts_at + customers(first_name, last_name,
 * company_name, phone), order by starts_at; workspace scoping and the
 * phone-presence filter unchanged. The in-repo consumer
 * (src/application/queries/sms.query.ts fetchSmsEligibleRecipients) is
 * updated in the same change: scheduled_at is now the starts_at timestamp
 * and customer_name is composed from the name parts with the query layer's
 * canonical composition ([first, last].join(" ") || company_name ||
 * "Customer"). The SmsRecipient output shape is unchanged.
 *
 * This guard pins the handler select and the consumer composition, because
 * mocked-supabase tests cannot see this defect class (the Strip S2 lesson,
 * same as the job-runtime and tech-app workspace guards).
 */
import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "..", "..", "..", "..");
const SOURCE = readFileSync(
  join(repoRoot, "src/server/hono/routes/messaging.ts"),
  "utf8",
);
const CONSUMER = readFileSync(
  join(repoRoot, "src/application/queries/sms.query.ts"),
  "utf8",
);

function handlerSource(registration: string): string {
  const start = SOURCE.indexOf(registration);
  if (start < 0) throw new Error(`route not found: ${registration}`);
  const end = SOURCE.indexOf("messagingRouter.", start + registration.length);
  if (end < 0) throw new Error(`handler is unterminated: ${registration}`);
  return SOURCE.slice(start, end);
}

const handler = handlerSource('messagingRouter.get("/v1/sms/eligible-recipients"');

describe("GET /v1/sms/eligible-recipients", () => {
  it("selects only live columns and orders by starts_at", () => {
    expect(handler).toContain(
      '.select("id, status, starts_at, customer:customers(first_name, last_name, company_name, phone)")',
    );
    expect(handler).toContain('.order("starts_at", { ascending: true })');
    expect(handler).not.toContain('.order("scheduled_date"');
    expect(handler).not.toContain("scheduled_date, scheduled_time");
    expect(handler).not.toContain("customers(name");
  });

  it("keeps workspace scoping, the status set, and the phone filter", () => {
    expect(handler).toContain('.eq("workspace_id", workspaceId)');
    expect(handler).toContain('.in("status", ELIGIBLE_APPOINTMENT_STATUSES)');
    expect(handler).toContain('.not("customer.phone", "is", null)');
  });
});

describe("fetchSmsEligibleRecipients consumer", () => {
  it("reads the healed row shape and composes the display name", () => {
    expect(CONSUMER).toContain("starts_at: string;");
    expect(CONSUMER).toContain("first_name?: string | null;");
    expect(CONSUMER).toContain("company_name?: string | null;");
    expect(CONSUMER).toContain(
      '[row.customer?.first_name, row.customer?.last_name].filter(Boolean).join(" ")',
    );
    expect(CONSUMER).toContain("scheduled_at: row.starts_at,");
    expect(CONSUMER).not.toContain("row.scheduled_date");
    expect(CONSUMER).not.toContain("row.customer?.name");
  });

  it("keeps the SmsRecipient output contract", () => {
    const typeStart = CONSUMER.indexOf("interface SmsRecipient");
    const typeText = CONSUMER.slice(typeStart, CONSUMER.indexOf("}", typeStart));
    for (const field of ["appointment_id", "customer_name", "phone", "status", "scheduled_at"]) {
      expect(typeText).toContain(field);
    }
  });
});
