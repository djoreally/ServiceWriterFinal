create or replace function public.accept_invitation_v1(p_invitation_id uuid, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'extensions', 'pg_temp'
as $$
declare
  v_inv public.invitations%rowtype;
  v_user_id uuid := auth.uid();
  v_user_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  select * into v_inv
  from public.invitations
  where id = p_invitation_id
    and token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update;

  if not found then
    raise exception 'Invitation not found or token is invalid' using errcode = 'P0001';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'Invitation has already been accepted' using errcode = 'P0001';
  end if;
  if v_inv.revoked_at is not null then
    raise exception 'Invitation has been revoked' using errcode = 'P0001';
  end if;
  if v_inv.expires_at <= v_now then
    raise exception 'Invitation has expired' using errcode = 'P0001';
  end if;
  if v_user_email = '' or v_user_email <> lower(v_inv.invited_email::text) then
    raise exception 'This invitation was issued to a different email address' using errcode = 'P0001';
  end if;

  if v_inv.invited_role = 'customer'::public.member_role then
    if v_inv.customer_id is null then
      raise exception 'Customer invitation is missing its customer record' using errcode = 'P0001';
    end if;
    insert into public.customer_users (workspace_id, customer_id, user_id)
    values (v_inv.workspace_id, v_inv.customer_id, v_user_id)
    on conflict (workspace_id, customer_id, user_id) do nothing;
  else
    insert into public.workspace_members (workspace_id, user_id, role, is_active)
    values (v_inv.workspace_id, v_user_id, v_inv.invited_role, true)
    on conflict (workspace_id, user_id)
    do update set role = excluded.role, is_active = true;
  end if;

  update public.invitations
  set accepted_at = v_now,
      accepted_by = v_user_id,
      updated_at = v_now
  where id = v_inv.id;

  insert into public.invitation_events (invitation_id, workspace_id, event_type, actor_user_id, metadata)
  values (v_inv.id, v_inv.workspace_id, 'accepted', v_user_id, jsonb_build_object('role', v_inv.invited_role));

  return jsonb_build_object(
    'id', v_inv.id,
    'workspace_id', v_inv.workspace_id,
    'customer_id', v_inv.customer_id,
    'invited_email', v_inv.invited_email,
    'invited_role', v_inv.invited_role,
    'expires_at', v_inv.expires_at,
    'accepted_at', v_now,
    'accepted_by', v_user_id,
    'revoked_at', v_inv.revoked_at,
    'created_by', v_inv.created_by,
    'created_at', v_inv.created_at,
    'updated_at', v_now
  );
end;
$$;

revoke all on function public.accept_invitation_v1(uuid, text) from public;
grant execute on function public.accept_invitation_v1(uuid, text) to authenticated;
