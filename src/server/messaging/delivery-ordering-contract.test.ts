import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("delivery ordering and suppression migration", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20260826220000_harden_delivery_ordering_and_suppression.sql"),
    "utf8",
  );

  it("rejects older provider events from regressing message state", () => {
    expect(sql).toContain("last_delivery_occurred_at");
    expect(sql).toMatch(/target_occurred_at\s*>?=\s*last_delivery_occurred_at/);
  });

  it("limits bounce and complaint suppression writes to the service role", () => {
    expect(sql).toContain("messaging_record_delivery_suppression");
    expect(sql).toMatch(/revoke execute on function public\.messaging_record_delivery_suppression[\s\S]*from public, anon, authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.messaging_record_delivery_suppression[\s\S]*to service_role/i);
  });

  it("records Enginemailer opt-outs as marketing-only suppressions", () => {
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/20260827151815_enginemailer_marketing_opt_out.sql"),
      "utf8",
    );
    expect(migration).toMatch(/messaging_record_marketing_opt_out/i);
    expect(migration).toMatch(/purpose\s*=\s*'marketing'/i);
    expect(migration).toMatch(/'marketing', target_email, 'unsubscribe'/i);
    expect(migration).toMatch(/revoke execute[\s\S]+from public, anon, authenticated/i);
    expect(migration).toMatch(/grant execute[\s\S]+to service_role/i);
  });
});
