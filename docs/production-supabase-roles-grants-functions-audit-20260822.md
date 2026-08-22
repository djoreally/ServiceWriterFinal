# Production Supabase Roles, Grants, and Function Security Audit

**Project:** `rjfbrfognxqkyhdrpibx`  
**Audit date:** 2026-08-22  
**Method:** Read-only PostgreSQL catalog and privilege inspection through the connected Supabase integration.

## Executive summary

The audit returned **14 database roles**, **24 role memberships**, **500 sampled table-grant rows**, **63 public-schema functions**, and **13 SECURITY DEFINER functions across all schemas**. The catalog query was bounded to protect the session; table grants and functions were capped at 500 and 300 rows respectively.

The most important finding is that the `anon` role currently has extensive direct table privileges on legacy/public tables. These grants do not automatically bypass RLS, but they enlarge the API privilege surface and should be reconciled with the intended policy model. The audit also records security-definer functions for controlled RLS helpers; each should have an explicit search path and narrowly scoped execution grant.

## Role inventory

| Role | Login | Superuser | Create role | Create DB | Bypass RLS | Replication | Connection limit |
|---|---:|---:|---:|---:|---:|---:|---:|
| `anon` | No | No | No | No | No | No | -1 |
| `authenticated` | No | No | No | No | No | No | -1 |
| `authenticator` | Yes | No | No | No | No | No | -1 |
| `dashboard_user` | No | No | Yes | Yes | No | Yes | -1 |
| `postgres` | Yes | No | Yes | Yes | Yes | Yes | -1 |
| `service_role` | No | No | No | No | Yes | No | -1 |
| `supabase_admin` | Yes | Yes | Yes | Yes | Yes | Yes | -1 |
| `supabase_auth_admin` | Yes | No | Yes | No | No | No | -1 |
| `supabase_etl_admin` | Yes | No | No | No | Yes | Yes | -1 |
| `supabase_privileged_role` | No | No | No | No | No | No | -1 |
| `supabase_read_only_user` | Yes | No | No | No | Yes | No | -1 |
| `supabase_realtime_admin` | No | No | No | No | No | No | -1 |
| `supabase_replication_admin` | Yes | No | No | No | No | Yes | -1 |
| `supabase_storage_admin` | Yes | No | Yes | No | No | No | -1 |

Supabase-managed roles such as `supabase_admin`, `postgres`, and `service_role` have elevated operational privileges by design. They must never be used in browser code or exposed through client-side environment variables. The `anon` and `authenticated` roles are non-login roles and do not have superuser, create-role, create-database, replication, or bypass-RLS attributes in this audit.

## Role memberships

| Member | Parent role | Admin option |
|---|---|---:|
| `authenticator` | `anon` | No |
| `authenticator` | `authenticated` | No |
| `authenticator` | `service_role` | No |
| `pg_monitor` | `pg_read_all_settings` | No |
| `pg_monitor` | `pg_read_all_stats` | No |
| `pg_monitor` | `pg_stat_scan_tables` | No |
| `postgres` | `anon` | Yes |
| `postgres` | `authenticated` | Yes |
| `postgres` | `authenticator` | Yes |
| `postgres` | `pg_create_subscription` | Yes |
| `postgres` | `pg_monitor` | Yes |
| `postgres` | `pg_read_all_data` | Yes |
| `postgres` | `pg_signal_backend` | Yes |
| `postgres` | `service_role` | Yes |
| `postgres` | `supabase_privileged_role` | No |
| `supabase_etl_admin` | `pg_monitor` | No |
| `supabase_etl_admin` | `pg_read_all_data` | No |
| `supabase_etl_admin` | `supabase_privileged_role` | No |
| `supabase_read_only_user` | `pg_monitor` | No |
| `supabase_read_only_user` | `pg_read_all_data` | No |
| `supabase_realtime_admin` | `anon` | No |
| `supabase_realtime_admin` | `authenticated` | No |
| `supabase_realtime_admin` | `service_role` | No |
| `supabase_storage_admin` | `authenticator` | No |

