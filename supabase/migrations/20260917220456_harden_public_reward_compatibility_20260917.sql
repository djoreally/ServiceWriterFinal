-- Preserve the current public-booking client contract while enforcing reservation,
-- appointment, workspace, customer, expiry, and payment-context checks.

create or replace function public.apply_booking_reward(
  p_reward_instance_id uuid,
  p_appointment_id uuid,
  p_payment_record_id uuid default null,
  p_subtotal_cents integer default 0,
  p_tax_cents integer default 0,
  p_idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_instance public.crm_loyalty_reward_instances%rowtype;
  v_reward public.crm_loyalty_rewards%rowtype;
  v_appointment public.appointments%rowtype;
  v_discount integer:=0;
  v_value numeric;
begin
  select * into v_instance from public.crm_loyalty_reward_instances where id=p_reward_instance_id for update;
  select * into v_appointment from public.appointments where id=p_appointment_id;
  if not found or v_instance.status<>'reserved'
     or v_instance.reserved_appointment_id is distinct from p_appointment_id
     or (v_instance.reserved_until is not null and v_instance.reserved_until<=now())
     or v_appointment.workspace_id is distinct from v_instance.workspace_id
     or v_appointment.customer_id is distinct from v_instance.customer_id then
    return jsonb_build_object('status','skipped','reason','invalid_or_expired_reservation');
  end if;
  if p_payment_record_id is not null and not exists(
    select 1 from public.payments p
     where p.id=p_payment_record_id
       and p.workspace_id=v_instance.workspace_id
       and (p.customer_id is null or p.customer_id=v_instance.customer_id)
  ) then
    return jsonb_build_object('status','skipped','reason','payment_context_mismatch');
  end if;
  select * into v_reward from public.crm_loyalty_rewards
   where id=v_instance.reward_id and workspace_id=v_instance.workspace_id and status='active';
  if not found then return jsonb_build_object('status','skipped','reason','reward_definition_inactive'); end if;
  v_value:=coalesce((v_reward.config->>'value')::numeric,(v_reward.config->>'amount')::numeric,0);
  if v_reward.reward_type='discount_percent' then
    v_discount:=least(greatest(round(p_subtotal_cents*greatest(0,least(v_value,100))/100.0),0),greatest(p_subtotal_cents,0));
  elsif v_reward.reward_type in ('credit','discount_fixed') then
    v_discount:=least(greatest(round(v_value*100),0),greatest(p_subtotal_cents,0));
  elsif v_reward.reward_type='free_service' then
    if coalesce((v_reward.config->>'max_value_cents')::integer,0)<=0 then
      return jsonb_build_object('status','manual_only','reason','free_service_requires_configured_max_value','reward_instance_id',v_instance.id);
    end if;
    v_discount:=least((v_reward.config->>'max_value_cents')::integer,greatest(p_subtotal_cents,0));
  end if;
  update public.crm_loyalty_reward_instances
     set applied_discount_cents=v_discount,
         metadata=metadata||jsonb_build_object('apply_idempotency_key',p_idempotency_key,'subtotal_cents',p_subtotal_cents,'tax_cents',p_tax_cents),
         updated_at=now()
   where id=v_instance.id;
  update public.appointments
     set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('loyalty_reward_instance_id',v_instance.id,'loyalty_discount_cents',v_discount,'priority_booking',v_reward.reward_type='priority_booking'),
         updated_at=now()
   where id=p_appointment_id and workspace_id=v_instance.workspace_id and customer_id=v_instance.customer_id;
  if p_payment_record_id is not null then
    update public.payments
       set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('loyalty_reward_instance_id',v_instance.id,'loyalty_discount_cents',v_discount),
           updated_at=now()
     where id=p_payment_record_id and workspace_id=v_instance.workspace_id;
  end if;
  return jsonb_build_object('status','applied','reward_instance_id',v_instance.id,'appointment_id',p_appointment_id,'discount_cents',v_discount);
end $$;

create or replace function public.redeem_booking_reward(
  p_reward_instance_id uuid,
  p_appointment_id uuid,
  p_payment_record_id uuid default null,
  p_idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_instance public.crm_loyalty_reward_instances%rowtype;
  v_account public.crm_loyalty_accounts%rowtype;
  v_appointment public.appointments%rowtype;
begin
  select * into v_instance from public.crm_loyalty_reward_instances where id=p_reward_instance_id for update;
  if not found then return jsonb_build_object('status','skipped','reason','reward_not_found'); end if;
  if v_instance.status='redeemed' and v_instance.reserved_appointment_id=p_appointment_id then
    return jsonb_build_object('status','redeemed','idempotent',true,'reward_instance_id',v_instance.id,'discount_cents',v_instance.applied_discount_cents);
  end if;
  select * into v_appointment from public.appointments where id=p_appointment_id;
  if not found or v_instance.status<>'reserved'
     or v_instance.reserved_appointment_id is distinct from p_appointment_id
     or (v_instance.reserved_until is not null and v_instance.reserved_until<=now())
     or v_appointment.workspace_id is distinct from v_instance.workspace_id
     or v_appointment.customer_id is distinct from v_instance.customer_id then
    return jsonb_build_object('status','skipped','reason','invalid_or_expired_reservation');
  end if;
  if p_payment_record_id is not null and not exists(
    select 1 from public.payments p
     where p.id=p_payment_record_id
       and p.workspace_id=v_instance.workspace_id
       and (p.customer_id is null or p.customer_id=v_instance.customer_id)
  ) then
    return jsonb_build_object('status','skipped','reason','payment_context_mismatch');
  end if;
  select * into v_account from public.crm_loyalty_accounts
   where id=v_instance.loyalty_account_id and workspace_id=v_instance.workspace_id for update;
  if v_account.current_points<v_instance.points_cost then
    return jsonb_build_object('status','skipped','reason','insufficient_points');
  end if;
  update public.crm_loyalty_accounts
     set current_points=current_points-v_instance.points_cost,updated_at=now()
   where id=v_account.id;
  insert into public.crm_loyalty_ledger(workspace_id,loyalty_account_id,customer_id,points_delta,reason,source_type,source_id)
  values(v_instance.workspace_id,v_instance.loyalty_account_id,v_instance.customer_id,-v_instance.points_cost,'Reward redeemed','reward_redemption',v_instance.id::text)
  on conflict do nothing;
  update public.crm_loyalty_reward_instances
     set status='redeemed',reserved_until=null,redeemed_at=now(),
         metadata=metadata||jsonb_build_object('redeem_idempotency_key',p_idempotency_key,'payment_record_id',p_payment_record_id),
         updated_at=now()
   where id=v_instance.id returning * into v_instance;
  return jsonb_build_object('status','redeemed','reward_instance_id',v_instance.id,'appointment_id',p_appointment_id,'discount_cents',coalesce(v_instance.applied_discount_cents,0));
end $$;

create or replace function public.cancel_booking_reward(
  p_reward_instance_id uuid,
  p_appointment_id uuid default null,
  p_reason text default 'booking_cancelled_or_failed'
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_instance public.crm_loyalty_reward_instances%rowtype;
  v_appointment public.appointments%rowtype;
begin
  select * into v_instance from public.crm_loyalty_reward_instances where id=p_reward_instance_id for update;
  if not found then return jsonb_build_object('status','skipped','reason','reward_not_found'); end if;
  if v_instance.status not in ('reserved','redeemed') then return jsonb_build_object('status','skipped','reason','reward_not_cancellable'); end if;
  if p_appointment_id is not null and v_instance.reserved_appointment_id is distinct from p_appointment_id then
    return jsonb_build_object('status','skipped','reason','appointment_mismatch');
  end if;
  if v_instance.reserved_appointment_id is null then return jsonb_build_object('status','skipped','reason','missing_reservation_context'); end if;
  select * into v_appointment from public.appointments where id=v_instance.reserved_appointment_id;
  if not found or v_appointment.workspace_id is distinct from v_instance.workspace_id or v_appointment.customer_id is distinct from v_instance.customer_id then
    return jsonb_build_object('status','skipped','reason','invalid_reward_context');
  end if;
  if v_instance.status='redeemed' then
    if not exists(select 1 from public.crm_loyalty_ledger where workspace_id=v_instance.workspace_id and source_type='reward_reversal' and source_id=v_instance.id::text) then
      update public.crm_loyalty_accounts
         set current_points=current_points+v_instance.points_cost,updated_at=now()
       where id=v_instance.loyalty_account_id and workspace_id=v_instance.workspace_id;
      insert into public.crm_loyalty_ledger(workspace_id,loyalty_account_id,customer_id,points_delta,reason,source_type,source_id)
      values(v_instance.workspace_id,v_instance.loyalty_account_id,v_instance.customer_id,v_instance.points_cost,coalesce(p_reason,'Reward redemption reversed'),'reward_reversal',v_instance.id::text);
    end if;
  end if;
  update public.crm_loyalty_reward_instances
     set status='cancelled',cancelled_at=now(),reserved_until=null,
         metadata=metadata||jsonb_build_object('cancel_reason',p_reason),updated_at=now()
   where id=v_instance.id;
  perform public.ensure_loyalty_reward_instances_v1(v_instance.loyalty_account_id);
  return jsonb_build_object('status','cancelled','reward_instance_id',v_instance.id);
end $$;

revoke all on function public.apply_booking_reward(uuid,uuid,uuid,integer,integer,text) from public,anon,authenticated;
grant execute on function public.apply_booking_reward(uuid,uuid,uuid,integer,integer,text) to anon,authenticated;
revoke all on function public.redeem_booking_reward(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.redeem_booking_reward(uuid,uuid,uuid,text) to anon,authenticated;
revoke all on function public.cancel_booking_reward(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.cancel_booking_reward(uuid,uuid,text) to anon,authenticated;

-- v2 wrappers are retained for a later client cutover, but are not exposed yet.
revoke all on function public.apply_booking_reward_v2(uuid,uuid,uuid,text,uuid,integer,integer,text) from public,anon,authenticated;
revoke all on function public.redeem_booking_reward_v2(uuid,uuid,uuid,text,uuid,text) from public,anon,authenticated;
revoke all on function public.cancel_booking_reward_v2(uuid,uuid,text,uuid,text) from public,anon,authenticated;
