create or replace function public.resolve_rewards_workspace_v1(p_provider_id uuid)
returns uuid language sql stable security definer set search_path=public as $$
  select w.id from public.workspaces w
   where w.is_active is true and (w.id=p_provider_id or w.created_by=p_provider_id)
   order by (w.id=p_provider_id) desc, w.created_at asc limit 1
$$;
revoke all on function public.resolve_rewards_workspace_v1(uuid) from public;

create or replace function public.ensure_loyalty_reward_instances_v1(p_account_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer := 0; v_account public.crm_loyalty_accounts%rowtype; v_reward record;
begin
  select * into v_account from public.crm_loyalty_accounts where id=p_account_id for update;
  if not found then return 0; end if;
  update public.crm_loyalty_reward_instances set status='expired',updated_at=now() where loyalty_account_id=p_account_id and status in ('available','reserved') and expires_at is not null and expires_at<=now();
  update public.crm_loyalty_reward_instances set status='available',reserved_appointment_id=null,reserved_until=null,updated_at=now() where loyalty_account_id=p_account_id and status='reserved' and reserved_until is not null and reserved_until<=now();
  for v_reward in select r.* from public.crm_loyalty_rewards r join public.crm_loyalty_programs p on p.id=r.program_id where r.workspace_id=v_account.workspace_id and r.status='active' and p.status='active' and (v_account.program_id is null or r.program_id=v_account.program_id) and r.points_required<=v_account.current_points order by r.points_required loop
    if not exists(select 1 from public.crm_loyalty_reward_instances i where i.loyalty_account_id=p_account_id and i.reward_id=v_reward.id and i.status in ('available','reserved')) then
      insert into public.crm_loyalty_reward_instances(workspace_id,loyalty_account_id,customer_id,reward_id,points_cost,status,expires_at) values(v_account.workspace_id,v_account.id,v_account.customer_id,v_reward.id,v_reward.points_required,'available',null);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;
revoke all on function public.ensure_loyalty_reward_instances_v1(uuid) from public;

create or replace function public.award_loyalty_points_v1(p_workspace_id uuid,p_customer_id uuid,p_amount numeric,p_visit_count integer,p_source_type text,p_source_id text,p_reason text default 'Service rewards')
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_program public.crm_loyalty_programs%rowtype; v_account public.crm_loyalty_accounts%rowtype; v_points integer; v_existing integer;
begin
  select * into v_program from public.crm_loyalty_programs where workspace_id=p_workspace_id and status='active' and is_default order by created_at limit 1;
  if not found then return jsonb_build_object('status','skipped','reason','no_active_program'); end if;
  select count(*) into v_existing from public.crm_loyalty_ledger where workspace_id=p_workspace_id and source_type=p_source_type and source_id=p_source_id;
  if v_existing>0 then return jsonb_build_object('status','idempotent','reason','source_already_applied'); end if;
  v_points := greatest(0,floor(greatest(coalesce(p_amount,0),0)*v_program.points_per_dollar)::integer + greatest(coalesce(p_visit_count,0),0)*v_program.points_per_visit);
  if v_points=0 then return jsonb_build_object('status','skipped','reason','zero_points'); end if;
  insert into public.crm_loyalty_accounts(workspace_id,customer_id,current_points,program_id) values(p_workspace_id,p_customer_id,0,v_program.id) on conflict(workspace_id,customer_id) do update set program_id=coalesce(public.crm_loyalty_accounts.program_id,excluded.program_id),updated_at=now() returning * into v_account;
  update public.crm_loyalty_accounts set current_points=current_points+v_points,updated_at=now() where id=v_account.id returning * into v_account;
  insert into public.crm_loyalty_ledger(workspace_id,loyalty_account_id,customer_id,points_delta,reason,source_type,source_id) values(p_workspace_id,v_account.id,p_customer_id,v_points,p_reason,p_source_type,p_source_id);
  perform public.ensure_loyalty_reward_instances_v1(v_account.id);
  return jsonb_build_object('status','awarded','points_awarded',v_points,'new_points_balance',v_account.current_points,'loyalty_account_id',v_account.id);
end $$;
revoke all on function public.award_loyalty_points_v1(uuid,uuid,numeric,integer,text,text,text) from public;

create or replace function public.award_loyalty_for_service_record_v1(p_service_record_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_sr public.service_records%rowtype;
begin
  select * into v_sr from public.service_records where id=p_service_record_id;
  if not found then return jsonb_build_object('status','skipped','reason','service_record_not_found'); end if;
  if v_sr.status<>'completed' or v_sr.customer_id is null then return jsonb_build_object('status','skipped','reason','service_not_completed'); end if;
  return public.award_loyalty_points_v1(v_sr.workspace_id,v_sr.customer_id,coalesce(v_sr.total_amount,v_sr.subtotal,0),1,'service_record',v_sr.id::text,'Completed service');
end $$;
revoke all on function public.award_loyalty_for_service_record_v1(uuid) from public;

create or replace function public.trg_award_loyalty_service_record_v1()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='completed' and (tg_op='INSERT' or old.status is distinct from new.status) then perform public.award_loyalty_for_service_record_v1(new.id); end if;
  return new;
end $$;
drop trigger if exists trg_award_loyalty_service_record_v1 on public.service_records;
create trigger trg_award_loyalty_service_record_v1 after insert or update of status on public.service_records for each row execute function public.trg_award_loyalty_service_record_v1();

create or replace function public.lookup_booking_rewards(p_provider_id uuid,p_email text,p_customer_account_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_workspace uuid; v_customer uuid; v_matches integer; v_account public.crm_loyalty_accounts%rowtype; v_available jsonb; v_catalog jsonb; v_lifetime integer;
begin
  v_workspace := public.resolve_rewards_workspace_v1(p_provider_id);
  if v_workspace is null then return jsonb_build_object('status','no_match','points_balance',0,'available_rewards','[]'::jsonb,'catalog','[]'::jsonb); end if;
  select count(*),min(id) into v_matches,v_customer from public.customers where workspace_id=v_workspace and lower(email::text)=lower(trim(p_email));
  if v_matches=0 then return jsonb_build_object('status','no_match','points_balance',0,'available_rewards','[]'::jsonb,'catalog','[]'::jsonb); end if;
  if v_matches>1 then return jsonb_build_object('status','requires_review','candidate_count',v_matches,'points_balance',0,'available_rewards','[]'::jsonb,'catalog','[]'::jsonb); end if;
  select * into v_account from public.crm_loyalty_accounts where workspace_id=v_workspace and customer_id=v_customer;
  if not found then return jsonb_build_object('status','matched','match_source','email','masked_email',regexp_replace(p_email,'(^.).*(@.*$)','\1***\2'),'points_balance',0,'lifetime_points_earned',0,'visit_count',0,'available_rewards','[]'::jsonb,'catalog',coalesce((select jsonb_agg(jsonb_build_object('reward_id',r.id,'name',r.name,'description',r.description,'reward_type',r.reward_type,'program_id',r.program_id,'program_name',p.name,'points_required',r.points_required,'points_remaining',r.points_required,'config',r.config) order by r.points_required) from public.crm_loyalty_rewards r join public.crm_loyalty_programs p on p.id=r.program_id where r.workspace_id=v_workspace and r.status='active' and p.status='active'),'[]'::jsonb)); end if;
  perform public.ensure_loyalty_reward_instances_v1(v_account.id);
  select coalesce(sum(greatest(points_delta,0)),0)::integer into v_lifetime from public.crm_loyalty_ledger where loyalty_account_id=v_account.id;
  select coalesce(jsonb_agg(jsonb_build_object('instance_id',i.id,'reward_id',r.id,'name',r.name,'description',r.description,'reward_type',r.reward_type,'program_id',r.program_id,'program_name',p.name,'status',i.status,'expires_at',i.expires_at,'points_required',r.points_required,'points_remaining',0,'config',r.config) order by r.points_required),'[]'::jsonb) into v_available from public.crm_loyalty_reward_instances i join public.crm_loyalty_rewards r on r.id=i.reward_id join public.crm_loyalty_programs p on p.id=r.program_id where i.loyalty_account_id=v_account.id and i.status='available' and (i.expires_at is null or i.expires_at>now());
  select coalesce(jsonb_agg(jsonb_build_object('reward_id',r.id,'name',r.name,'description',r.description,'reward_type',r.reward_type,'program_id',r.program_id,'program_name',p.name,'points_required',r.points_required,'points_remaining',greatest(r.points_required-v_account.current_points,0),'config',r.config) order by r.points_required),'[]'::jsonb) into v_catalog from public.crm_loyalty_rewards r join public.crm_loyalty_programs p on p.id=r.program_id where r.workspace_id=v_workspace and r.status='active' and p.status='active';
  return jsonb_build_object('status','matched','match_source','email','masked_email',regexp_replace(p_email,'(^.).*(@.*$)','\1***\2'),'points_balance',v_account.current_points,'lifetime_points_earned',v_lifetime,'available_rewards',v_available,'catalog',v_catalog);
end $$;
grant execute on function public.lookup_booking_rewards(uuid,text,uuid) to anon, authenticated;

create or replace function public.reserve_booking_reward(p_reward_instance_id uuid,p_appointment_id uuid,p_provider_id uuid,p_customer_email text,p_idempotency_key text default null,p_reservation_minutes integer default 30)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_instance public.crm_loyalty_reward_instances%rowtype; v_appointment public.appointments%rowtype; v_workspace uuid; v_email text;
begin
  v_workspace := public.resolve_rewards_workspace_v1(p_provider_id);
  select * into v_instance from public.crm_loyalty_reward_instances where id=p_reward_instance_id for update;
  select * into v_appointment from public.appointments where id=p_appointment_id;
  if v_workspace is null or not found or v_instance.workspace_id<>v_workspace or v_appointment.workspace_id<>v_workspace or v_instance.customer_id<>v_appointment.customer_id then return jsonb_build_object('status','skipped','reason','invalid_reward_context'); end if;
  select email::text into v_email from public.customers where id=v_instance.customer_id;
  if lower(coalesce(v_email,''))<>lower(trim(coalesce(p_customer_email,''))) then return jsonb_build_object('status','skipped','reason','customer_mismatch'); end if;
  if v_instance.status='reserved' and v_instance.reserved_appointment_id=p_appointment_id then return jsonb_build_object('status','reserved','idempotent',true,'reward_instance_id',v_instance.id,'appointment_id',p_appointment_id,'reservation_expires_at',v_instance.reserved_until); end if;
  if v_instance.status<>'available' then return jsonb_build_object('status','skipped','reason','reward_not_available'); end if;
  update public.crm_loyalty_reward_instances set status='reserved',reserved_appointment_id=p_appointment_id,reserved_until=now()+make_interval(mins=>greatest(5,least(coalesce(p_reservation_minutes,30),1440))),updated_at=now() where id=v_instance.id returning * into v_instance;
  return jsonb_build_object('status','reserved','reward_instance_id',v_instance.id,'appointment_id',p_appointment_id,'reservation_expires_at',v_instance.reserved_until);
end $$;
grant execute on function public.reserve_booking_reward(uuid,uuid,uuid,text,text,integer) to anon, authenticated;
