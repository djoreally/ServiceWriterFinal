begin;

-- Bounce and complaint suppressions can originate from either configured
-- provider, so keep their source vendor-neutral.
create or replace function public.messaging_record_delivery_suppression(
  target_workspace_id uuid,
  target_email citext,
  target_reason text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  suppression_id uuid;
begin
  if target_workspace_id is null or target_email is null then return null; end if;
  select id into suppression_id from public.messaging_suppressions
    where workspace_id = target_workspace_id and email = target_email and active
    limit 1;
  if suppression_id is not null then return suppression_id; end if;
  insert into public.messaging_suppressions(workspace_id, channel, purpose, email, reason, source)
  values (target_workspace_id, 'email', null, target_email, case when target_reason = 'complained' then 'complaint' else 'hard_bounce' end, 'provider')
  returning id into suppression_id;
  return suppression_id;
end;
$$;

create or replace function public.messaging_record_marketing_opt_out(
  target_workspace_id uuid,
  target_email citext,
  target_source text default 'provider'
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  suppression_id uuid;
begin
  if target_workspace_id is null or target_email is null then return null; end if;

  update public.messaging_consents
  set status = 'revoked',
      revoked_at = coalesce(revoked_at, timezone('utc', now())),
      evidence = coalesce(evidence, '{}'::jsonb) || jsonb_build_object('revoked_by', target_source),
      updated_at = timezone('utc', now())
  where workspace_id = target_workspace_id
    and channel = 'email'
    and purpose = 'marketing'
    and contact_email = target_email
    and status <> 'revoked';

  select id into suppression_id from public.messaging_suppressions
  where workspace_id = target_workspace_id
    and channel = 'email'
    and purpose = 'marketing'
    and email = target_email
    and active
  limit 1;
  if suppression_id is not null then return suppression_id; end if;

  insert into public.messaging_suppressions(workspace_id, channel, purpose, email, reason, source)
  values (target_workspace_id, 'email', 'marketing', target_email, 'unsubscribe', target_source)
  returning id into suppression_id;
  return suppression_id;
end;
$$;

revoke execute on function public.messaging_record_delivery_suppression(uuid, citext, text) from public, anon, authenticated;
revoke execute on function public.messaging_record_marketing_opt_out(uuid, citext, text) from public, anon, authenticated;
grant execute on function public.messaging_record_delivery_suppression(uuid, citext, text) to service_role;
grant execute on function public.messaging_record_marketing_opt_out(uuid, citext, text) to service_role;

commit;
