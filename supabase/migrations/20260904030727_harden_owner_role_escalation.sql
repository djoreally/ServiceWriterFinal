create or replace function private.is_workspace_owner(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = 'pg_catalog', 'public', 'pg_temp'
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.is_active = true
      and wm.role = 'owner'::public.member_role
  );
$$;

revoke all on function private.is_workspace_owner(uuid) from public, anon, authenticated;
grant execute on function private.is_workspace_owner(uuid) to postgres, service_role;

create or replace function public.is_workspace_owner(target_workspace_id uuid)
returns boolean
language sql
stable
set search_path = 'public', 'pg_temp'
as $$
  select private.is_workspace_owner(target_workspace_id);
$$;

revoke all on function public.is_workspace_owner(uuid) from public, anon;
grant execute on function public.is_workspace_owner(uuid) to authenticated, postgres, service_role;

drop policy if exists members_admin_insert on public.workspace_members;
create policy members_admin_insert on public.workspace_members
for insert to authenticated
with check (
  public.is_workspace_admin(workspace_id)
  and (role <> 'owner'::public.member_role or public.is_workspace_owner(workspace_id))
);

drop policy if exists members_admin_update on public.workspace_members;
create policy members_admin_update on public.workspace_members
for update to authenticated
using (
  public.is_workspace_admin(workspace_id)
  and (role <> 'owner'::public.member_role or public.is_workspace_owner(workspace_id))
)
with check (
  public.is_workspace_admin(workspace_id)
  and (role <> 'owner'::public.member_role or public.is_workspace_owner(workspace_id))
);

drop policy if exists members_admin_delete on public.workspace_members;
create policy members_admin_delete on public.workspace_members
for delete to authenticated
using (
  public.is_workspace_admin(workspace_id)
  and (role <> 'owner'::public.member_role or public.is_workspace_owner(workspace_id))
);

drop policy if exists invitations_admin_insert on public.invitations;
create policy invitations_admin_insert on public.invitations
for insert to authenticated
with check (
  public.is_workspace_admin(workspace_id)
  and created_by = (select auth.uid())
  and (invited_role <> 'owner'::public.member_role or public.is_workspace_owner(workspace_id))
);

drop policy if exists invitations_admin_update on public.invitations;
create policy invitations_admin_update on public.invitations
for update to authenticated
using (
  public.is_workspace_admin(workspace_id)
  and (invited_role <> 'owner'::public.member_role or public.is_workspace_owner(workspace_id))
)
with check (
  public.is_workspace_admin(workspace_id)
  and (invited_role <> 'owner'::public.member_role or public.is_workspace_owner(workspace_id))
);

drop policy if exists invitations_admin_delete on public.invitations;
create policy invitations_admin_delete on public.invitations
for delete to authenticated
using (
  public.is_workspace_admin(workspace_id)
  and (invited_role <> 'owner'::public.member_role or public.is_workspace_owner(workspace_id))
);
