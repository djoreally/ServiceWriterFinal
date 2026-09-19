-- Harden public booking rewards without breaking the active v1 booking client.
-- v2 requires BOTH email and phone to match the same customer. v1 remains temporarily
-- available until the v2 frontend is deployed; a follow-up migration revokes v1 anon EXECUTE.

create or replace function public.lookup_booking_rewards_v2(
  p_provider_id uuid,
  p_email text,
  p_phone text,
  p_customer_account_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace uuid;
  v_customer uuid;
  v_matches integer;
  v_account public.crm_loyalty_accounts%rowtype;
  v_available jsonb;
  v_catalog jsonb;
  v_lifetime integer;
  v_phone_digits text;
begin
  v_workspace := public.resolve_rewards_workspace_v1(p_provider_id);
  v_phone_digits := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g');

  if v_workspace is null
     or length(trim(coalesce(p_email,''))) < 3
     or position('@' in p_email) < 2
     or length(v_phone_digits) < 10 then
    return jsonb_build_object('status','no_match','points_balance',0,'available_rewards','[]'::jsonb,'catalog','[]'::jsonb);
  end if;

  select count(*), min(id::text)::uuid
    into v_matches, v_customer
  from public.customers
  where workspace_id = v_workspace
    and lower(email::text) = lower(trim(p_email))
    and right(regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g'), 10) = right(v_phone_digits, 10);

  if v_matches = 0 then
    return jsonb_build_object('status','no_match','points_balance',0,'available_rewards','[]'::jsonb,'catalog','[]'::jsonb);
  end if;
  if v_matches > 1 then
    return jsonb_build_object('status','requires_review','candidate_count',v_matches,'points_balance',0,'available_rewards','[]'::jsonb,'catalog','[]'::jsonb);
  end if;

  select * into v_account
  from public.crm_loyalty_accounts
  where workspace_id=v_workspace and customer_id=v_customer;

  if not found then
    return jsonb_build_object(
      'status','matched','match_source','email_phone',
      'masked_email',regexp_replace(p_email,'(^.).*(@.*$)','\\1***\\2'),
      'masked_phone','***-***-' || right(v_phone_digits,4),
      'points_balance',0,'lifetime_points_earned',0,'visit_count',0,
      'available_rewards','[]'::jsonb,
      'catalog',coalesce((
        select jsonb_agg(jsonb_build_object(
          'reward_id',r.id,'name',r.name,'description',r.description,'reward_type',r.reward_type,
          'program_id',r.program_id,'program_name',p.name,'points_required',r.points_required,
          'points_remaining',r.points_required,'config',r.config
        ) order by r.points_required)
        from public.crm_loyalty_rewards r
        join public.crm_loyalty_programs p on p.id=r.program_id
        where r.workspace_id=v_workspace and r.status='active' and p.status='active'
      ),'[]'::jsonb)
    );
  end if;

  perform public.ensure_loyalty_reward_instances_v1(v_account.id);

  select coalesce(sum(greatest(points_delta,0)),0)::integer
    into v_lifetime
  from public.crm_loyalty_ledger
  where loyalty_account_id=v_account.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'instance_id',i.id,'reward_id',r.id,'name',r.name,'description',r.description,
    'reward_type',r.reward_type,'program_id',r.program_id,'program_name',p.name,
    'status',i.status,'expires_at',i.expires_at,'points_required',r.points_required,
    'points_remaining',0,'config',r.config
  ) order by r.points_required),'[]'::jsonb)
    into v_available
  from public.crm_loyalty_reward_instances i
  join public.crm_loyalty_rewards r on r.id=i.reward_id
  join public.crm_loyalty_programs p on p.id=r.program_id
  where i.loyalty_account_id=v_account.id
    and i.status='available'
    and (i.expires_at is null or i.expires_at>now());

  select coalesce(jsonb_agg(jsonb_build_object(
    'reward_id',r.id,'name',r.name,'description',r.description,'reward_type',r.reward_type,
    'program_id',r.program_id,'program_name',p.name,'points_required',r.points_required,
    'points_remaining',greatest(r.points_required-v_account.current_points,0),'config',r.config
  ) order by r.points_required),'[]'::jsonb)
    into v_catalog
  from public.crm_loyalty_rewards r
  join public.crm_loyalty_programs p on p.id=r.program_id
  where r.workspace_id=v_workspace and r.status='active' and p.status='active';

  return jsonb_build_object(
    'status','matched','match_source','email_phone',
    'masked_email',regexp_replace(p_email,'(^.).*(@.*$)','\\1***\\2'),
    'masked_phone','***-***-' || right(v_phone_digits,4),
    'points_balance',v_account.current_points,'lifetime_points_earned',v_lifetime,
    'available_rewards',v_available,'catalog',v_catalog
  );
