-- Phase 1 certification: historical MOMS appointment-location recovery.
--
-- Business-confirmed historical rule:
-- For existing MOMS appointments, the customer address stored with the
-- historical record represents the correct service address at that time.
-- Prefer an appointment-owned metadata.location_address when present;
-- otherwise snapshot the historical customer address into a dedicated
-- appointment-specific locations row.
--
-- Forward behavior is different: new appointments must persist their own
-- location at creation time and must never infer it from customer profile data.

do $$
declare
  v_workspace_id uuid;
  v_appointment record;
  v_location_id uuid;
  v_source text;
  v_address_line1 text;
  v_address_line2 text;
  v_city text;
  v_region text;
  v_postal_code text;
  v_country_code character(2);
  v_latitude numeric;
  v_longitude numeric;
begin
  select w.id
    into v_workspace_id
  from public.workspaces w
  where w.slug::text = 'momsoilchange'
  limit 1;

  if v_workspace_id is null then
    raise exception 'MOMS_WORKSPACE_NOT_FOUND';
  end if;

  for v_appointment in
    select
      a.id as appointment_id,
      a.metadata,
      c.address_line1 as customer_address_line1,
      c.address_line2 as customer_address_line2,
      c.city as customer_city,
      c.region as customer_region,
      c.postal_code as customer_postal_code,
      c.country_code as customer_country_code
    from public.appointments a
    join public.customers c
      on c.workspace_id = a.workspace_id
     and c.id = a.customer_id
    where a.workspace_id = v_workspace_id
      and a.location_id is null
    order by a.created_at, a.id
    for update of a
  loop
    if nullif(trim(coalesce(v_appointment.metadata->>'location_address', '')), '') is not null then
      v_source := 'appointment_metadata';
      v_address_line1 := trim(v_appointment.metadata->>'location_address');
      -- metadata.location_address is historically stored as a complete display
      -- address, so do not mix mutable customer components into that snapshot.
      v_address_line2 := null;
      v_city := null;
      v_region := null;
      v_postal_code := null;
      v_country_code := coalesce(v_appointment.customer_country_code, 'US');
      v_latitude := case
        when nullif(v_appointment.metadata->>'location_lat', '') is null then null
        else (v_appointment.metadata->>'location_lat')::numeric
      end;
      v_longitude := case
        when nullif(v_appointment.metadata->>'location_lng', '') is null then null
        else (v_appointment.metadata->>'location_lng')::numeric
      end;
    else
      v_source := 'historical_customer_address_confirmed';
      v_address_line1 := nullif(trim(coalesce(v_appointment.customer_address_line1, '')), '');
      v_address_line2 := nullif(trim(coalesce(v_appointment.customer_address_line2, '')), '');
      v_city := nullif(trim(coalesce(v_appointment.customer_city, '')), '');
      v_region := nullif(trim(coalesce(v_appointment.customer_region, '')), '');
      v_postal_code := nullif(trim(coalesce(v_appointment.customer_postal_code, '')), '');
      v_country_code := coalesce(v_appointment.customer_country_code, 'US');
      v_latitude := null;
      v_longitude := null;
    end if;

    if v_address_line1 is null then
      raise exception 'HISTORICAL_APPOINTMENT_LOCATION_MISSING:%', v_appointment.appointment_id;
    end if;

    insert into public.locations (
      workspace_id,
      name,
      location_type,
      address_line1,
      address_line2,
      city,
      region,
      postal_code,
      country_code,
      latitude,
      longitude
    ) values (
      v_workspace_id,
      'Appointment service location',
      'customer_site'::public.location_type,
      v_address_line1,
      v_address_line2,
      v_city,
      v_region,
      v_postal_code,
      v_country_code,
      v_latitude,
      v_longitude
    )
    returning id into v_location_id;

    update public.appointments
    set location_id = v_location_id,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'location_backfill', jsonb_build_object(
            'version', 1,
            'source', v_source,
            'performed_at', now()
          )
        ),
        updated_at = now()
    where id = v_appointment.appointment_id
      and workspace_id = v_workspace_id
      and location_id is null;
  end loop;

  if exists (
    select 1
    from public.appointments a
    join public.customers c
      on c.workspace_id = a.workspace_id
     and c.id = a.customer_id
    where a.workspace_id = v_workspace_id
      and a.location_id is null
      and (
        nullif(trim(coalesce(a.metadata->>'location_address', '')), '') is not null
        or nullif(trim(coalesce(c.address_line1, '')), '') is not null
      )
  ) then
    raise exception 'MOMS_APPOINTMENT_LOCATION_BACKFILL_INCOMPLETE';
  end if;
end
$$;
