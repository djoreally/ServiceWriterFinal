# Vehicle Catalog Backup Import Evidence

**Date:** 2026-08-22 UTC  
**Author:** djoreally@gmail.com  
**Scope:** Verified vehicle-specification catalog backup and validation

## Environment boundary

The canonical production Supabase project is `rjfbrfognxqkyhdrpibx` (`https://rjfbrfognxqkyhdrpibx.supabase.co`). The backup and validation Supabase project is `ynegwrgbmszrpmuvafjj` (`https://ynegwrgbmszrpmuvafjj.supabase.co`), named **ServiceWriterFinalstaging and backup**. No writes were made to the production project during this operation.

The backup project was active and healthy. Before the migration it had no public tables. A protected `public.vehicle_specifications` table was then created in the backup project with a text primary key, a unique `merge_key`, year-range validation, verified-status validation, provenance fields, and row-level security enabled. Anonymous and authenticated table privileges were revoked; this backup catalog is not exposed as an application-readable public table by default.

## Source package

The source file was `data/vehicle-catalog-staging/vehicle_specifications_import_eligible_verified.csv`. The local package validator passed with the following results:

| Check | Result |
|---|---:|
| Canonical source rows | 16,704 |
| Verified import rows | 15,195 |
| Manual-review rows excluded | 1,509 |
| Year range | 1999–2027 |
| Duplicate merge keys in source | 0 |
| Control characters | 0 |
| Package validation | PASS |

The import used the existing normalized key format `year|make|model|engine`. No values were inferred from neighboring years or guessed during this operation. The prepared mappings were preserved: `wix_filter` to `oil_filter`, the selected transmission-fluid field to `transmission_fluid`, and the remaining source details in `additional_specs` JSONB.

## Import method

The import was performed as an idempotent `INSERT ... ON CONFLICT (merge_key) DO UPDATE` operation against the backup project. The connector payload was split into sixteen batches, with the final batch containing the remainder after twelve-month-sized 1,000-row batches. A blank `missing_fields` value was normalized to an empty string after the first attempt exposed a not-null violation; the failed batch was retried with the corrected payload. Previously successful batches were safe to replay because the import is keyed by the unique normalized merge key.

## Database validation

The post-import validation query returned the following results from the backup project:

| Validation | Result | Expected |
|---|---:|---:|
| Rows in `public.vehicle_specifications` | 15,195 | 15,195 |
| Distinct `merge_key` values | 15,195 | 15,195 |
| Duplicate merge keys | 0 | 0 |
| Null required fields | 0 | 0 |
| Rows with `verification_status = 'verified'` | 15,195 | 15,195 |
| Minimum year | 1999 | 1999 |
| Maximum year | 2027 | 2027 |
| Representative lookup `1999|acura|16el|16` | 1 | 1 |

The backup catalog therefore passed row-count, uniqueness, required-field, status, year-range, and representative lookup checks.

## Important backup limitation

This project is currently a **vehicle-catalog backup and validation copy**, not yet a complete point-in-time clone of the production application. The Supabase Auth users, tenant memberships, customer records, operational transactions, secrets, storage objects, and production configuration remain separate. A complete disaster-recovery backup requires a controlled schema migration/data export plan, encrypted storage, restore testing, and explicit handling of Auth and Storage assets. The current evidence proves the vehicle catalog copy only.

## Controlled production gate

Production remains unchanged. Before loading this catalog into production, the team should approve the target production table and access model, generate/apply the corresponding production DDL, run a production preflight backup, perform the same idempotent import, regenerate application types, run integration and lookup tests, and record the resulting production row-count evidence. The backup project should be retained as the rollback/reference copy until those checks pass.
