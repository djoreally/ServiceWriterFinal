-- Phase 4: hardened identity and invitation RLS
-- Helper functions are SECURITY DEFINER and have a fixed search_path to prevent search-path injection.

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.is_active = true
  );
$$;

create or replace function public.is_workspace_staff(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.is_active = true
      and wm.role <> 'customer'::public.member_role
  );
$$;

create or replace function public.is_workspace_admin(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.is_active = true
      and wm.role in ('owner'::public.member_role, 'admin'::public.member_role)
  );
$$;

create or replace function public.is_customer_for_workspace(target_workspace_id uuid, target_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.customer_users cu
    where cu.workspace_id = target_workspace_id
      and cu.customer_id = target_customer_id
      and cu.user_id = auth.uid()
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.is_workspace_staff(uuid) from public;
revoke all on function public.is_workspace_admin(uuid) from public;
revoke all on function public.is_customer_for_workspace(uuid, uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.is_workspace_staff(uuid) to authenticated;
grant execute on function public.is_workspace_admin(uuid) to authenticated;
grant execute on function public.is_customer_for_workspace(uuid, uuid) to authenticated;

-- Membership management: customers cannot administer memberships; owner/admin are the only writers.
drop policy if exists customer_users_admin_write on public.customer_users;
create policy customer_users_admin_write on public.customer_users
for all to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

drop policy if exists customer_users_self_select on public.customer_users;
create policy customer_users_self_select on public.customer_users
for select to authenticated
using (user_id = auth.uid());

drop policy if exists customer_users_staff_select on public.customer_users;
create policy customer_users_staff_select on public.customer_users
for select to authenticated
using (public.is_workspace_staff(workspace_id));

-- Invitations are operationally managed by owner/admin only. Tokens are never exposed to clients by policy design.
drop policy if exists invitations_admin_select on public.invitations;
create policy invitations_admin_select on public.invitations
for select to authenticated
using (public.is_workspace_admin(workspace_id));

drop policy if exists invitations_admin_insert on public.invitations;
create policy invitations_admin_insert on public.invitations
for insert to authenticated
with check (
  public.is_workspace_admin(workspace_id)
  and created_by = auth.uid()
);

drop policy if exists invitations_admin_update on public.invitations;
create policy invitations_admin_update on public.invitations
for update to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

drop policy if exists invitations_admin_delete on public.invitations;
create policy invitations_admin_delete on public.invitations
for delete to authenticated
using (public.is_workspace_admin(workspace_id));

-- Audit events are readable by staff and insertable only by owner/admin. No UPDATE or DELETE policies exist.
drop policy if exists invitation_events_staff_select on public.invitation_events;
create policy invitation_events_staff_select on public.invitation_events
for select to authenticated
using (public.is_workspace_staff(workspace_id));

drop policy if exists invitation_events_admin_insert on public.invitation_events;
create policy invitation_events_admin_insert on public.invitation_events
for insert to authenticated
with check (
  public.is_workspace_admin(workspace_id)
  and actor_user_id = auth.uid()
);

-- Lock down helper-function mutability and prevent anonymous execution.
revoke all on function public.set_identity_updated_at() from public;
revoke all on function public.set_identity_updated_at() from anon, authenticated;
