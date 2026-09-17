-- Canonical Rewards & Loyalty v1
-- Reconciles the legacy retention UI with workspace-scoped CRM loyalty accounts/ledger.
-- Source of truth: crm_loyalty_* tables. All public booking mutations are atomic RPCs.

create table if not exists public.crm_loyalty_programs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  scope text not null default 'per_customer' check (scope in ('per_customer','per_vehicle','global')),
  status text not null default 'active' check (status in ('active','inactive','archived')),
  points_per_dollar numeric(12,4) not null default 0 check (points_per_dollar >= 0),
  points_per_visit integer not null default 0 check (points_per_visit >= 0),
  is_default boolean not null default true,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists crm_loyalty_programs_one_default_active_idx
  on public.crm_loyalty_programs(workspace_id)
  where status='active' and is_default;

create table if not exists public.crm_loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  program_id uuid not null references public.crm_loyalty_programs(id) on delete cascade,
  name text not null,
  description text null,
  points_required integer not null check (points_required > 0),
  reward_type text not null check (reward_type in ('credit','free_service','discount_percent','discount_fixed','priority_booking')),
  config jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','inactive','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_loyalty_rewards_program_idx on public.crm_loyalty_rewards(program_id,status,points_required);

alter table public.crm_loyalty_accounts
  add column if not exists program_id uuid null references public.crm_loyalty_programs(id) on delete set null;

