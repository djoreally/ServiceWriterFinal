-- Harden rewards RPC exposure. Public booking keeps only validated reward entrypoints.

create or replace function public.apply_booking_reward_v2(
  p_reward_instance_id uuid,
  p_appointment_id uuid,
  p_provider_id uuid,
  p_customer_email text,
  p_payment_record_id uuid default null,
  p_subtotal_cents integer default 0,
  p_tax_cents integer default 0,
  p_idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_instance public.crm_loyalty_reward_instances%rowtype;
  v_appointment public.appointments%rowtype;
  v_workspace uuid;
  v_email text;
begin
  v_workspace:=public.resolve_rewards_workspace_v1(p_provider_id);
  select * into v_instance from public.crm_loyalty_reward_instances where id=p_reward_instance_id;
  select * into v_appointment from public.appointments where id=p_appointment_id;
  if v_workspace is null or not found or v_instance.workspace_id<>v_workspace or v_appointment.workspace_id<>v_workspace or v_instance.customer_id<>v_appointment.customer_id then
    return jsonb_build_object('status','skipped','reason','invalid_reward_context');
  end if;
  select email::text into v_email from public.customers where id=v_instance.customer_id and workspace_id=v_workspace;
  if lower(coalesce(v_email,''))<>lower(trim(coalesce(p_customer_email,''))) then
    return jsonb_build_object('status','skipped','reason','customer_mismatch');
  end if;
  return public.apply_booking_reward(p_reward_instance_id,p_appointment_id,p_payment_record_id,p_subtotal_cents,p_tax_cents,p_idempotency_key);
end $$;

create or replace function public.redeem_booking_reward_v2(
  p_reward_instance_id uuid,
  p_appointment_id uuid,
  p_provider_id uuid,
  p_customer_email text,
  p_payment_record_id uuid default null,
  p_idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_instance public.crm_loyalty_reward_instances%rowtype;
  v_appointment public.appointments%rowtype;
  v_workspace uuid;
  v_email text;
begin
  v_workspace:=public.resolve_rewards_workspace_v1(p_provider_id);
  select * into v_instance from public.crm_loyalty_reward_instances where id=p_reward_instance_id;
  select * into v_appointment from public.appointments where id=p_appointment_id;
  if v_workspace is null or not found or v_instance.workspace_id<>v_workspace or v_appointment.workspace_id<>v_workspace or v_instance.customer_id<>v_appointment.customer_id then
    return jsonb_build_object('status','skipped','reason','invalid_reward_context');
  end if;
  select email::text into v_email from public.customers where id=v_instance.customer_id and workspace_id=v_workspace;
  if lower(coalesce(v_email,''))<>lower(trim(coalesce(p_customer_email,''))) then
    return jsonb_build_object('status','skipped','reason','customer_mismatch');
  end if;
  return public.redeem_booking_reward(p_reward_instance_id,p_appointment_id,p_payment_record_id,p_idempotency_key);
end $$;

create or replace function public.cancel_booking_reward_v2(
  p_reward_instance_id uuid,
  p_provider_id uuid,
  p_customer_email text,
  p_appointment_id uuid default null,
  p_reason text default 'booking_cancelled_or_failed'
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_instance public.crm_loyalty_reward_instances%rowtype;
  v_workspace uuid;
  v_email text;
begin
  v_workspace:=public.resolve_rewards_workspace_v1(p_provider_id);
  select * into v_instance from public.crm_loyalty_reward_instances where id=p_reward_instance_id;
  if v_workspace is null or not found or v_instance.workspace_id<>v_workspace then
    return jsonb_build_object('status','skipped','reason','invalid_reward_context');
  end if;
  if p_appointment_id is not null and v_instance.reserved_appointment_id is distinct from p_appointment_id then
    return jsonb_build_object('status','skipped','reason','appointment_mismatch');
  end if;
  select email::text into v_email from public.customers where id=v_instance.customer_id and workspace_id=v_workspace;
  if lower(coalesce(v_email,''))<>lower(trim(coalesce(p_customer_email,''))) then
    return jsonb_build_object('status','skipped','reason','customer_mismatch');
  end if;
  return public.cancel_booking_reward(p_reward_instance_id,p_appointment_id,p_reason);
end $$;

revoke all on function public.resolve_rewards_workspace_v1(uuid) from public,anon,authenticated;
revoke all on function public.ensure_loyalty_reward_instances_v1(uuid) from public,anon,authenticated;
revoke all on function public.award_loyalty_points_v1(uuid,uuid,numeric,integer,text,text,text) from public,anon,authenticated;
revoke all on function public.award_loyalty_for_service_record_v1(uuid) from public,anon,authenticated;
revoke all on function public.trg_award_loyalty_service_record_v1() from public,anon,authenticated;

revoke all on function public.lookup_booking_rewards(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.lookup_booking_rewards(uuid,text,uuid) to anon,authenticated;
revoke all on function public.reserve_booking_reward(uuid,uuid,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.reserve_booking_reward(uuid,uuid,uuid,text,text,integer) to anon,authenticated;

revoke all on function public.apply_booking_reward(uuid,uuid,uuid,integer,integer,text) from public,anon,authenticated;
revoke all on function public.redeem_booking_reward(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.cancel_booking_reward(uuid,uuid,text) from public,anon,authenticated;

revoke all on function public.apply_booking_reward_v2(uuid,uuid,uuid,text,uuid,integer,integer,text) from public,anon,authenticated;
grant execute on function public.apply_booking_reward_v2(uuid,uuid,uuid,text,uuid,integer,integer,text) to anon,authenticated;
revoke all on function public.redeem_booking_reward_v2(uuid,uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.redeem_booking_reward_v2(uuid,uuid,uuid,text,uuid,text) to anon,authenticated;
revoke all on function public.cancel_booking_reward_v2(uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.cancel_booking_reward_v2(uuid,uuid,text,uuid,text) to anon,authenticated;

revoke all on function public.adjust_loyalty_points(uuid,uuid,integer,text,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.adjust_loyalty_points(uuid,uuid,integer,text,uuid,text,uuid,text) to authenticated;
revoke all on function public.cancel_loyalty_reward_instance(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.cancel_loyalty_reward_instance(uuid,text,uuid,text) to authenticated;
revoke all on function public.override_loyalty_reward_expiration(uuid,timestamptz,text,uuid,text) from public,anon,authenticated;
grant execute on function public.override_loyalty_reward_expiration(uuid,timestamptz,text,uuid,text) to authenticated;
revoke all on function public.retry_appointment_rewards_application(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.retry_appointment_rewards_application(uuid,text,uuid,text) to authenticated;
revoke all on function public.get_rewards_production_health(uuid) from public,anon,authenticated;
grant execute on function public.get_rewards_production_health(uuid) to authenticated;
revoke all on function public.validate_rewards_launch_signoff(uuid) from public,anon,authenticated;
grant execute on function public.validate_rewards_launch_signoff(uuid) to authenticated;
revoke all on function public.save_loyalty_program_v1(uuid,text,text,text,numeric,integer,uuid) from public,anon,authenticated;
grant execute on function public.save_loyalty_program_v1(uuid,text,text,text,numeric,integer,uuid) to authenticated;
revoke all on function public.save_loyalty_reward_v1(uuid,uuid,text,text,integer,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.save_loyalty_reward_v1(uuid,uuid,text,text,integer,text,jsonb,uuid) to authenticated;
revoke all on function public.get_loyalty_management_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_loyalty_management_v1(uuid) to authenticated;