end
$$;

create or replace function public.reserve_booking_reward_v2(
  p_reward_instance_id uuid,
  p_appointment_id uuid,
  p_provider_id uuid,
  p_customer_email text,
  p_customer_phone text,
  p_idempotency_key text default null,
  p_reservation_minutes integer default 30
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_instance public.crm_loyalty_reward_instances%rowtype;
  v_appointment public.appointments%rowtype;
  v_workspace uuid;
  v_email text;
  v_phone text;
  v_phone_digits text := regexp_replace(coalesce(p_customer_phone,''), '[^0-9]', '', 'g');
begin
  v_workspace := public.resolve_rewards_workspace_v1(p_provider_id);
  select * into v_instance from public.crm_loyalty_reward_instances where id=p_reward_instance_id for update;
  if not found then return jsonb_build_object('status','skipped','reason','invalid_reward_context'); end if;
  select * into v_appointment from public.appointments where id=p_appointment_id;
  if not found or v_workspace is null or v_instance.workspace_id<>v_workspace
     or v_appointment.workspace_id<>v_workspace or v_instance.customer_id<>v_appointment.customer_id then
    return jsonb_build_object('status','skipped','reason','invalid_reward_context');
  end if;

  select email::text, phone into v_email, v_phone
  from public.customers where id=v_instance.customer_id and workspace_id=v_workspace;

  if lower(coalesce(v_email,''))<>lower(trim(coalesce(p_customer_email,'')))
     or length(v_phone_digits)<10
     or right(regexp_replace(coalesce(v_phone,''), '[^0-9]', '', 'g'),10)<>right(v_phone_digits,10) then
    return jsonb_build_object('status','skipped','reason','customer_mismatch');
  end if;

  if v_instance.status='reserved' and v_instance.reserved_appointment_id=p_appointment_id then
    return jsonb_build_object('status','reserved','idempotent',true,'reward_instance_id',v_instance.id,
      'appointment_id',p_appointment_id,'reservation_expires_at',v_instance.reserved_until);
  end if;
  if v_instance.status<>'available' then
    return jsonb_build_object('status','skipped','reason','reward_not_available');
  end if;

  update public.crm_loyalty_reward_instances
  set status='reserved',reserved_appointment_id=p_appointment_id,
      reserved_until=now()+make_interval(mins=>greatest(5,least(coalesce(p_reservation_minutes,30),1440))),
      updated_at=now()
  where id=v_instance.id returning * into v_instance;

  return jsonb_build_object('status','reserved','reward_instance_id',v_instance.id,
    'appointment_id',p_appointment_id,'reservation_expires_at',v_instance.reserved_until);
end
$$;

revoke all on function public.lookup_booking_rewards_v2(uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function public.reserve_booking_reward_v2(uuid,uuid,uuid,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.lookup_booking_rewards_v2(uuid,text,text,uuid) to anon,authenticated,service_role;
grant execute on function public.reserve_booking_reward_v2(uuid,uuid,uuid,text,text,text,integer) to anon,authenticated,service_role;
