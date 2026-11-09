-- Service-record completion guarantee.
--
-- Owner ruling (2026-11-09): a service record is created on EVERY appointment
-- closeout, no matter which path closes the appointment. The invoice is the
-- money document; the service record is the work/warranty record and the
-- service history of both the vehicle and the customer.
--
-- Apply AFTER 20261110000000_bookkeeping_vendor_rules.sql.
-- File-only until applied manually at merge time. This repository has no
-- migration runner, so production truth is confirmed only by the post-apply
-- readback, not by this file's presence in the repo.
--
-- Design notes:
-- * The canonical Complete Appointment dialog / closeout RPC is untouched.
--   This guarantee sits underneath it and underneath every other writer:
--   generic appointment PATCH routes (Hono and the legacy shadow route),
--   marketplace lead-status writes, direct SQL closeouts, offline replay,
--   imports, and any future path that lands an appointment on 'completed'.
-- * The triggers are AFTER, never BEFORE. The BEFORE UPDATE inspection and
--   recommendation gates keep their veto; only completions that actually
--   land mint a record. A completion the owner orders with inspections
--   waived still lands, so it still mints.
-- * Idempotency leans on the existing unique constraint
--   service_records_workspace_appointment_key (workspace_id, appointment_id):
--   an existence check first, then ON CONFLICT DO NOTHING for races.
-- * Exception choice (codebase precedent: the BEFORE completion gates raise,
--   and the invoice-sync trigger does not swallow errors): there is NO
--   catch-all around the insert. An unexpected mint failure aborts the
--   enclosing transaction, so an appointment can never half-commit as
--   'completed' with its record silently missing. The only narrow exception
--   blocks are for parsing optional metadata timestamps, where a malformed
--   value falls back to the appointment's own schedule/update timestamps.

