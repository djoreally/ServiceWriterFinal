# Service Writer Golden Route Recovery Manifest — 2026-09-18

Recovery branch: `recovery/golden-route-20260918`
Baseline main: `31c79cc08ef2a7644ff76a3dcee852598eedc909`
Production Supabase: `rjfbrfognxqkyhdrpibx`

## Invariants

- Non-fleet `Appointment` is the work order.
- Fleet alone uses the separate `work_orders` domain.
- No production database mutations are permitted during reconciliation.
- Every recoverable application/repository section is committed and pushed before extended verification.
- Vehicle attribution must survive inspection, recommendation, authorization, added service, completion, invoice and payment.

## Production migrations present but absent from baseline repository

- `20260918002613 service_recommendation_integrity_20260918`
- `20260918003033 recommendation_authorization_lifecycle_20260918`
- `20260918005343 reconcile_appointment_closeout_prepaid_and_vehicle_lines`
- `20260918005446 harden_service_recommendation_grants_20260918`

These are evidence of surviving production work. Do not recreate them from memory or invent replacement migration history. Reconcile final production contracts read-only first.

## Verified live contracts

`service_recommendations` is vehicle-scoped and linked to `appointment_items` through `appointment_item_id`.

Live triggers include:
- `validate_service_recommendation_scope`
- `service_recommendation_lifecycle`
- `enforce_appointment_recommendation_resolution`
- `trg_enforce_appointment_inspection_completion_v1`

`decide_service_recommendation_v1` authorizes approved work into canonical non-fleet `appointment_items` and preserves `vehicle_id`, `recommendation_id`, `inspection_id`, and `inspection_result_id` in item metadata.

Lifecycle events:
- recommendation insert → `technician_and_live_service_sequence.additional_work_recommended`
- approved/declined transition → `technician_and_live_service_sequence.authorization_received`

## Current repository observations

- `inspection-performer.command.ts` preserves findings and only creates a sellable recommendation when a real `service_catalog_id` is selected.
- `service-recommendation.command.ts` still uses `supabase as any`; generated database types must be reconciled before GREEN.
- Repository migration `20260917233000_vehicle_scoped_service_recommendations.sql` respects the appointment-as-work-order invariant.
- Later production integrity/lifecycle/closeout/grant migrations are not present on the baseline branch.

## Recovery sequence

1. Capture live final contracts read-only.
2. Reconstruct missing repository representation without changing production.
3. Reconcile generated Supabase types and application commands.
4. Verify Start Job → inspection → finding → recommendation → decision → appointment item.
5. Verify single-vehicle isolation.
6. Verify two-vehicle isolation.
7. Verify completion gate, invoice/prepaid reconciliation and payment attribution.
8. Run TypeScript, lint, tests, Codeac/CodeRabbit and branch deployment checks.
9. Only after full reconciliation may the lead merge to main.