## Schema privileges

| Schema | Public usage/create | Anon usage/create | Authenticated usage/create | Service role usage/create |
|---|---|---|---|---|
| `private` | No/No | No/No | Yes/No | No/No |
| `public` | Yes/No | Yes/No | Yes/No | Yes/No |

The `private` schema is intended to be non-API-facing. Its expected posture is no public or anonymous usage, authenticated usage only where compatibility wrappers need it, and no create privilege for client roles.

## Table-grant findings

| Grantee | Sampled grant rows | SELECT | INSERT | UPDATE | DELETE | TRUNCATE |
|---|---:|---:|---:|---:|---:|---:|
| `anon` | 119 | 17 | 17 | 17 | 17 | 17 |
| `authenticated` | 346 | 52 | 52 | 50 | 48 | 48 |
| `service_role` | 35 | 5 | 5 | 5 | 5 | 5 |

### Direct anonymous-grant review

The audit returned direct `anon` grants on **17 distinct public tables** within the capped result. Examples include legacy operational, financial, catalog, profile, work-order, and workspace tables. Because the result is capped, this must be followed by a complete per-table privilege inventory before production is considered hardened.

| Example anonymous table | Privileges observed |
|---|---|
| `audit_events` | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| `filter_catalog` | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| `invoice_lines` | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| `locations` | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| `profiles` | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| `provider_connections` | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| `quote_conversions` | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| `quote_items` | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| `service_catalog` | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| `service_record_line_items` | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| `webhook_events` | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| `work_order_assignments` | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| `work_order_events` | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| `work_order_items` | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| `work_orders` | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| `workspace_members` | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| `workspaces` | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |

## Public API function surface

The catalog returned **63 public-schema functions**, of which **48** have an explicit public or anonymous execution privilege in the sampled result. The public schema is exposed to PostgREST in the application architecture, so every client-executable function should be treated as an API endpoint and reviewed for input validation, tenant scoping, and least-privilege grants.

