# Lovable Export Request and Import Guidance

## Review of the uploaded export

The uploaded file is a useful **data export**, but it is not yet a complete migration package for the new multi-tenant Service Writer platform.

| Area | Current export | Import implication |
|---|---:|---|
| Export version | 1.1 | Preserve as source metadata and create a new normalized import version. |
| Business profiles | 1 | Can map to the MOMS workspace, but the workspace ID is absent. |
| Customers | 685 | Contains PII and requires deduplication, normalization, and workspace assignment. |
| Vehicles | 303 | Has customer links, VIN/license-plate PII, and requires duplicate resolution. |
| Appointments | 299 | Has customer and vehicle links, but lacks an explicit workspace ID. |
| Services | 254 | Must be mapped to the canonical service-record model rather than copied blindly into the legacy `services` table. |
| Payment records | 102 | Requires reconciliation with the canonical `payments` model and financial integrity checks. |
| Invoices | 14 | Requires header and line-item reconciliation. |
| Invoice line items | 85 | Must be imported after invoice ID mapping. |
| Appointment services | 177 | Must be imported after appointment and service-catalog ID mapping. |
| Service catalog | 16 | Requires catalog deduplication and price/tax review. |
| Expenses | 48 | Requires category mapping and financial review. |
| Technicians | 1 | Requires identity and workspace-membership mapping. |
| User roles | 1 | Must not be trusted as authoritative; map through the new invitation/membership model. |
| Email settings, recurring services, marketing campaigns | Empty | Ask Lovable to export schemas and explicit empty-state metadata, not just omit them. |
| Workspace IDs | Absent | Critical gap for strict tenant isolation. |
| Secrets | None detected in the uploaded JSON | Keep it that way; never request passwords, service-role keys, OAuth refresh tokens, or payment secrets in the export. |

The file contains direct customer names, email addresses, phone numbers, addresses, vehicle identifiers, and payment-related records. Treat it as restricted PII and do not commit it to Git or paste it into an external prompt.

## Exact prompt to give Lovable

Copy the following prompt into Lovable:

> Generate a complete, lossless migration export for my application so it can be imported into a different multi-tenant Service Writer platform. Do not export screenshots, rendered UI, or a partial sample. Export the complete database-backed application state and schema metadata in a machine-readable package.
>
> Create one ZIP package containing:
>
> 1. `manifest.json` with `export_version`, `source_project_id` as a non-secret identifier, `source_environment`, `exported_at`, schema version, row counts per entity, checksums for every file, and a complete list of included and intentionally empty entities.
> 2. `schema.json` containing every application table, column name, data type, nullable status, default expression, primary key, unique constraint, foreign key, indexes, enum values, check constraints, triggers, and view definition. Include tables that currently have zero rows.
> 3. One JSONL or CSV file per entity with all rows, preserving original IDs, foreign keys, created timestamps, updated timestamps, soft-delete/status fields, ordering fields, and audit metadata. Do not truncate long text, notes, descriptions, addresses, or JSON fields.
> 4. A `relationships.json` file describing every foreign-key and logical relationship, including source table/column, target table/column, cardinality, nullable behavior, and whether the relationship is required for import ordering.
> 5. A `settings.json` file containing every business, booking, scheduling, tax, currency, timezone, notification, email, SMS, payment, catalog, dispatch, technician, customer portal, loyalty, CRM, and feature-flag setting. Include settings that are currently unset as explicit null or empty values with their schema and descriptions.
> 6. A `workspace-map.json` file identifying each business/workspace, source owner, source user IDs, memberships, roles, technicians, dispatchers, managers, and customers. Include the source workspace/business key on every tenant-owned record. If the source system has no workspace ID, create a deterministic `source_workspace_key` and include it on every exported row.
> 7. A `user-identity-map.json` file containing user IDs, emails, profile metadata, role assignments, and membership status, but never passwords, password hashes, access tokens, refresh tokens, service-role keys, OAuth client secrets, webhook secrets, Stripe secrets, or API keys.
> 8. A `media-index.json` file listing every uploaded logo, image, document, attachment, invoice PDF, and customer/vehicle media item with source path, MIME type, size, checksum, owning entity, and a separate media archive. Do not embed binary data in the main JSON export.
> 9. A `financial-reconciliation.json` file containing invoice totals, line-item totals, payment totals, refunds, taxes, fees, outstanding balances, and a reconciliation result for every invoice and appointment. Flag mismatches instead of silently correcting them.
> 10. A `migration-notes.md` file documenting source-to-target table mappings, unsupported features, deprecated fields, enum mappings, timezone assumptions, currency assumptions, null/default behavior, ID preservation strategy, and an ordered import plan.
> 11. A `validation-report.json` file with row counts, duplicate candidates, orphan foreign keys, invalid emails, invalid phone numbers, malformed VINs/license plates, missing required values, impossible dates, negative or inconsistent financial amounts, and records requiring manual review.
> 12. A `sample-import.ndjson` file containing no more than five sanitized examples per entity so the destination team can test the importer without exposing production PII.
>
> Preserve source IDs in dedicated `source_id` fields even if the destination generates new UUIDs. Never rewrite relationships by matching on names alone. Include a deterministic source-to-target ID map for every imported entity. Make the export repeatable and checksum-verifiable. Do not include secrets or credentials. Before finishing, print a concise export summary listing all entities, row counts, empty entities, missing relationships, flagged records, and files created.

## Additional fields specifically needed for this platform

Ask Lovable to add these fields to every tenant-owned record if they exist in the source system, or to provide a deterministic mapping file if they do not:

- `source_system`.
- `source_project_id`.
- `source_workspace_key`.
- `source_record_id`.
- `source_created_at` and `source_updated_at`.
- `workspace_id` mapping.
- `import_batch_id`.
- `import_status`.
- `import_error`.
- `deduplication_key`.
- `deleted_at` or archived status.

For this application, the most important additional exports are **workspace and membership mappings, complete settings, media references, invoice/payment reconciliation, appointment-service relationships, and explicit empty schemas** for email settings, recurring services, and marketing campaigns.

## Import rules for the new platform

The importer should load the package into quarantine or review state first. It should validate checksums, create the workspace mapping, preserve source IDs, deduplicate customers and vehicles, import parent entities before children, reconcile financial totals, and produce a dry-run report before making live writes. No record should be silently discarded; ambiguous matches should be flagged for review.

## Credit-efficient Lovable usage

Use one Lovable credit for the export-generation prompt above. If the first result is incomplete, use a second credit only to ask Lovable to compare the export against the checklist and regenerate missing schema, settings, workspace, relationship, media, and reconciliation files. Do not spend credits asking for UI screenshots or a visual clone; those do not improve migration fidelity.