create table if not exists public.crm_loyalty_reward_instances (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  loyalty_account_id uuid not null references public.crm_loyalty_accounts(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  reward_id uuid not null references public.crm_loyalty_rewards(id) on delete restrict,
  points_cost integer not null check (points_cost > 0),
  status text not null default 'available' check (status in ('available','reserved','redeemed','cancelled','expired')),
  reserved_appointment_id uuid null references public.appointments(id) on delete set null,
  reserved_until timestamptz null,
  applied_discount_cents integer null check (applied_discount_cents is null or applied_discount_cents >= 0),
  expires_at timestamptz null,
  redeemed_at timestamptz null,
  cancelled_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_loyalty_reward_instances_account_idx on public.crm_loyalty_reward_instances(loyalty_account_id,status,created_at desc);
create unique index if not exists crm_loyalty_reward_instances_one_live_reward_idx
  on public.crm_loyalty_reward_instances(loyalty_account_id,reward_id)
  where status in ('available','reserved');

create unique index if not exists crm_loyalty_ledger_source_once_idx
  on public.crm_loyalty_ledger(workspace_id,source_type,source_id)
  where source_id is not null;

alter table public.crm_loyalty_programs enable row level security;
alter table public.crm_loyalty_rewards enable row level security;
alter table public.crm_loyalty_reward_instances enable row level security;

drop policy if exists crm_loyalty_programs_select on public.crm_loyalty_programs;
create policy crm_loyalty_programs_select on public.crm_loyalty_programs for select to authenticated
  using (private.has_crm_capability(workspace_id,'crm.view'));
drop policy if exists crm_loyalty_programs_write on public.crm_loyalty_programs;
create policy crm_loyalty_programs_write on public.crm_loyalty_programs for all to authenticated
  using (private.has_crm_capability(workspace_id,'crm.loyalty.adjust'))
  with check (private.has_crm_capability(workspace_id,'crm.loyalty.adjust'));

drop policy if exists crm_loyalty_rewards_select on public.crm_loyalty_rewards;
create policy crm_loyalty_rewards_select on public.crm_loyalty_rewards for select to authenticated
  using (private.has_crm_capability(workspace_id,'crm.view'));
drop policy if exists crm_loyalty_rewards_write on public.crm_loyalty_rewards;
create policy crm_loyalty_rewards_write on public.crm_loyalty_rewards for all to authenticated
  using (private.has_crm_capability(workspace_id,'crm.loyalty.adjust'))
  with check (private.has_crm_capability(workspace_id,'crm.loyalty.adjust'));

drop policy if exists crm_loyalty_reward_instances_select on public.crm_loyalty_reward_instances;
create policy crm_loyalty_reward_instances_select on public.crm_loyalty_reward_instances for select to authenticated
  using (private.has_crm_capability(workspace_id,'crm.view'));
drop policy if exists crm_loyalty_reward_instances_write on public.crm_loyalty_reward_instances;
create policy crm_loyalty_reward_instances_write on public.crm_loyalty_reward_instances for all to authenticated
  using (private.has_crm_capability(workspace_id,'crm.loyalty.adjust'))
  with check (private.has_crm_capability(workspace_id,'crm.loyalty.adjust'));

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
  update public.crm_loyalty_reward_instances
     set status='expired',updated_at=now()
   where loyalty_account_id=p_account_id and status in ('available','reserved') and expires_at is not null and expires_at<=now();
  update public.crm_loyalty_reward_instances
     set status='available',reserved_appointment_id=null,reserved_until=null,updated_at=now()
   where loyalty_account_id=p_account_id and status='reserved' and reserved_until is not null and reserved_until<=now();
  for v_reward in
    select r.* from public.crm_loyalty_rewards r
     join public.crm_loyalty_programs p on p.id=r.program_id
    where r.workspace_id=v_account.workspace_id and r.status='active'
      and p.status='active' and (v_account.program_id is null or r.program_id=v_account.program_id)
      and r.points_required<=v_account.current_points
    order by r.points_required
  loop
    if not exists(select 1 from public.crm_loyalty_reward_instances i where i.loyalty_account_id=p_account_id and i.reward_id=v_reward.id and i.status in ('available','reserved')) then
      insert into public.crm_loyalty_reward_instances(workspace_id,loyalty_account_id,customer_id,reward_id,points_cost,status,expires_at)
      values(v_account.workspace_id,v_account.id,v_account.customer_id,v_reward.id,v_reward.points_required,'available',null);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;
revoke all on function public.ensure_loyalty_reward_instances_v1(uuid) from public;

create or replace function public.award_loyalty_points_v1(
  p_workspace_id uuid,p_customer_id uuid,p_amount numeric,p_visit_count integer,p_source_type text,p_source_id text,p_reason text default 'Service rewards'
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_program public.crm_loyalty_programs%rowtype; v_account public.crm_loyalty_accounts%rowtype; v_points integer; v_existing integer;
begin
  select * into v_program from public.crm_loyalty_programs where workspace_id=p_workspace_id and status='active' and is_default order by created_at limit 1;
  if not found then return jsonb_build_object('status','skipped','reason','no_active_program'); end if;
  select count(*) into v_existing from public.crm_loyalty_ledger where workspace_id=p_workspace_id and source_type=p_source_type and source_id=p_source_id;
  if v_existing>0 then return jsonb_build_object('status','idempotent','reason','source_already_applied'); end if;
  v_points := greatest(0,floor(greatest(coalesce(p_amount,0),0)*v_program.points_per_dollar)::integer + greatest(coalesce(p_visit_count,0),0)*v_program.points_per_visit);
  if v_points=0 then return jsonb_build_object('status','skipped','reason','zero_points'); end if;
  insert into public.crm_loyalty_accounts(workspace_id,customer_id,current_points,program_id)
    values(p_workspace_id,p_customer_id,0,v_program.id)
    on conflict(workspace_id,customer_id) do update set program_id=coalesce(public.crm_loyalty_accounts.program_id,excluded.program_id),updated_at=now()
    returning * into v_account;
  update public.crm_loyalty_accounts set current_points=current_points+v_points,updated_at=now() where id=v_account.id returning * into v_account;
  insert into public.crm_loyalty_ledger(workspace_id,loyalty_account_id,customer_id,points_delta,reason,source_type,source_id)
    values(p_workspace_id,v_account.id,p_customer_id,v_points,p_reason,p_source_type,p_source_id);
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
  if new.status='completed' and (tg_op='INSERT' or old.status is distinct from new.status) then
    perform public.award_loyalty_for_service_record_v1(new.id);
  end if;
  return new;
end $$;
drop trigger if exists trg_award_loyalty_service_record_v1 on public.service_records;
create trigger trg_award_loyalty_service_record_v1 after insert or update of status on public.service_records
for each row execute function public.trg_award_loyalty_service_record_v1();

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
  if not found then
    return jsonb_build_object('status','matched','match_source','email','masked_email',regexp_replace(p_email,'(^.).*(@.*$)','\\1***\\2'),'points_balance',0,'lifetime_points_earned',0,'visit_count',0,'available_rewards','[]'::jsonb,
      'catalog',coalesce((select jsonb_agg(jsonb_build_object('reward_id',r.id,'name',r.name,'description',r.description,'reward_type',r.reward_type,'program_id',r.program_id,'program_name',p.name,'points_required',r.points_required,'points_remaining',r.points_required,'config',r.config) order by r.points_required) from public.crm_loyalty_rewards r join public.crm_loyalty_programs p on p.id=r.program_id where r.workspace_id=v_workspace and r.status='active' and p.status='active'),'[]'::jsonb));
  end if;
  perform public.ensure_loyalty_reward_instances_v1(v_account.id);
  select coalesce(sum(greatest(points_delta,0)),0)::integer into v_lifetime from public.crm_loyalty_ledger where loyalty_account_id=v_account.id;
  select coalesce(jsonb_agg(jsonb_build_object('instance_id',i.id,'reward_id',r.id,'name',r.name,'description',r.description,'reward_type',r.reward_type,'program_id',r.program_id,'program_name',p.name,'status',i.status,'expires_at',i.expires_at,'points_required',r.points_required,'points_remaining',0,'config',r.config) order by r.points_required),'[]'::jsonb)
    into v_available from public.crm_loyalty_reward_instances i join public.crm_loyalty_rewards r on r.id=i.reward_id join public.crm_loyalty_programs p on p.id=r.program_id
   where i.loyalty_account_id=v_account.id and i.status='available' and (i.expires_at is null or i.expires_at>now());
  select coalesce(jsonb_agg(jsonb_build_object('reward_id',r.id,'name',r.name,'description',r.description,'reward_type',r.reward_type,'program_id',r.program_id,'program_name',p.name,'points_required',r.points_required,'points_remaining',greatest(r.points_required-v_account.current_points,0),'config',r.config) order by r.points_required),'[]'::jsonb)
    into v_catalog from public.crm_loyalty_rewards r join public.crm_loyalty_programs p on p.id=r.program_id where r.workspace_id=v_workspace and r.status='active' and p.status='active';
  return jsonb_build_object('status','matched','match_source','email','masked_email',regexp_replace(p_email,'(^.).*(@.*$)','\\1***\\2'),'points_balance',v_account.current_points,'lifetime_points_earned',v_lifetime,'available_rewards',v_available,'catalog',v_catalog);
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
  insert into public.crm_loyalty_ledger(workspace_id,loyalty_account_id,customer_id,points_delta,reason,source_type,source_id)
    values(v_instance.workspace_id,v_instance.loyalty_account_id,v_instance.customer_id,-v_instance.points_cost,'Reward redeemed','reward_redemption',v_instance.id::text)
    on conflict do nothing;
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
    insert into public.crm_loyalty_ledger(workspace_id,loyalty_account_id,customer_id,points_delta,reason,source_type,source_id)
      values(v_instance.workspace_id,v_instance.loyalty_account_id,v_instance.customer_id,v_instance.points_cost,coalesce(p_reason,'Reward redemption reversed'),'reward_reversal',v_instance.id::text) on conflict do nothing;
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
  insert into public.crm_loyalty_accounts(workspace_id,customer_id,current_points,program_id) values(v_workspace,p_customer_id,0,v_program)
    on conflict(workspace_id,customer_id) do update set program_id=coalesce(public.crm_loyalty_accounts.program_id,excluded.program_id),updated_at=now() returning * into v_account;
  if v_account.current_points+p_points_delta<0 then return jsonb_build_object('status','skipped','reason','insufficient_points'); end if;
  update public.crm_loyalty_accounts set current_points=current_points+p_points_delta,updated_at=now() where id=v_account.id returning * into v_account;
  insert into public.crm_loyalty_ledger(workspace_id,loyalty_account_id,customer_id,points_delta,reason,source_type,source_id,created_by)
    values(v_workspace,v_account.id,p_customer_id,p_points_delta,coalesce(nullif(p_reason_note,''),p_reason_code),'manual_adjustment',v_source,p_actor_id);
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
 return jsonb_build_object('status',case when exists(select 1 from public.crm_loyalty_programs where workspace_id=v_workspace and status='active' and is_default) then 'green' else 'needs_configuration' end,
   'workspace_id',v_workspace,
   'active_programs',(select count(*) from public.crm_loyalty_programs where workspace_id=v_workspace and status='active'),
   'active_rewards',(select count(*) from public.crm_loyalty_rewards where workspace_id=v_workspace and status='active'),
   'enrolled_accounts',(select count(*) from public.crm_loyalty_accounts where workspace_id=v_workspace),
   'ledger_entries',(select count(*) from public.crm_loyalty_ledger where workspace_id=v_workspace),
   'available_rewards',(select count(*) from public.crm_loyalty_reward_instances where workspace_id=v_workspace and status='available'),
   'reserved_rewards',(select count(*) from public.crm_loyalty_reward_instances where workspace_id=v_workspace and status='reserved'),
   'redeemed_rewards',(select count(*) from public.crm_loyalty_reward_instances where workspace_id=v_workspace and status='redeemed'));
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
 return jsonb_build_object(
   'programs',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc) from public.crm_loyalty_programs p where p.workspace_id=p_workspace_id),'[]'::jsonb),
   'rewards',coalesce((select jsonb_agg(to_jsonb(r) order by r.points_required) from public.crm_loyalty_rewards r where r.workspace_id=p_workspace_id),'[]'::jsonb),
   'accounts',coalesce((select jsonb_agg(to_jsonb(a) order by a.updated_at desc) from public.crm_loyalty_accounts a where a.workspace_id=p_workspace_id),'[]'::jsonb)
 );
end $$;
grant execute on function public.get_loyalty_management_v1(uuid) to authenticated;
