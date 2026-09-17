create or replace function public.apply_booking_reward(p_reward_instance_id uuid,p_appointment_id uuid,p_payment_record_id uuid default null,p_subtotal_cents integer default 0,p_tax_cents integer default 0,p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_instance public.crm_loyalty_reward_instances%rowtype; v_reward public.crm_loyalty_rewards%rowtype; v_discount integer := 0; v_value numeric;
begin
  select * into v_instance from public.crm_loyalty_reward_instances where id=p_reward_instance_id for update;
  if not found or v_instance.status not in ('reserved','available') or (v_instance.reserved_appointment_id is not null and v_instance.reserved_appointment_id<>p_appointment_id) then return jsonb_build_object('status','skipped','reason','reward_not_reserved_for_appointment'); end if;
  select * into v_reward from public.crm_loyalty_rewards where id=v_instance.reward_id and status='active';
  if not found then return jsonb_build_object('status','skipped','reason','reward_definition_inactive'); end if;
  v_value := coalesce((v_reward.config->>'value')::numeric,(v_reward.config->>'amount')::numeric,0);
  if v_reward.reward_type='discount_percent' then v_discount := least(greatest(round(p_subtotal_cents*greatest(0,least(v_value,100))/100.0),0),greatest(p_subtotal_cents,0));
  elsif v_reward.reward_type in ('credit','discount_fixed') then v_discount := least(greatest(round(v_value*100),0),greatest(p_subtotal_cents,0));
  elsif v_reward.reward_type='free_service' then
    if coalesce((v_reward.config->>'max_value_cents')::integer,0)<=0 then return jsonb_build_object('status','manual_only','reason','free_service_requires_configured_max_value','reward_instance_id',v_instance.id); end if;
    v_discount := least((v_reward.config->>'max_value_cents')::integer,greatest(p_subtotal_cents,0));
  elsif v_reward.reward_type='priority_booking' then v_discount := 0;
  end if;
  update public.crm_loyalty_reward_instances set reserved_appointment_id=p_appointment_id,applied_discount_cents=v_discount,metadata=metadata||jsonb_build_object('apply_idempotency_key',p_idempotency_key,'subtotal_cents',p_subtotal_cents,'tax_cents',p_tax_cents),updated_at=now() where id=v_instance.id;
  update public.appointments set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('loyalty_reward_instance_id',v_instance.id,'loyalty_discount_cents',v_discount,'priority_booking',v_reward.reward_type='priority_booking'),updated_at=now() where id=p_appointment_id and workspace_id=v_instance.workspace_id;
  if p_payment_record_id is not null and exists(select 1 from information_schema.tables where table_schema='public' and table_name='payments') then
    update public.payments set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('loyalty_reward_instance_id',v_instance.id,'loyalty_discount_cents',v_discount),updated_at=now() where id=p_payment_record_id and workspace_id=v_instance.workspace_id;
  end if;
  return jsonb_build_object('status','applied','reward_instance_id',v_instance.id,'appointment_id',p_appointment_id,'discount_cents',v_discount);
end $$;
grant execute on function public.apply_booking_reward(uuid,uuid,uuid,integer,integer,text) to anon, authenticated;

create or replace function public.redeem_booking_reward(p_reward_instance_id uuid,p_appointment_id uuid,p_payment_record_id uuid default null,p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_instance public.crm_loyalty_reward_instances%rowtype; v_account public.crm_loyalty_accounts%rowtype;
begin
  select * into v_instance from public.crm_loyalty_reward_instances where id=p_reward_instance_id for update;
  if not found then return jsonb_build_object('status','skipped','reason','reward_not_found'); end if;
  if v_instance.status='redeemed' and v_instance.reserved_appointment_id=p_appointment_id then return jsonb_build_object('status','redeemed','idempotent',true,'reward_instance_id',v_instance.id,'discount_cents',v_instance.applied_discount_cents); end if;
  if v_instance.status not in ('reserved','available') or (v_instance.reserved_appointment_id is not null and v_instance.reserved_appointment_id<>p_appointment_id) then return jsonb_build_object('status','skipped','reason','reward_not_redeemable'); end if;
  select * into v_account from public.crm_loyalty_accounts where id=v_instance.loyalty_account_id for update;
  if v_account.current_points<v_instance.points_cost then return jsonb_build_object('status','skipped','reason','insufficient_points'); end if;
  update public.crm_loyalty_accounts set current_points=current_points-v_instance.points_cost,updated_at=now() where id=v_account.id;
  insert into public.crm_loyalty_ledger(workspace_id,loyalty_account_id,customer_id,points_delta,reason,source_type,source_id) values(v_instance.workspace_id,v_instance.loyalty_account_id,v_instance.customer_id,-v_instance.points_cost,'Reward redeemed','reward_redemption',v_instance.id::text) on conflict do nothing;
  update public.crm_loyalty_reward_instances set status='redeemed',reserved_appointment_id=p_appointment_id,reserved_until=null,redeemed_at=now(),metadata=metadata||jsonb_build_object('redeem_idempotency_key',p_idempotency_key,'payment_record_id',p_payment_record_id),updated_at=now() where id=v_instance.id returning * into v_instance;
  return jsonb_build_object('status','redeemed','reward_instance_id',v_instance.id,'appointment_id',p_appointment_id,'discount_cents',coalesce(v_instance.applied_discount_cents,0));
end $$;
grant execute on function public.redeem_booking_reward(uuid,uuid,uuid,text) to anon, authenticated;

create or replace function public.cancel_booking_reward(p_reward_instance_id uuid,p_appointment_id uuid default null,p_reason text default 'booking_cancelled_or_failed')
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_instance public.crm_loyalty_reward_instances%rowtype;
begin
  select * into v_instance from public.crm_loyalty_reward_instances where id=p_reward_instance_id for update;
  if not found then return jsonb_build_object('status','skipped','reason','reward_not_found'); end if;
  if p_appointment_id is not null and v_instance.reserved_appointment_id is distinct from p_appointment_id then return jsonb_build_object('status','skipped','reason','appointment_mismatch'); end if;
  if v_instance.status='redeemed' then
    update public.crm_loyalty_accounts set current_points=current_points+v_instance.points_cost,updated_at=now() where id=v_instance.loyalty_account_id;
    insert into public.crm_loyalty_ledger(workspace_id,loyalty_account_id,customer_id,points_delta,reason,source_type,source_id) values(v_instance.workspace_id,v_instance.loyalty_account_id,v_instance.customer_id,v_instance.points_cost,coalesce(p_reason,'Reward redemption reversed'),'reward_reversal',v_instance.id::text) on conflict do nothing;
  end if;
  update public.crm_loyalty_reward_instances set status='cancelled',cancelled_at=now(),reserved_until=null,metadata=metadata||jsonb_build_object('cancel_reason',p_reason),updated_at=now() where id=v_instance.id;
  perform public.ensure_loyalty_reward_instances_v1(v_instance.loyalty_account_id);
  return jsonb_build_object('status','cancelled','reward_instance_id',v_instance.id);
end $$;
grant execute on function public.cancel_booking_reward(uuid,uuid,text) to anon, authenticated;

create or replace function public.adjust_loyalty_points(p_provider_id uuid,p_customer_id uuid,p_points_delta integer,p_reason_code text,p_actor_id uuid,p_reason_note text default null,p_appointment_id uuid default null,p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_workspace uuid; v_program uuid; v_account public.crm_loyalty_accounts%rowtype; v_source text;
begin
  v_workspace:=public.resolve_rewards_workspace_v1(p_provider_id);
  if v_workspace is null or not private.has_crm_capability(v_workspace,'crm.loyalty.adjust') then raise exception 'Not authorized'; end if;
  if not exists(select 1 from public.customers where id=p_customer_id and workspace_id=v_workspace) then return jsonb_build_object('status','skipped','reason','customer_not_found'); end if;
  select id into v_program from public.crm_loyalty_programs where workspace_id=v_workspace and status='active' and is_default limit 1;
  if v_program is null then return jsonb_build_object('status','skipped','reason','no_active_program'); end if;
  v_source:=coalesce(nullif(trim(p_idempotency_key),''),gen_random_uuid()::text);
  if exists(select 1 from public.crm_loyalty_ledger where workspace_id=v_workspace and source_type='manual_adjustment' and source_id=v_source) then return jsonb_build_object('status','idempotent','idempotent',true); end if;
  insert into public.crm_loyalty_accounts(workspace_id,customer_id,current_points,program_id) values(v_workspace,p_customer_id,0,v_program) on conflict(workspace_id,customer_id) do update set program_id=coalesce(public.crm_loyalty_accounts.program_id,excluded.program_id),updated_at=now() returning * into v_account;
  if v_account.current_points+p_points_delta<0 then return jsonb_build_object('status','skipped','reason','insufficient_points'); end if;
  update public.crm_loyalty_accounts set current_points=current_points+p_points_delta,updated_at=now() where id=v_account.id returning * into v_account;
  insert into public.crm_loyalty_ledger(workspace_id,loyalty_account_id,customer_id,points_delta,reason,source_type,source_id,created_by) values(v_workspace,v_account.id,p_customer_id,p_points_delta,coalesce(nullif(p_reason_note,''),p_reason_code),'manual_adjustment',v_source,p_actor_id);
  perform public.ensure_loyalty_reward_instances_v1(v_account.id);
  return jsonb_build_object('status','adjusted','new_points_balance',v_account.current_points,'event_id',v_source);
end $$;
grant execute on function public.adjust_loyalty_points(uuid,uuid,integer,text,uuid,text,uuid,text) to authenticated;

create or replace function public.cancel_loyalty_reward_instance(p_reward_instance_id uuid,p_reason_code text,p_actor_id uuid,p_reason_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.crm_loyalty_reward_instances%rowtype;
begin
 select * into v from public.crm_loyalty_reward_instances where id=p_reward_instance_id;
 if not found or not private.has_crm_capability(v.workspace_id,'crm.loyalty.adjust') then raise exception 'Not authorized'; end if;
 return public.cancel_booking_reward(p_reward_instance_id,v.reserved_appointment_id,coalesce(nullif(p_reason_note,''),p_reason_code));
end $$;
grant execute on function public.cancel_loyalty_reward_instance(uuid,text,uuid,text) to authenticated;

create or replace function public.override_loyalty_reward_expiration(p_reward_instance_id uuid,p_expires_at timestamptz,p_reason_code text,p_actor_id uuid,p_reason_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.crm_loyalty_reward_instances%rowtype;
begin
 select * into v from public.crm_loyalty_reward_instances where id=p_reward_instance_id for update;
 if not found or not private.has_crm_capability(v.workspace_id,'crm.loyalty.adjust') then raise exception 'Not authorized'; end if;
 update public.crm_loyalty_reward_instances set expires_at=p_expires_at,metadata=metadata||jsonb_build_object('expiration_override_reason',coalesce(nullif(p_reason_note,''),p_reason_code),'expiration_override_actor',p_actor_id),updated_at=now() where id=v.id returning * into v;
 return jsonb_build_object('status','updated','reward_instance_id',v.id,'expires_at',v.expires_at);
end $$;
grant execute on function public.override_loyalty_reward_expiration(uuid,timestamptz,text,uuid,text) to authenticated;

create or replace function public.retry_appointment_rewards_application(p_appointment_id uuid,p_reason_code text,p_actor_id uuid,p_reason_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_workspace uuid; v_sr uuid;
begin
 select workspace_id into v_workspace from public.appointments where id=p_appointment_id;
 if v_workspace is null or not private.has_crm_capability(v_workspace,'crm.loyalty.adjust') then raise exception 'Not authorized'; end if;
 select id into v_sr from public.service_records where appointment_id=p_appointment_id and status='completed' order by completed_at desc nulls last,created_at desc limit 1;
 if v_sr is null then return jsonb_build_object('status','skipped','reason','no_completed_service_record'); end if;
 return public.award_loyalty_for_service_record_v1(v_sr);
end $$;
grant execute on function public.retry_appointment_rewards_application(uuid,text,uuid,text) to authenticated;

create or replace function public.get_rewards_production_health(p_provider_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_workspace uuid;
begin
 v_workspace:=public.resolve_rewards_workspace_v1(p_provider_id);
 if v_workspace is null then return jsonb_build_object('status','red','reason','workspace_not_found'); end if;
 return jsonb_build_object('status',case when exists(select 1 from public.crm_loyalty_programs where workspace_id=v_workspace and status='active' and is_default) then 'green' else 'needs_configuration' end,'workspace_id',v_workspace,'active_programs',(select count(*) from public.crm_loyalty_programs where workspace_id=v_workspace and status='active'),'active_rewards',(select count(*) from public.crm_loyalty_rewards where workspace_id=v_workspace and status='active'),'enrolled_accounts',(select count(*) from public.crm_loyalty_accounts where workspace_id=v_workspace),'ledger_entries',(select count(*) from public.crm_loyalty_ledger where workspace_id=v_workspace),'available_rewards',(select count(*) from public.crm_loyalty_reward_instances where workspace_id=v_workspace and status='available'),'reserved_rewards',(select count(*) from public.crm_loyalty_reward_instances where workspace_id=v_workspace and status='reserved'),'redeemed_rewards',(select count(*) from public.crm_loyalty_reward_instances where workspace_id=v_workspace and status='redeemed'));
end $$;
grant execute on function public.get_rewards_production_health(uuid) to authenticated;

create or replace function public.validate_rewards_launch_signoff(p_provider_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare h jsonb;
begin
 h:=public.get_rewards_production_health(p_provider_id);
 return h||jsonb_build_object('launch_ready',(h->>'status')='green','checks',jsonb_build_object('canonical_accounts',true,'append_only_ledger',true,'booking_lookup_rpc',true,'atomic_reservation',true,'atomic_redemption',true,'completion_earning_trigger',true));
end $$;
grant execute on function public.validate_rewards_launch_signoff(uuid) to authenticated;

create or replace function public.save_loyalty_program_v1(p_workspace_id uuid,p_name text,p_scope text,p_status text,p_points_per_dollar numeric,p_points_per_visit integer,p_program_id uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if not private.has_crm_capability(p_workspace_id,'crm.loyalty.adjust') then raise exception 'Not authorized'; end if;
 if p_program_id is null then
   update public.crm_loyalty_programs set is_default=false,updated_at=now() where workspace_id=p_workspace_id and status='active' and is_default;
   insert into public.crm_loyalty_programs(workspace_id,name,scope,status,points_per_dollar,points_per_visit,is_default,created_by) values(p_workspace_id,trim(p_name),p_scope,p_status,greatest(p_points_per_dollar,0),greatest(p_points_per_visit,0),true,auth.uid()) returning id into v_id;
 else
   update public.crm_loyalty_programs set name=trim(p_name),scope=p_scope,status=p_status,points_per_dollar=greatest(p_points_per_dollar,0),points_per_visit=greatest(p_points_per_visit,0),updated_at=now() where id=p_program_id and workspace_id=p_workspace_id returning id into v_id;
 end if;
 return v_id;
end $$;
grant execute on function public.save_loyalty_program_v1(uuid,text,text,text,numeric,integer,uuid) to authenticated;

create or replace function public.save_loyalty_reward_v1(p_workspace_id uuid,p_program_id uuid,p_name text,p_description text,p_points_required integer,p_reward_type text,p_config jsonb default '{}'::jsonb,p_reward_id uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if not private.has_crm_capability(p_workspace_id,'crm.loyalty.adjust') then raise exception 'Not authorized'; end if;
 if not exists(select 1 from public.crm_loyalty_programs where id=p_program_id and workspace_id=p_workspace_id) then raise exception 'Program not found'; end if;
 if p_reward_id is null then insert into public.crm_loyalty_rewards(workspace_id,program_id,name,description,points_required,reward_type,config,status) values(p_workspace_id,p_program_id,trim(p_name),p_description,greatest(p_points_required,1),p_reward_type,coalesce(p_config,'{}'::jsonb),'active') returning id into v_id;
 else update public.crm_loyalty_rewards set name=trim(p_name),description=p_description,points_required=greatest(p_points_required,1),reward_type=p_reward_type,config=coalesce(p_config,'{}'::jsonb),updated_at=now() where id=p_reward_id and workspace_id=p_workspace_id and program_id=p_program_id returning id into v_id; end if;
 return v_id;
end $$;
grant execute on function public.save_loyalty_reward_v1(uuid,uuid,text,text,integer,text,jsonb,uuid) to authenticated;

create or replace function public.get_loyalty_management_v1(p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if not private.has_crm_capability(p_workspace_id,'crm.view') then raise exception 'Not authorized'; end if;
 return jsonb_build_object('programs',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc) from public.crm_loyalty_programs p where p.workspace_id=p_workspace_id),'[]'::jsonb),'rewards',coalesce((select jsonb_agg(to_jsonb(r) order by r.points_required) from public.crm_loyalty_rewards r where r.workspace_id=p_workspace_id),'[]'::jsonb),'accounts',coalesce((select jsonb_agg(to_jsonb(a) order by a.updated_at desc) from public.crm_loyalty_accounts a where a.workspace_id=p_workspace_id),'[]'::jsonb));
end $$;
grant execute on function public.get_loyalty_management_v1(uuid) to authenticated;
