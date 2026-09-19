-- Authenticated customer linking must rely on an identity whose email was verified
-- by the auth provider. OAuth is optional; guest booking remains unchanged.

create or replace function public.link_customer_portal_account_v1()
returns table(customer_id uuid, workspace_id uuid)
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
  v_email_verified boolean := false;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if v_email='' then raise exception 'Authenticated email is required' using errcode='22023'; end if;

  select exists(
    select 1
    from auth.identities i
    where i.user_id=v_user_id
      and lower(coalesce(i.email,''))=v_email
      and (
        i.provider in ('google','apple','azure','facebook','github')
        or coalesce((i.identity_data->>'email_verified')::boolean,false)
      )
  ) into v_email_verified;

  if not v_email_verified then
    raise exception 'Verified authenticated identity required' using errcode='28000';
  end if;

  return query
  with candidates as (
    select c.id as candidate_customer_id,c.workspace_id as candidate_workspace_id
    from public.customers c
    where lower(coalesce(c.email::text,''))=v_email
    union
    select a.customer_id as candidate_customer_id,a.workspace_id as candidate_workspace_id
    from public.appointments a
    where a.customer_id is not null and lower(coalesce(a.metadata->>'guest_email',''))=v_email
  ), inserted as (
    insert into public.customer_users(customer_id,user_id,workspace_id,is_primary,created_at,updated_at)
    select distinct c.candidate_customer_id,v_user_id,c.candidate_workspace_id,false,now(),now()
    from candidates c
    on conflict on constraint customer_users_pkey do update
      set workspace_id=excluded.workspace_id,updated_at=now()
    returning customer_users.customer_id as linked_customer_id,customer_users.workspace_id as linked_workspace_id
  )
  select inserted.linked_customer_id,inserted.linked_workspace_id from inserted;
end
$$;

revoke all on function public.link_customer_portal_account_v1() from public,anon;
grant execute on function public.link_customer_portal_account_v1() to authenticated,service_role;