| Function | Arguments | SECURITY DEFINER | Fixed configuration | Public execute | Anonymous execute | Authenticated execute |
|---|---|---:|---:|---:|---:|---:|
| `citext` | `boolean` | No | No | Yes | Yes | Yes |
| `citext` | `character` | No | No | Yes | Yes | Yes |
| `citext` | `inet` | No | No | Yes | Yes | Yes |
| `citext_cmp` | `citext, citext` | No | No | Yes | Yes | Yes |
| `citext_eq` | `citext, citext` | No | No | Yes | Yes | Yes |
| `citext_ge` | `citext, citext` | No | No | Yes | Yes | Yes |
| `citext_gt` | `citext, citext` | No | No | Yes | Yes | Yes |
| `citext_hash` | `citext` | No | No | Yes | Yes | Yes |
| `citext_hash_extended` | `citext, bigint` | No | No | Yes | Yes | Yes |
| `citext_larger` | `citext, citext` | No | No | Yes | Yes | Yes |
| `citext_le` | `citext, citext` | No | No | Yes | Yes | Yes |
| `citext_lt` | `citext, citext` | No | No | Yes | Yes | Yes |
| `citext_ne` | `citext, citext` | No | No | Yes | Yes | Yes |
| `citext_pattern_cmp` | `citext, citext` | No | No | Yes | Yes | Yes |
| `citext_pattern_ge` | `citext, citext` | No | No | Yes | Yes | Yes |
| `citext_pattern_gt` | `citext, citext` | No | No | Yes | Yes | Yes |
| `citext_pattern_le` | `citext, citext` | No | No | Yes | Yes | Yes |
| `citext_pattern_lt` | `citext, citext` | No | No | Yes | Yes | Yes |
| `citext_smaller` | `citext, citext` | No | No | Yes | Yes | Yes |
| `citextin` | `cstring` | No | No | Yes | Yes | Yes |
| `citextout` | `citext` | No | No | Yes | Yes | Yes |
| `citextrecv` | `internal` | No | No | Yes | Yes | Yes |
| `citextsend` | `citext` | No | No | Yes | Yes | Yes |
| `convert_quote_to_service_record_v1` | `p_workspace_id uuid, p_quote_id uuid, p_idempotency_key text, p_created_by uuid, p_service_date date, p_technician_id uuid, p_appointment_id uuid, p_work_order_id uuid, p_internal_notes text, p_expected_quote_updated_at timestamp with time zone` | No | Yes | Yes | Yes | Yes |
| `get_workforce_identity_v1` | `` | No | Yes | No | No | Yes |
| `handle_new_user` | `` | Yes | Yes | No | No | No |
| `has_crm_capability` | `target_workspace_id uuid, required_capability text` | No | Yes | No | No | Yes |
| `has_workspace_role` | `target_workspace_id uuid, allowed_roles member_role[]` | Yes | Yes | No | No | No |
| `is_assigned_technician` | `target_workspace_id uuid, target_work_order_id uuid` | Yes | Yes | No | No | No |
| `is_customer_for_workspace` | `target_workspace_id uuid, target_customer_id uuid` | No | Yes | No | No | Yes |
| `is_workspace_admin` | `target_workspace_id uuid` | No | Yes | No | No | Yes |
| `is_workspace_member` | `target_workspace_id uuid` | No | Yes | No | No | Yes |
| `is_workspace_staff` | `target_workspace_id uuid` | No | Yes | No | No | Yes |
| `max` | `citext` | No | No | Yes | Yes | Yes |
| `messaging_apply_delivery_event` | `target_provider text, target_provider_message_id text, target_status text, target_occurred_at timestamp with time zone, target_failure_code text, target_failure_reason text` | Yes | Yes | No | No | No |
| `messaging_has_active_suppression` | `target_workspace_id uuid, target_channel text, target_purpose text, target_email citext, target_phone text` | Yes | Yes | No | No | No |
| `min` | `citext` | No | No | Yes | Yes | Yes |
| `regexp_match` | `citext, citext` | No | No | Yes | Yes | Yes |
| `regexp_match` | `citext, citext, text` | No | No | Yes | Yes | Yes |
| `regexp_matches` | `citext, citext` | No | No | Yes | Yes | Yes |
| `regexp_matches` | `citext, citext, text` | No | No | Yes | Yes | Yes |
| `regexp_replace` | `citext, citext, text` | No | No | Yes | Yes | Yes |
| `regexp_replace` | `citext, citext, text, text` | No | No | Yes | Yes | Yes |
| `regexp_split_to_array` | `citext, citext` | No | No | Yes | Yes | Yes |
| `regexp_split_to_array` | `citext, citext, text` | No | No | Yes | Yes | Yes |
| `regexp_split_to_table` | `citext, citext` | No | No | Yes | Yes | Yes |
| `regexp_split_to_table` | `citext, citext, text` | No | No | Yes | Yes | Yes |
| `replace` | `citext, citext, citext` | No | No | Yes | Yes | Yes |
| `select_active_workspace_v1` | `p_owner_user_id uuid, p_role text` | No | Yes | No | No | Yes |
| `set_identity_updated_at` | `` | No | Yes | No | No | No |
| `set_updated_at` | `` | No | Yes | No | No | No |
| `split_part` | `citext, citext, integer` | No | No | Yes | Yes | Yes |
| `strpos` | `citext, citext` | No | No | Yes | Yes | Yes |
| `texticlike` | `citext, citext` | No | No | Yes | Yes | Yes |
| `texticlike` | `citext, text` | No | No | Yes | Yes | Yes |
| `texticnlike` | `citext, citext` | No | No | Yes | Yes | Yes |
| `texticnlike` | `citext, text` | No | No | Yes | Yes | Yes |
| `texticregexeq` | `citext, citext` | No | No | Yes | Yes | Yes |
| `texticregexeq` | `citext, text` | No | No | Yes | Yes | Yes |
| `texticregexne` | `citext, citext` | No | No | Yes | Yes | Yes |
| `texticregexne` | `citext, text` | No | No | Yes | Yes | Yes |
| `touch_service_records_updated_at` | `` | No | Yes | No | No | Yes |
| `translate` | `citext, citext, text` | No | No | Yes | Yes | Yes |

