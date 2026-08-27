-- Service Writer production preflight. Read-only except for raising an error.
-- Run this against the intended production project before applying the migration.
-- A successful result is the single row: {"status":"READY"}.

begin;

DO $$
DECLARE
  required_relation text;
  required_relations text[] := ARRAY[
    'workspaces', 'workspace_settings', 'customers', 'vehicles',
    'service_catalog', 'appointments'
  ];
  missing_relations text[] := ARRAY[]::text[];
BEGIN
  FOREACH required_relation IN ARRAY required_relations LOOP
    IF to_regclass('public.' || required_relation) IS NULL THEN
      missing_relations := array_append(missing_relations, required_relation);
    END IF;
  END LOOP;
  IF cardinality(missing_relations) > 0 THEN
    RAISE EXCEPTION 'SERVICE_WRITER_SCHEMA_INCOMPATIBLE: missing relations: %', array_to_string(missing_relations, ', ');
  END IF;
END
$$;

DO $$
DECLARE
  required_type text;
  required_types text[] := ARRAY['public.appointment_status'];
  missing_types text[] := ARRAY[]::text[];
BEGIN
  FOREACH required_type IN ARRAY required_types LOOP
    IF to_regtype(required_type) IS NULL THEN
      missing_types := array_append(missing_types, required_type);
    END IF;
  END LOOP;
  IF cardinality(missing_types) > 0 THEN
    RAISE EXCEPTION 'SERVICE_WRITER_SCHEMA_INCOMPATIBLE: missing types: %', array_to_string(missing_types, ', ');
  END IF;
END
$$;

DO $$
DECLARE
  required_function text;
  required_functions text[] := ARRAY[
    'public.upsert_booking_vehicle(uuid,uuid,integer,text,text,text,text,integer,text,text,text,text)',
    'public.save_appointment_booking_configuration(uuid,uuid,jsonb)',
    'public.insert_booking_appointment_services(uuid,jsonb)',
    'public.record_public_booking_payment_intent_v1(uuid,uuid,bigint,bigint,bigint,numeric,text,text,text)',
    'public.set_vehicle_tire_spec_v1(uuid,uuid,text,text,text,text,text,text)'
  ];
  missing_functions text[] := ARRAY[]::text[];
BEGIN
  FOREACH required_function IN ARRAY required_functions LOOP
    IF to_regprocedure(required_function) IS NULL THEN
      missing_functions := array_append(missing_functions, required_function);
    END IF;
  END LOOP;
  IF cardinality(missing_functions) > 0 THEN
    RAISE EXCEPTION 'SERVICE_WRITER_SCHEMA_INCOMPATIBLE: missing functions: %', array_to_string(missing_functions, ', ');
  END IF;
END
$$;

DO $$
DECLARE
  missing_columns text[] := ARRAY[]::text[];
  required_column record;
BEGIN
  FOR required_column IN
    SELECT * FROM (VALUES
      ('public.workspaces','id'),
      ('public.workspaces','created_by'),
      ('public.workspaces','is_active'),
      ('public.workspaces','timezone'),
      ('public.workspace_settings','workspace_id'),
      ('public.workspace_settings','booking_slug'),
      ('public.workspace_settings','booking_enabled'),
      ('public.workspace_settings','min_lead_time_hours'),
      ('public.workspace_settings','max_advance_days'),
      ('public.customers','id'),
      ('public.customers','workspace_id'),
      ('public.customers','first_name'),
      ('public.customers','last_name'),
      ('public.customers','email'),
      ('public.customers','phone'),
      ('public.customers','address_line1'),
      ('public.customers','metadata'),
      ('public.customers','created_at'),
      ('public.vehicles','id'),
      ('public.vehicles','workspace_id'),
      ('public.vehicles','customer_id'),
      ('public.service_catalog','id'),
      ('public.service_catalog','workspace_id'),
      ('public.service_catalog','is_active'),
      ('public.appointments','id'),
      ('public.appointments','workspace_id'),
      ('public.appointments','customer_id'),
      ('public.appointments','vehicle_id'),
      ('public.appointments','status'),
      ('public.appointments','starts_at'),
      ('public.appointments','ends_at'),
      ('public.appointments','source'),
      ('public.appointments','confirmation_code'),
      ('public.appointments','notes'),
      ('public.appointments','metadata'),
      ('public.appointments','created_at')
    ) AS v(relation_name, column_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema || '.' || c.table_name = required_column.relation_name
        AND c.column_name = required_column.column_name
    ) THEN
      missing_columns := array_append(missing_columns, required_column.relation_name || '.' || required_column.column_name);
    END IF;
  END LOOP;
  IF cardinality(missing_columns) > 0 THEN
    RAISE EXCEPTION 'SERVICE_WRITER_SCHEMA_INCOMPATIBLE: missing columns: %', array_to_string(missing_columns, ', ');
  END IF;
END
$$;

-- Confirm the migration is not already recorded or applied under a conflicting name.
DO $$
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM supabase_migrations.schema_migrations
       WHERE version = '20260827100000'
     ) THEN
    RAISE EXCEPTION 'MIGRATION_ALREADY_RECORDED: 20260827100000';
  END IF;
END
$$;

rollback;

select json_build_object(
  'status', 'READY',
  'project_schema', 'service_writer_operational_schema_present',
  'migration', '20260827100000_secure_public_booking_rpc_context'
) AS preflight;
