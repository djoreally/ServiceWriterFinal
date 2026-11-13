-- Clock family min(uuid) repair (2026-11-10).
--
-- The defect: Postgres has no min() aggregate for uuid. Three selects
-- authored in the Step 4 family migration (20261110124500) resolve a
-- caller's workspace with count(*) + min(<uuid column>):
--   clock_in:                      min(t.workspace_id), min(t.id) over
--                                  technicians, and min(wm.workspace_id)
--                                  over workspace_members;
--   create_team_os_technician_v1:  min(wm.workspace_id) over
--                                  workspace_members.
-- PL/pgSQL plans those statements on first execution, so the FIRST real
-- call throws 42883 "function min(uuid) does not exist". Proven live
-- 2026-11-10 by a rolled-back probe of clock_in as the owner: 42883 at
-- the technicians select, no state persisted.
--
-- The replacement bodies below are byte-identical to the production
-- bodies (verified by in-DB fingerprints on 2026-11-10: clock_in len
-- 2034 md5 852765ea56c7d4924d294aa37dc96bf1; create_team_os_technician_v1
-- len 2798 md5 d1b3b32cefb1780c29cb7cc95ae841af) EXCEPT the three
-- defective selects, which become count-first reads: count the rows,
-- and only when the count is exactly 1 read that row's values. The
-- semantics are unchanged for 0, 1, and many rows (0: the resolved ids
-- stay null and the existing guards fire; 1: that row; many: the
-- existing ambiguity guards fire before the values are used).
--
-- clock_out, start_break, and end_break were captured the same day and
-- contain no min( — they are not touched.

create or replace function public.clock_in(p_location jsonb default null)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_workspace_id uuid;
  v_technician_id uuid;
  v_tech_rows integer;
  v_memberships integer;
  v_entry_id uuid;
  v_now_text text := to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  -- Already clocked in: return the open entry rather than stacking a
  -- second open row (GET /v1/time-clock defines "current" as an entry
  -- with clock_out null; duplicates would corrupt that read).
  select id into v_entry_id
  from public.time_clock_entries
  where user_id = v_user and clock_out is null
  order by clock_in desc
  limit 1;
  if v_entry_id is not null then
    return v_entry_id::text;
  end if;

  select count(*) into v_tech_rows
  from public.technicians t
  where t.auth_user_id = v_user;
  if v_tech_rows = 1 then
    select t.workspace_id, t.id into v_workspace_id, v_technician_id
    from public.technicians t
    where t.auth_user_id = v_user;
  end if;

  if v_tech_rows is null or v_tech_rows = 0 then
    v_technician_id := null;
    select count(*) into v_memberships
    from public.workspace_members wm
    where wm.user_id = v_user and wm.is_active;
    if v_memberships = 1 then
      select wm.workspace_id into v_workspace_id
      from public.workspace_members wm
      where wm.user_id = v_user and wm.is_active;
    end if;
    if v_memberships is null or v_memberships <> 1 then
      raise exception 'Clock-in workspace is ambiguous for this caller';
    end if;
  elsif v_tech_rows > 1 then
    raise exception 'Clock-in workspace is ambiguous for this caller';
  end if;

  insert into public.time_clock_entries (
    workspace_id, user_id, technician_id, clock_in, status, location_data,
    clock_in_location
  ) values (
    v_workspace_id, v_user, v_technician_id, v_now_text, 'active', p_location,
    -- The typed location columns carry object-shaped locations (the
    -- {lat, lng} contract of the time-clock client); a scalar payload
    -- (the /v1/time-clock route passes a plain string) lands only in
    -- the generic location_data column.
    case when jsonb_typeof(p_location) = 'object' then p_location end
  )
  returning id into v_entry_id;

  return v_entry_id::text;
end;
$$;

create or replace function public.create_team_os_technician_v1(
  p_email text default null,
  p_name text default null,
  p_phone text default null,
  p_profile jsonb default null,
  p_role text default null,
  p_send_invite boolean default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_workspace_id uuid;
  v_memberships integer;
  v_profile jsonb := coalesce(p_profile, '{}'::jsonb);
  v_trimmed_name text := btrim(coalesce(p_name, ''));
  v_first_name text;
  v_last_name text;
  v_technician_id uuid;
  v_token text;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;
  if v_trimmed_name = '' then
    raise exception 'technician_name_required';
  end if;

  select count(*) into v_memberships
  from public.workspace_members wm
  where wm.user_id = v_user and wm.is_active;
  if v_memberships = 1 then
    select wm.workspace_id into v_workspace_id
    from public.workspace_members wm
    where wm.user_id = v_user and wm.is_active;
  end if;

  if v_memberships is null or v_memberships <> 1 then
    raise exception 'Technician-create workspace is ambiguous for this caller';
  end if;

  v_first_name := split_part(v_trimmed_name, ' ', 1);
  v_last_name := nullif(btrim(substr(v_trimmed_name, length(v_first_name) + 1)), '');

  insert into public.technicians (
    workspace_id, user_id, name, first_name, last_name,
    email, phone, role,
    address, city, state, zip_code, country,
    hire_date, employment_type, employee_id,
    hourly_rate, salary, pay_type, payroll_type,
    skills, certifications,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
    drivers_license_number, drivers_license_state,
    notes, invited_at
  ) values (
    v_workspace_id, v_user, v_trimmed_name, v_first_name, v_last_name,
    p_email, p_phone, p_role,
    v_profile ->> 'address', v_profile ->> 'city', v_profile ->> 'state',
    v_profile ->> 'zip_code', v_profile ->> 'country',
    nullif(v_profile ->> 'hire_date', '')::date,
    v_profile ->> 'employment_type', v_profile ->> 'employee_id',
    nullif(v_profile ->> 'hourly_rate', '')::numeric,
    nullif(v_profile ->> 'salary', '')::numeric,
    v_profile ->> 'pay_type', v_profile ->> 'payroll_type',
    case when jsonb_typeof(v_profile -> 'skills') = 'array'
      then array(select jsonb_array_elements_text(v_profile -> 'skills')) end,
    case when jsonb_typeof(v_profile -> 'certifications') = 'object'
      then v_profile -> 'certifications' end,
    v_profile ->> 'emergency_contact_name',
    v_profile ->> 'emergency_contact_phone',
    v_profile ->> 'emergency_contact_relationship',
    v_profile ->> 'drivers_license_number',
    v_profile ->> 'drivers_license_state',
    v_profile ->> 'notes',
    case when coalesce(p_send_invite, false) then now() end
  )
  returning id into v_technician_id;

  if coalesce(p_send_invite, false) then
    v_token := replace(gen_random_uuid()::text, '-', '')
            || replace(gen_random_uuid()::text, '-', '');
  end if;

  return jsonb_build_object(
    'technician_id', v_technician_id,
    'name', v_trimmed_name,
    'email', p_email,
    'invitation_token', v_token
  );
end;
$$;