create or replace function public.ensure_service_record_for_appointment_v1(
  p_workspace_id uuid,
  p_appointment_id uuid,
  p_origin text default 'trigger'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appt public.appointments%rowtype;
  v_record_id uuid;
  v_work_performed text;
  v_started_at timestamptz;
  v_completed_at timestamptz;
  v_subtotal numeric;
  v_tax_amount numeric;
  v_tax_rate numeric;
begin
  if p_workspace_id is null or p_appointment_id is null then
    return null;
  end if;

  select *
    into v_appt
    from public.appointments
   where workspace_id = p_workspace_id
     and id = p_appointment_id;

  if not found or v_appt.status::text <> 'completed' then
    return null;
  end if;

  -- Existence guard: a record the canonical RPC/dialog path (or any earlier
  -- writer) already created is authoritative and is left untouched.
  select id
    into v_record_id
    from public.service_records
   where workspace_id = p_workspace_id
     and appointment_id = p_appointment_id
   order by created_at asc
   limit 1;

  if v_record_id is not null then
    return v_record_id;
  end if;

  -- Timestamps come only from the appointment itself: the actual start/end
  -- stamps its lifecycle keeps in metadata, falling back to its scheduled
  -- start and its last update. Malformed metadata values never abort the
  -- completion; they fall back.
  begin
    v_started_at := nullif(v_appt.metadata ->> 'actual_start_time', '')::timestamptz;
  exception when others then
    v_started_at := null;
  end;

  begin
    v_completed_at := nullif(v_appt.metadata ->> 'actual_end_time', '')::timestamptz;
  exception when others then
    v_completed_at := null;
  end;

  v_started_at := coalesce(v_started_at, v_appt.starts_at);
  v_completed_at := coalesce(v_completed_at, v_appt.updated_at, now());

  -- service_records_time_order: a completion never precedes its start.
  if v_started_at is not null and v_completed_at < v_started_at then
    v_completed_at := v_started_at;
  end if;

  -- Work performed: the appointment's own service lines first, composed the
  -- way sync_appointment_vehicle_service_records_v1 composes them (item
  -- descriptions in line order), scoped to the appointment's vehicle when
  -- items are vehicle-pinned. Fall back to the canonical completion RPC's
  -- chain: metadata description, metadata title, appointment notes, then
  -- the literal 'Completed appointment'.
  select string_agg(
           nullif(trim(ai.description), ''),
           ', '
           order by ai.sort_order, ai.created_at
         )
    into v_work_performed
    from public.appointment_items ai
   where ai.workspace_id = p_workspace_id
     and ai.appointment_id = p_appointment_id
     and nullif(trim(ai.description), '') is not null
     and (
       v_appt.vehicle_id is null
       or coalesce(
            case
              when ai.metadata ->> 'vehicle_id'
                     ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
              then (ai.metadata ->> 'vehicle_id')::uuid
            end,
            v_appt.vehicle_id
          ) = v_appt.vehicle_id
     );

  v_work_performed := coalesce(
    nullif(trim(v_work_performed), ''),
    nullif(v_appt.metadata ->> 'description', ''),
    nullif(v_appt.metadata ->> 'title', ''),
    v_appt.notes,
    'Completed appointment'
  );

  -- Totals exactly as the canonical completion RPC derives them: the
  -- appointment metadata's numeric estimated_cost / tax_amount, the
  -- workspace tax rate, and total = subtotal + tax (null when both are).
  v_subtotal := case
    when jsonb_typeof(v_appt.metadata -> 'estimated_cost') = 'number'
    then (v_appt.metadata ->> 'estimated_cost')::numeric
    else null
  end;
  v_tax_amount := case
    when jsonb_typeof(v_appt.metadata -> 'tax_amount') = 'number'
    then (v_appt.metadata ->> 'tax_amount')::numeric
    else null
  end;

  select tax_rate
    into v_tax_rate
    from public.workspace_settings
   where workspace_id = p_workspace_id;

  insert into public.service_records (
    workspace_id,
    appointment_id,
    customer_id,
    vehicle_id,
    completed_by,
    status,
    work_performed,
    customer_notes,
    metadata,
    started_at,
    completed_at,
    subtotal,
    tax_rate,
    tax_amount,
    total_amount,
    currency_code
  ) values (
    p_workspace_id,
    p_appointment_id,
    v_appt.customer_id,
    v_appt.vehicle_id,
    auth.uid(),
    'completed',
    v_work_performed,
    v_appt.notes,
    jsonb_build_object(
      'source', 'appointment_completion',
      'appointment_metadata', coalesce(v_appt.metadata, '{}'::jsonb),
      'completion_guarantee', jsonb_build_object(
        'origin', coalesce(nullif(p_origin, ''), 'trigger'),
        'version', 1
      )
    ),
    v_started_at,
    v_completed_at,
    v_subtotal,
    v_tax_rate,
    v_tax_amount,
    case
      when v_subtotal is null and v_tax_amount is null then null
      else coalesce(v_subtotal, 0) + coalesce(v_tax_amount, 0)
    end,
    'USD'
  )
  on conflict (workspace_id, appointment_id) do nothing
  returning id into v_record_id;

  if v_record_id is null then
    -- Lost an insert race: the winning row is the record.
    select id
      into v_record_id
      from public.service_records
     where workspace_id = p_workspace_id
       and appointment_id = p_appointment_id
     order by created_at asc
     limit 1;
  end if;

  return v_record_id;
end;
$$;

comment on function public.ensure_service_record_for_appointment_v1(uuid, uuid, text) is
  'Completion guarantee core: ensures exactly one service record exists for a completed appointment, built only from appointment-held data. Idempotent via the (workspace_id, appointment_id) unique constraint. SECURITY DEFINER is intentional so back-end/service-role closeouts with no auth.uid() still mint; completed_by is auth.uid() when a user context exists, else null.';

revoke all on function public.ensure_service_record_for_appointment_v1(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.ensure_service_record_for_appointment_v1(uuid, uuid, text) to service_role;

create or replace function public.ensure_service_record_on_completion_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_service_record_for_appointment_v1(new.workspace_id, new.id, 'trigger');
  return new;
end;
$$;

comment on function public.ensure_service_record_on_completion_v1() is
  'AFTER INSERT / AFTER UPDATE OF status trigger body for the service-record completion guarantee. Runs after the BEFORE completion gates and after the invoice-sync trigger (trigger name sorts after appointments_sync_invoice_v1), so it sees the landed completion and its settled metadata.';

revoke all on function public.ensure_service_record_on_completion_v1() from public, anon, authenticated;

drop trigger if exists trg_ensure_service_record_on_completion_insert_v1 on public.appointments;
create trigger trg_ensure_service_record_on_completion_insert_v1
after insert on public.appointments
for each row
when (new.status::text = 'completed')
execute function public.ensure_service_record_on_completion_v1();

drop trigger if exists trg_ensure_service_record_on_completion_update_v1 on public.appointments;
create trigger trg_ensure_service_record_on_completion_update_v1
after update of status on public.appointments
for each row
when (old.status is distinct from new.status and new.status::text = 'completed')
execute function public.ensure_service_record_on_completion_v1();
