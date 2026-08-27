# Secure Public Booking Production Migration Runbook

This runbook is the controlled sequence for applying `20260827100000_secure_public_booking_rpc_context.sql` to the **correct Service Writer Supabase project**. It is intentionally fail-closed: the preflight must succeed before the migration is applied.

## 1. Identify and freeze the target

Use the Supabase project reference configured by the canonical Vercel production deployment. Do not infer the target from the project name. Confirm that the production Vercel environment variables resolve to one project:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PROJECT_ID
SUPABASE_SERVICE_ROLE_KEY  # server-only; never print or place in frontend configuration
```

The URL hostname and project ID must agree. Record the project reference, deployment ID, commit SHA, operator, UTC start time, and change ticket in the change record. Do not proceed if the target is the currently known schema-incomplete project `shlnvgqgygapwpzjdrhr`.

## 2. Create a database backup or restore point

Before DDL, create or confirm a provider-supported restore point/backup for the target project. The migration is transactional, but a restore point is required for operational rollback and for any future data/privilege drift investigation.

## 3. Run the read-only preflight

Run `supabase/ops/20260827_secure_public_booking_preflight.sql` against the target project using an administrative connection. The expected result is a single `READY` row. The script must fail if any required relation, column, type, legacy function signature, or migration prerequisite is absent.

For a direct SQL client:

```bash
psql "$TARGET_DATABASE_URL" \
  -v ON_ERROR_STOP=1 \
  -f supabase/ops/20260827_secure_public_booking_preflight.sql
```

For the Supabase MCP integration, use `execute_sql` for the preflight only after replacing `TARGET_PROJECT_REF` with the verified target project reference. The query must be sent as one transaction and must not be run against the schema-incomplete project.

## 4. Capture exact live function signatures and privileges

Before DDL, capture the output of the following read-only query. Save it with the change record:

```sql
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as result_type,
  p.prosecdef as security_definer,
  p.proconfig as config,
  has_function_privilege('anon', p.oid, 'execute') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'upsert_booking_vehicle',
    'save_appointment_booking_configuration',
    'insert_booking_appointment_services',
    'record_public_booking_payment_intent_v1',
    'set_vehicle_tire_spec_v1',
    'resolve_public_booking_context',
    'public_booking_upsert_customer',
    'public_booking_upsert_vehicle',
    'public_booking_book_appointment',
    'public_booking_save_configuration',
    'public_booking_insert_services',
    'public_booking_record_payment_intent_v2',
    'public_booking_set_vehicle_tire_spec_v2'
  )
order by p.proname, arguments
limit 100;
```

## 5. Apply in staging first

Apply the migration to the correct staging project using the exact migration file:

```bash
supabase link --project-ref "$STAGING_PROJECT_REF"
supabase db push --include-all
```

If the migration is being applied through the MCP integration, use `apply_migration` with name `secure_public_booking_rpc_context` and the exact contents of `supabase/migrations/20260827100000_secure_public_booking_rpc_context.sql`. Do not use `execute_sql` for this DDL migration.

Run `supabase/ops/20260827_secure_public_booking_verify.sql`. The verification must show the migration recorded, eight public booking functions, eight hardened search paths, eight `SECURITY DEFINER` functions, revoked browser access to the two legacy mutation functions, and grants for the new public functions.

Run the two-tenant adversarial suite against staging with disposable fixtures. The suite must prove that a tenant A slug cannot read or mutate tenant B appointments, vehicles, services, or payment-intent context; that invalid and disabled slugs fail; and that a repeated booking request remains tenant-bound and idempotency-safe.

## 6. Production change window

Only after staging passes should the production change begin. Freeze concurrent schema changes, confirm the backup/restore point, and confirm that the application deployment contains the matching release commit. Announce the start and record the UTC timestamp.

Run the preflight again against production. Compare the output to staging. If any object differs unexpectedly, stop and investigate.

## 7. Apply production migration

Apply only the migration file, with `ON_ERROR_STOP` and transactional DDL:

```bash
supabase link --project-ref "$PRODUCTION_PROJECT_REF"
supabase db push --include-all
```

Alternatively, call the Supabase migration API with the verified production project reference and the exact migration name/query. Never substitute the project name, Vercel project ID, or an unrelated Supabase reference.

## 8. Verify immediately

Run the post-migration verification SQL. Then run read-only checks for the public function grants and function configuration. Confirm the migration version appears exactly once in `supabase_migrations.schema_migrations`.

Run a production-safe public booking smoke test using a disposable test workspace and a unique test slug. Verify a valid booking succeeds, an invalid slug fails, a cross-tenant appointment/vehicle fails, and no PII from the fixture appears outside the intended workspace. Remove the disposable fixtures after verification.

## 9. Rollback decision

If the migration fails before commit, the transaction must roll back automatically. Do not manually repair partial DDL.

If post-commit verification fails, stop public booking traffic at the application feature flag, preserve evidence, and restore the provider backup/restore point according to the approved change process. The repository rollback SQL is a review aid for privilege restoration, not a substitute for a database restore and must not be executed blindly.

## 10. Closure evidence

Attach the following to the change record: target project reference, backup/restore-point ID, preflight output, exact signature capture, staging verification, adversarial test output, production migration result, post-migration verification, smoke-test output, and final Supabase security-advisor output. Do not include service-role keys, publishable keys, customer PII, or raw payment data.

> Current status: the known connected project `shlnvgqgygapwpzjdrhr` is not eligible for this runbook because it lacks the Service Writer operational schema. A verified Service Writer production project reference is still required before the migration can be executed safely.
