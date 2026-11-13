-- NEED-4 follow-up to Recon Steps 6+7 — platform-admin SELECT on audit_logs.
--
-- 20261110200000_step67_documents_crm.sql creates public.audit_logs with
-- INSERT policies only, on the design assumption that the platform admin
-- read path bypasses RLS with a service-role client. It does not:
-- requirePlatformAdmin (src/server/hono/routes/platform.ts) returns the
-- caller's RLS-bound client from requireAuth, so the platform admin audit
-- read (GET /v1/platform/admin/audit) would return zero rows.
--
-- This policy grants SELECT to an authenticated user whose
-- public.user_roles row carries the platform 'admin' role — the same
-- record requirePlatformAdmin checks. It grants nothing to anyone else:
-- non-admin authenticated users still have no SELECT policy on
-- audit_logs and read zero rows, and the INSERT posture is unchanged.
--
-- Sequenced after the step67 migration, which creates the table; guarded
-- the same way (drop-if-exists + create), so re-runs are no-ops.

drop policy if exists audit_logs_platform_admin_select on public.audit_logs;
create policy audit_logs_platform_admin_select on public.audit_logs
  for select to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role = 'admin'::public.app_role
    )
  );