## SECURITY DEFINER functions

The audit returned **13 SECURITY DEFINER functions across all schemas**. **5** are in the exposed `public` schema, and **0** match the follow-up review criteria of public/anonymous execution or missing function configuration. Security-definer functions are not automatically unsafe, but they require an explicit fixed search path, qualified object references, narrow execution grants, and tests against cross-tenant access.

| Schema | Function | Arguments | Public execute | Anonymous execute | Authenticated execute | Configuration |
|---|---|---|---:|---:|---:|---|
| `pgbouncer` | `get_auth` | `p_usename text` | No | No | No | `search_path=""` |
| `private` | `has_crm_capability` | `target_workspace_id uuid, required_capability text` | No | No | Yes | `search_path=public, pg_temp` |
| `private` | `is_customer_for_workspace` | `target_workspace_id uuid, target_customer_id uuid` | No | No | Yes | `search_path=pg_catalog, public, pg_temp` |
| `private` | `is_workspace_admin` | `target_workspace_id uuid` | No | No | Yes | `search_path=pg_catalog, public, pg_temp` |
| `private` | `is_workspace_member` | `target_workspace_id uuid` | No | No | Yes | `search_path=pg_catalog, public, pg_temp` |
| `private` | `is_workspace_staff` | `target_workspace_id uuid` | No | No | Yes | `search_path=pg_catalog, public, pg_temp` |
| `public` | `handle_new_user` | `` | No | No | No | `search_path=public` |
| `public` | `has_workspace_role` | `target_workspace_id uuid, allowed_roles member_role[]` | No | No | No | `search_path=public` |
| `public` | `is_assigned_technician` | `target_workspace_id uuid, target_work_order_id uuid` | No | No | No | `search_path=public` |
| `public` | `messaging_apply_delivery_event` | `target_provider text, target_provider_message_id text, target_status text, target_occurred_at timestamp with time zone, target_failure_code text, target_failure_reason text` | No | No | No | `search_path=public` |
| `public` | `messaging_has_active_suppression` | `target_workspace_id uuid, target_channel text, target_purpose text, target_email citext, target_phone text` | No | No | No | `search_path=public` |
| `vault` | `create_secret` | `new_secret text, new_name text, new_description text, new_key_id uuid` | No | No | No | `search_path=""` |
| `vault` | `update_secret` | `secret_id uuid, new_secret text, new_name text, new_description text, new_key_id uuid` | No | No | No | `search_path=""` |

## Recommended remediation order

First, reconcile direct `anon` table grants against the public-booking contract. Keep only the exact tables and operations required for intentionally anonymous booking flows, and revoke legacy broad grants after confirming all public workflows use the secure API bridge. Second, inventory every public executable function and classify it as browser-safe, server-only, trigger-only, or obsolete. Third, keep RLS helper implementations in the private schema with fixed search paths and expose only invoker wrappers or server-only calls. Fourth, run authenticated owner, manager, dispatcher, technician, viewer, and customer cross-workspace tests after each grant change.

## Limitations

This is a production catalog audit, not a proof that every data path is safe. RLS policy expressions, PostgREST exposed schemas, Edge Function authentication, application API authorization, and service-role usage require separate reviews. The table-grant and function sections were intentionally bounded; a follow-up complete inventory should paginate by table/function when making revocation decisions.

## References

- [Supabase database linter documentation](https://supabase.com/docs/guides/database/database-linter)
- [PostgreSQL privileges documentation](https://www.postgresql.org/docs/current/ddl-priv.html)
