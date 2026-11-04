import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Source-contract tests for the website-booking management token
// migration (20261104120000). The customer-portal reschedule/cancel
// flow keys off appointments.metadata ->> 'management_token', minted at
// insert by ensure_appointment_management_token_v1(). That mint only
// covered source = 'public_booking' (20260907155000, crypto-qualified in
// 20260909205000), so appointments pushed from the MOMS website
// (source = 'moms_website') never got a token. These assertions pin the
// migration's shape: the mint condition widens to moms_website and
// NOTHING else changes — same function body, same token generation,
// same trigger, same privileges — plus a future-only backfill scoped
// exactly like the original 20260907155000 backfill. Behavior against a
// live database is proven when the migration is applied at merge time;
// this migration is intentionally NOT applied by the PR itself.
describe("website booking management token migration", () => {
  const sql = readFileSync(
    resolve(
      process.cwd(),
      "supabase/migrations/20261104120000_issue_management_tokens_for_website_bookings.sql",
    ),
    "utf8",
  );
  const backfillAt = sql.indexOf("update public.appointments");
  const functionSection = sql.slice(0, backfillAt);
  const backfillSection = sql.slice(backfillAt);

  describe("ensure_appointment_management_token_v1", () => {
    it("mints for public_booking and moms_website, and only when no token exists yet", () => {
      expect(functionSection).toContain(
        "create or replace function public.ensure_appointment_management_token_v1()",
      );
      expect(functionSection).toContain(
        "if new.source in ('public_booking', 'moms_website')",
      );
      expect(functionSection).toContain(
        "and nullif(new.metadata ->> 'management_token','') is null then",
      );
      expect(functionSection).toContain(
        "new.metadata := coalesce(new.metadata,'{}'::jsonb)",
      );
    });

    it("keeps the hardened shape from 20260909205000 (security definer, empty search_path, revoked execute)", () => {
      expect(functionSection).toContain("security definer");
      expect(functionSection).toContain("set search_path to ''");
      expect(sql).toContain(
        "revoke execute on function public.ensure_appointment_management_token_v1()",
      );
      expect(sql).toContain("from public, anon, authenticated;");
    });

    it("does not recreate or drop the trigger — the 20260907155000 trigger keeps firing the replaced function", () => {
      expect(sql.toLowerCase()).not.toContain("create trigger");
      expect(sql.toLowerCase()).not.toContain("drop trigger");
    });
  });

  describe("token generation", () => {
    it("is the exact 20260909205000 generation in both the function and the backfill (24 random bytes, hex = 48 chars)", () => {
      expect(sql.match(/pg_catalog\.encode\(extensions\.gen_random_bytes\(24\),'hex'\)/g)).toHaveLength(2);
      expect(sql).not.toContain("gen_random_bytes(32)");
      expect(sql).not.toContain("md5(");
      expect(sql).not.toContain("random()");
    });
  });

  describe("backfill", () => {
    it("targets only moms_website appointments with no token yet", () => {
      expect(backfillSection).toContain("where source = 'moms_website'");
      expect(backfillSection).toContain(
        "and nullif(metadata ->> 'management_token','') is null;",
      );
      // The backfill must not mint for any other source.
      expect(backfillSection.match(/source = '/g)).toHaveLength(1);
      expect(backfillSection).not.toContain("public_booking");
    });

    it("mirrors the 20260907155000 backfill scope: live statuses only, future starts only", () => {
      expect(backfillSection).toContain("and status in ('requested','confirmed')");
      expect(backfillSection).toContain("and starts_at > now()");
      expect(backfillSection).not.toContain("'completed'");
      expect(backfillSection).not.toContain("'cancelled'");
      expect(backfillSection).not.toContain("'no_show'");
      expect(backfillSection).not.toContain("'in_progress'");
    });

    it("merges the token into metadata with the same || shape the trigger writes", () => {
      expect(backfillSection).toContain(
        "set metadata = coalesce(metadata,'{}'::jsonb)",
      );
      expect(backfillSection).toContain("'management_token',");
    });
  });

  it("runs in a single transaction like its neighbors", () => {
    expect(sql.trimStart().toLowerCase()).toContain("begin;");
    expect(sql.trimEnd().toLowerCase()).toMatch(/commit;$/);
  });
});
