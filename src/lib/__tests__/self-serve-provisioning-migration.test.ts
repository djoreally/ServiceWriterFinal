import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Source-contract tests for the self-serve owner workspace provisioning
// migration (20261031200000). These pin the SQL shape the activation
// depends on: one idempotent definer RPC that writes the workspace,
// owner membership, and Basic Free billing row in the proven in-repo
// shapes, plus the append-only terms acceptance record. Behavior
// against a live database is proven by the post-merge production apply
// and a real throwaway signup.
describe("self-serve owner workspace provisioning migration", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20261031200000_self_serve_owner_workspace_provisioning.sql"),
    "utf8",
  );
  const lower = sql.toLowerCase();

  it("documents the manual apply order", () => {
    expect(sql).toContain("Apply AFTER 20261031190000_link_booking_client_quote_lock.sql");
    expect(sql).toContain("File-only until applied manually");
  });

  it("does not touch handle_new_user (customer/team signups share that trigger)", () => {
    expect(lower).not.toContain("create or replace function public.handle_new_user");
    expect(lower).not.toContain("drop trigger");
  });

  describe("terms_acceptances", () => {
    it("is an append-only per-user record with a per-version uniqueness guard", () => {
      expect(sql).toContain("create table if not exists public.terms_acceptances");
      expect(sql).toContain("unique (user_id, document, version)");
      expect(sql).toContain("check (document in ('terms', 'privacy'))");
      expect(sql).toContain("accepted_at timestamptz not null default now()");
    });

    it("follows the repo identity-record RLS idiom: enabled, self-select only, no client writes", () => {
      expect(sql).toContain("alter table public.terms_acceptances enable row level security");
      expect(sql).toContain("create policy terms_acceptances_self_select");
      expect(sql).toContain("using (user_id = auth.uid())");
      expect(lower).not.toMatch(/create policy[^;]*for (insert|update|delete)/);
    });
  });

  describe("provision_owner_workspace_v1", () => {
    it("is a security definer function granted to authenticated only", () => {
      expect(sql).toContain("create or replace function public.provision_owner_workspace_v1(");
      expect(sql).toContain("security definer");
      expect(sql).toContain(
        "revoke all on function public.provision_owner_workspace_v1(text, text, text, text) from public;",
      );
      expect(sql).toContain(
        "revoke execute on function public.provision_owner_workspace_v1(text, text, text, text) from anon;",
      );
      expect(sql).toContain(
        "grant execute on function public.provision_owner_workspace_v1(text, text, text, text) to authenticated;",
      );
    });

    it("requires an authenticated caller and a business name", () => {
      expect(sql).toContain("v_user_id uuid := auth.uid();");
      expect(sql).toContain("raise exception 'Authentication required'");
      expect(sql).toContain("raise exception 'Business name is required'");
    });

    it("serializes concurrent provisioning per account with an advisory lock", () => {
      expect(sql).toContain("pg_advisory_xact_lock(hashtextextended('provision-owner-workspace:' || v_user_id::text, 0))");
    });

    it("is idempotent: an existing self-created owner workspace is returned, not recreated", () => {
      expect(sql).toContain("and wm.role = 'owner'::public.member_role");
      expect(sql).toContain("and w.created_by = v_user_id");
      expect(sql).toContain("'created', v_created");
      // The workspace insert happens exactly once in the function body.
      expect(sql.match(/insert into public\.workspaces \(/g)).toHaveLength(1);
      expect(sql.match(/insert into public\.workspace_members \(/g)).toHaveLength(1);
      expect(sql.match(/insert into public\.workspace_billing \(/g)).toHaveLength(1);
    });

    it("writes the workspace in the seed migration's shape", () => {
      expect(sql).toContain("'shop'::public.workspace_kind");
      expect(sql).toContain("'user'::public.app_role");
      expect(sql).toContain("'USD'");
    });

    it("upserts the owner membership exactly like invitation acceptance", () => {
      expect(sql).toContain("on conflict (workspace_id, user_id)");
      expect(sql).toContain("do update set role = excluded.role, is_active = true");
    });

    it("creates the Basic Free billing row with ensureWorkspaceBilling's defaults", () => {
      expect(sql).toContain("values (v_workspace_id, 'basic', 'monthly', false, 0, 'active')");
      expect(sql).toContain("on conflict (workspace_id) do nothing");
    });

    it("generates a unique slug with a suffix loop instead of failing on a name collision", () => {
      expect(sql).toContain("regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g')");
      expect(sql).toContain("exception when unique_violation then");
    });

    it("records terms and privacy acceptance in the same transaction, conflict-guarded", () => {
      expect(sql).toContain("insert into public.terms_acceptances (user_id, document, version)");
      expect(sql).toContain("values (v_user_id, 'terms', trim(p_terms_version))");
      expect(sql).toContain("values (v_user_id, 'privacy', trim(p_privacy_version))");
      expect(sql).toContain("on conflict (user_id, document, version) do nothing");
    });
  });
});
