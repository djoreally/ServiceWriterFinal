-- Self-serve owner workspace provisioning (2026-10-31, P0-1).
--
-- The gap: the homepage promises "Sign up in minutes and set up your own
-- workspace — no sales call required," and the /signup form + signUp code
-- exist, but nothing ever created the workspace. handle_new_user() writes
-- only a profile row, so every self-serve signup dead-ended with an
-- account that belongs to no workspace (login resolved zero memberships
-- and the workforce door reported a role mismatch). Accounts were
-- provisioned by hand (seed migration) or by invitation into an existing
-- workspace (accept_invitation_v1) — there was no owner-creation path.
--
-- The fix mirrors the two proven in-repo patterns instead of inventing a
-- third mechanism:
--   * workspace + owner membership rows are written in the exact shape of
--     the seed migration (20260822160000) and the membership upsert of
--     accept_invitation_v1 (20260903141000);
--   * the billing row carries the exact defaults ensureWorkspaceBilling
--     (src/server/billing/workspace-billing.ts) inserts lazily today —
--     plan_tier 'basic', billing_interval 'monthly', no payments add-on,
--     subscription_status 'active' — so a self-serve workspace starts on
--     Basic Free, no card, from minute one, and the lazy ensure remains
--     a no-op against it.
--
-- handle_new_user() is deliberately NOT changed: the same trigger fires
-- for customer/booking signups (signUpBookingUser, signUpCustomer) and
-- team-join signups, and those accounts must never mint a shop workspace.
-- Provisioning is an explicit, authenticated action taken by the owner
-- from the signup form or the no-workspace door at sign-in.
--
-- provision_owner_workspace_v1 is idempotent by construction: the
-- per-user advisory lock serializes retries, an account that already owns
-- a workspace it created gets that workspace back (created = false), and
-- every insert is conflict-guarded, so a double submit, a retried
-- request, or the sign-in door re-entry can never create a second
-- workspace, membership, billing row, or acceptance record.
--
-- Terms/Privacy acceptance (P0-5): public.terms_acceptances is an
-- append-only record keyed like the repo's other identity records
-- (compare user_roles in 20260822160000: RLS on, self-select only, no
-- client write policy — writes happen only inside this definer RPC).
-- The signup form passes the document versions it displayed; the
-- acceptance rows are written in the same transaction as provisioning,
-- including for accounts provisioned later through the sign-in door
-- (those accounts predate the checkbox and have no acceptance on file).
--
-- Apply AFTER 20261031190000_link_booking_client_quote_lock.sql.
-- File-only until applied manually, like the push migrations.

-- 1) Terms/Privacy acceptance records.
create table if not exists public.terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document text not null check (document in ('terms', 'privacy')),
  version text not null,
  accepted_at timestamptz not null default now(),
  unique (user_id, document, version)
);

alter table public.terms_acceptances enable row level security;

revoke all on table public.terms_acceptances from public;
revoke all on table public.terms_acceptances from anon;
grant select on table public.terms_acceptances to authenticated;

drop policy if exists terms_acceptances_self_select on public.terms_acceptances;
create policy terms_acceptances_self_select
on public.terms_acceptances
for select
to authenticated
using (user_id = auth.uid());

-- 2) Owner workspace provisioning.
create or replace function public.provision_owner_workspace_v1(
  p_business_name text,
  p_timezone text default null,
  p_terms_version text default null,
  p_privacy_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'extensions', 'pg_temp'
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := left(trim(coalesce(p_business_name, '')), 160);
  v_workspace_id uuid;
  v_slug text;
  v_base_slug text;
  v_attempt integer;
  v_created boolean := false;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;
  if v_name = '' then
    raise exception 'Business name is required' using errcode = 'P0001';
  end if;

  -- Serialize concurrent provisioning for this account (double submit,
  -- request retry, signup + sign-in door racing) so exactly one
  -- workspace is ever created per owner.
  perform pg_advisory_xact_lock(hashtextextended('provision-owner-workspace:' || v_user_id::text, 0));

  -- Record Terms/Privacy acceptance first: it lands even when the
  -- workspace already exists, and it is conflict-guarded per version.
  if nullif(trim(coalesce(p_terms_version, '')), '') is not null then
    insert into public.terms_acceptances (user_id, document, version)
    values (v_user_id, 'terms', trim(p_terms_version))
    on conflict (user_id, document, version) do nothing;
  end if;
  if nullif(trim(coalesce(p_privacy_version, '')), '') is not null then
    insert into public.terms_acceptances (user_id, document, version)
    values (v_user_id, 'privacy', trim(p_privacy_version))
    on conflict (user_id, document, version) do nothing;
  end if;

  -- Idempotency: an account that already owns a workspace it created
  -- gets that workspace back; nothing new is written.
  select w.id, w.slug into v_workspace_id, v_slug
  from public.workspace_members wm
  join public.workspaces w on w.id = wm.workspace_id
  where wm.user_id = v_user_id
    and wm.role = 'owner'::public.member_role
    and wm.is_active
    and w.created_by = v_user_id
  order by w.created_at asc
  limit 1;

  if v_workspace_id is null then
    v_base_slug := trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'));
    if v_base_slug = '' then
      v_base_slug := 'shop';
    end if;
    v_base_slug := left(v_base_slug, 60);

    -- The slug is the workspace's public identity, so it must be unique
    -- even when two owners pick the same business name at the same time:
    -- suffix -2, -3, ... and let a unique violation advance the suffix.
    for v_attempt in 1 .. 10 loop
      v_slug := case when v_attempt = 1 then v_base_slug else v_base_slug || '-' || v_attempt::text end;
      exit when not exists (select 1 from public.workspaces w where w.slug = v_slug);
    end loop;

    for v_attempt in 1 .. 10 loop
      begin
        insert into public.workspaces (name, slug, kind, app_role, timezone, currency_code, is_active, created_by)
        values (
          v_name,
          v_slug,
          'shop'::public.workspace_kind,
          'user'::public.app_role,
          coalesce(nullif(trim(coalesce(p_timezone, '')), ''), 'UTC'),
          'USD',
          true,
          v_user_id
        )
        returning id into v_workspace_id;
        exit;
      exception when unique_violation then
        v_slug := v_base_slug || '-' || (10 + v_attempt)::text;
        v_workspace_id := null;
      end;
    end loop;

    if v_workspace_id is null then
      raise exception 'Workspace could not be created' using errcode = 'P0001';
    end if;

    insert into public.workspace_members (workspace_id, user_id, role, is_active)
    values (v_workspace_id, v_user_id, 'owner'::public.member_role, true)
    on conflict (workspace_id, user_id)
    do update set role = excluded.role, is_active = true;

    insert into public.workspace_billing (workspace_id, plan_tier, billing_interval, payments_addon_active, additional_technician_quantity, subscription_status)
    values (v_workspace_id, 'basic', 'monthly', false, 0, 'active')
    on conflict (workspace_id) do nothing;

    v_created := true;
  end if;

  return jsonb_build_object(
    'workspace_id', v_workspace_id,
    'slug', v_slug,
    'created', v_created
  );
end;
$$;

revoke all on function public.provision_owner_workspace_v1(text, text, text, text) from public;
revoke execute on function public.provision_owner_workspace_v1(text, text, text, text) from anon;
grant execute on function public.provision_owner_workspace_v1(text, text, text, text) to authenticated;
