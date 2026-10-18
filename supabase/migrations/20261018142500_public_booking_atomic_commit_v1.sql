-- Public booking commit v1: one database transaction for the appointment,
-- its vehicle configuration and all billable service lines.
-- Do not deploy until the certification in this PR is green.
CREATE TABLE IF NOT EXISTS public.public_booking_submission_keys (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  submission_key uuid NOT NULL,
  payload_hash text NOT NULL,
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, submission_key)
);
ALTER TABLE public.public_booking_submission_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.public_booking_submission_keys FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_booking_commit_v1(
  p_submission_key uuid,
  p_booking_slug text,
  p_scheduled_date date,
  p_scheduled_time time without time zone,
  p_duration_minutes integer,
  p_title text,
  p_guest_name text,
  p_guest_email text,
  p_guest_phone text,
  p_description text,
  p_notes text,
  p_estimated_cost numeric,
  p_tax_amount numeric,
  p_service_catalog_id uuid,
  p_vehicle_id uuid,
  p_location_address text,
  p_location_lat numeric,
  p_location_lng numeric,
  p_status text,
  p_services jsonb,
  p_configuration jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_workspace_id uuid;
  v_hash text;
  v_prior_hash text;
  v_appointment_id uuid;
  v_prior_appointment_id uuid;
  v_inserted integer;
BEGIN
  SELECT c.workspace_id INTO v_workspace_id
    FROM public.resolve_public_booking_context(p_booking_slug) c;
  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'BOOKING_CONTEXT_INVALID'; END IF;
  IF p_submission_key IS NULL THEN RAISE EXCEPTION 'BOOKING_IDEMPOTENCY_REQUIRED'; END IF;
  IF p_status IS DISTINCT FROM 'confirmed' THEN RAISE EXCEPTION 'INVALID_BOOKING_STATUS'; END IF;
  IF p_services IS NULL OR jsonb_typeof(p_services) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_services) NOT BETWEEN 1 AND 25 THEN
    RAISE EXCEPTION 'BOOKING_ITEMS_REQUIRED';
  END IF;
  IF p_configuration IS NULL OR jsonb_typeof(p_configuration) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'BOOKING_CONFIGURATION_REQUIRED';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_services) s
    WHERE nullif(s->>'vehicle_id', '') IS NULL
  ) THEN RAISE EXCEPTION 'BOOKING_SERVICE_VEHICLE_REQUIRED'; END IF;

  -- The nonvolatile customer/service fields are part of the request identity.
  -- Exclude capture timestamp so a browser retry can regenerate configuration.
  v_hash := md5(jsonb_build_object(
    'slug', lower(trim(p_booking_slug)), 'date', p_scheduled_date,
    'time', p_scheduled_time, 'duration', p_duration_minutes,
    'guest_name', trim(p_guest_name), 'email', lower(trim(p_guest_email)),
    'phone', regexp_replace(coalesce(p_guest_phone,''), '[^0-9]', '', 'g'),
    'title', p_title, 'description', p_description, 'notes', p_notes,
    'vehicle_id', p_vehicle_id, 'service_catalog_id', p_service_catalog_id,
    'location_address', trim(p_location_address),
    'location_lat', p_location_lat, 'location_lng', p_location_lng,
    'services', p_services, 'configuration', p_configuration - 'capturedAt'
  )::text);

  -- Serialize identical keys before any appointment insert. All SQL statements
  -- below run in the same PostgreSQL RPC transaction: a service/configuration
  -- exception rolls back the location, appointment and submission key.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_workspace_id::text || ':' || p_submission_key::text, 0)
  );
  SELECT k.payload_hash, k.appointment_id
    INTO v_prior_hash, v_prior_appointment_id
    FROM public.public_booking_submission_keys k
    WHERE k.workspace_id = v_workspace_id AND k.submission_key = p_submission_key
    FOR UPDATE;
  IF FOUND THEN
    IF v_prior_hash IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'BOOKING_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_prior_appointment_id;
  END IF;

  v_appointment_id := public.public_booking_book_appointment_v3(
    p_booking_slug, p_scheduled_date, p_scheduled_time, p_duration_minutes,
    p_title, p_guest_name, p_guest_email, p_guest_phone,
    p_description, p_notes, p_estimated_cost, p_tax_amount,
    p_service_catalog_id, p_vehicle_id, p_location_address,
    p_location_lat, p_location_lng, p_status
  );

  PERFORM public.public_booking_save_configuration_v2(
    p_booking_slug, v_appointment_id, p_guest_email, p_guest_phone, p_configuration
  );
  v_inserted := public.public_booking_insert_services_v7(
    p_booking_slug, v_appointment_id, p_guest_email, p_guest_phone, p_services
  );
  IF v_inserted IS DISTINCT FROM jsonb_array_length(p_services) THEN
    RAISE EXCEPTION 'BOOKING_SERVICE_COUNT_MISMATCH';
  END IF;

  INSERT INTO public.public_booking_submission_keys(
    workspace_id, submission_key, payload_hash, appointment_id
  ) VALUES (v_workspace_id, p_submission_key, v_hash, v_appointment_id);
  RETURN v_appointment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.public_booking_commit_v1(
  uuid,text,date,time without time zone,integer,text,text,text,text,text,text,
  numeric,numeric,uuid,uuid,text,numeric,numeric,text,jsonb,jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_booking_commit_v1(
  uuid,text,date,time without time zone,integer,text,text,text,text,text,text,
  numeric,numeric,uuid,uuid,text,numeric,numeric,text,jsonb,jsonb
) TO anon, authenticated;
