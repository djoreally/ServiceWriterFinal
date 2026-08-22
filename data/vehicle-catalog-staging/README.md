# Consolidated Vehicle Catalog Staging Package

This directory contains a **staging-only** consolidation of the uploaded vehicle and oil/filter sources. It is not a production database migration and must not be loaded into Supabase without a reviewed import job, row-level validation, and rollback evidence.

## Outputs

| File | Purpose |
|---|---|
| `vehicle_catalog_canonical.csv` | Full normalized and deduplicated record set with provenance, conflict status, verification status, and missing-field classification. |
| `vehicle_catalog_conflicts.csv` | Field-level conflicts where multiple sources supplied different non-empty values for the same normalized vehicle key. |
| `vehicle_catalog_consolidation_summary.json` | Source counts, output counts, coverage, and sanitization rules. |
| `vehicle_specifications_import_all.csv` | Full mapping to the current `public.vehicle_specifications` shape, including review records. |
| `vehicle_specifications_import_eligible_verified.csv` | Default import candidate set containing records classified as complete/verified by the supplied source-status evidence. |
| `vehicle_specifications_manual_review.csv` | Records with explicit unverified status or missing core oil fields. |
| `vehicle_spec_import_report.json` | Import mapping and safety policy. |

## Merge and safety rules

Records are keyed conservatively by normalized `year|make|model|engine`. Unicode is normalized, control characters are removed, whitespace is collapsed, and invalid years or blank vehicle keys are rejected. Non-empty values are coalesced only when they share the same normalized key. No neighboring model-year inference, guessed filter number, guessed oil capacity, or silent conflict overwrite is performed.

The full oil/filter workbook has the highest field-level precedence, followed by the release audit workbook, the autolube workbook, the year/make/model JSON, the vehicle-list CSV, and the 2025 CSV. This precedence controls which value is selected when the same field is available from multiple supplied sources; every detected conflict remains in `vehicle_catalog_conflicts.csv` for review.

Unavailable placeholders such as `N/A`, `Unverified`, `Unknown`, and `Not Available` are converted to null specification values. Alternative filter references are preserved in `additional_specs` rather than discarded. The current database table has one `oil_filter` column, so WIX is mapped to `oil_filter`; NAPA Gold and STP remain in the JSON provenance payload until a dedicated cross-reference schema is approved.

## Important verification distinction

The `verified` classification means that the core fields are complete and the supplied source-status evidence does not explicitly mark the record unverified. It is **not** a substitute for independent OEM/provider verification. Records marked `unverified` or `incomplete` must remain out of the default production import until an authoritative source validates them.

## Current package result

The current run produced 16,704 canonical records from 59,945 validated source rows, removing 43,241 duplicate source rows. It produced 15,195 default import candidates, 193 explicitly unverified records, and 1,316 incomplete records. There are 12,366 field-level conflict cells, overwhelmingly oil-capacity conflicts, which require a review policy before using those fields for technician guidance or billing.

The package spans model years 1999–2027. The source files include 2027 records, but the current customer booking UI must be updated to expose and validate 2027 before those records are considered launch-ready.
