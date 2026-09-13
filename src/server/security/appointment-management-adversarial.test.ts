import fs from "node:fs";
import path from "node:path";

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("appointment management adversarial contract", () => {
  const cancel = read("supabase/migrations/20260911180000_cancel_by_digest.sql");
  const reschedule = read("supabase/migrations/20260911190000_reschedule_by_digest.sql");
  const portal = read("supabase/migrations/20260911200000_customer_portal_without_tokens.sql");
  const issuance = read("src/server/appointments/management-token.ts");
  const cleanup = read("supabase/migrations/20260911230000_remove_plaintext_management_tokens.sql");
  const abuse = read("supabase/migrations/20260911220000_management_token_abuse_controls.sql");

  it("does not authorize by appointment id alone on public bearer routes", () => {
    expect(cancel).toContain("t.token_digest = v_digest");
    expect(reschedule).toContain("t.token_digest = v_digest");
    expect(cancel).not.toContain("where a.id = p_appointment_id");
    expect(reschedule).not.toContain("where a.id = p_appointment_id");
  });

  it("rejects expired or revoked public links", () => {
    for (const sql of [cancel, reschedule]) {
      expect(sql).toContain("t.revoked_at is null");
      expect(sql).toContain("(t.expires_at is null or t.expires_at > v_now)");
    }
  });

  it("keeps invalid-token responses generic", () => {
    expect(cancel).toContain("Appointment link is invalid or expired.");
    expect(reschedule).toContain("Appointment link is invalid or expired.");
    expect(cancel).not.toContain("token not found");
    expect(reschedule).not.toContain("token not found");
  });

  it("binds authenticated customer actions to customer_users ownership", () => {
    expect(portal).toContain("cu.user_id=v_user_id");
    expect(portal).toContain("cu.workspace_id=a.workspace_id");
    expect(portal).toContain("cu.customer_id=a.customer_id");
  });

  it("retains cancellation and rescheduling policy gates", () => {
    expect(cancel).toContain("cancellation_window_hours");
    expect(reschedule).toContain("reschedule_window_hours");
    expect(reschedule).toContain("min_lead_time_hours");
    expect(reschedule).toContain("working_days");
    expect(reschedule).toContain("tstzrange");
  });

  it("rotates prior active links before issuing a replacement", () => {
    expect(issuance).toContain(".update({ revoked_at: now");
    expect(issuance).toContain('.eq("appointment_id", appointmentId)');
    expect(issuance).toContain("randomBytes(32)");
  });

  it("never stores a newly issued raw bearer token", () => {
    expect(issuance).toContain("token_digest: tokenDigest");
    expect(issuance).not.toContain("raw_token:");
    expect(cleanup).toContain("- 'management_token'");
  });

  it("caps successful bearer replay", () => {
    expect(abuse).toContain("use_count between 0 and 10");
  });
});
