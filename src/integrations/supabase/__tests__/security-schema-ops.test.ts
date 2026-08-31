import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("database security operations contracts", () => {
  it("keeps the public-booking preflight aligned to the canonical migration ledger version", () => {
    const preflight = readFileSync(
      join(process.cwd(), "supabase/ops/20260827_secure_public_booking_preflight.sql"),
      "utf8",
    );

    expect(preflight).toContain("20260831030526_secure_public_booking_rpc_context");
    expect(preflight).toContain("version = '20260831030526'");
    expect(preflight).not.toContain("20260827100000");
  });

  it("keeps the schema audit read-only and limited to catalog metadata", () => {
    const audit = readFileSync(
      join(process.cwd(), "supabase/ops/20260831_security_schema_audit.sql"),
      "utf8",
    );

    expect(audit).toMatch(/begin transaction read only;/i);
    expect(audit).toMatch(/rollback;/i);
    expect(audit).toMatch(/pg_proc/i);
    expect(audit).toMatch(/pg_policies/i);
    expect(audit).toMatch(/pg_constraint/i);
    expect(audit).toMatch(/not c\.relrowsecurity/i);
    expect(audit).toContain(`array['search_path=""']`);
    expect(audit).not.toMatch(/\b(?:insert|update|delete|alter|drop|create|grant|revoke)\s+(?:table|function|policy|on|into|public\.)/i);
  });
});
