-- Revoke invitations and append the audit event in one transaction.
-- Service-role-only: request authorization remains in the API route.

create or replace function public.revoke_invitation_v1(
  p_invitation_id uuid,
  p_workspace_id uuid,
  p_actor_user_id uuid
)
returns public.invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.invitations%rowtype;
begin
  select * into v_invitation
  from public.invitations
  where id = p_invitation_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'Invitation not found';
  end if;

  if v_invitation.accepted_at is not null or v_invitation.revoked_at is not null then
    return v_invitation;
  end if;

  update public.invitations
  set revoked_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = p_invitation_id
    and workspace_id = p_workspace_id
    and accepted_at is null
    and revoked_at is null
  returning * into v_invitation;

  if not found then
    raise exception 'Invitation state changed';
  end if;

  insert into public.invitation_events (
    invitation_id,
    workspace_id,
    event_type,
    actor_user_id,
    metadata
  ) values (
    v_invitation.id,
    v_invitation.workspace_id,
    'revoked',
    p_actor_user_id,
    '{}'::jsonb
  );

  return v_invitation;
end;
$$;

revoke all on function public.revoke_invitation_v1(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.revoke_invitation_v1(uuid, uuid, uuid) to service_role;
