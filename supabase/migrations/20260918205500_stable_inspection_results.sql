-- Preserve inspection finding identity across retries and prevent duplicate recommendation creation.
create unique index if not exists inspection_results_inspection_sort_uidx
  on public.inspection_results(workspace_id,inspection_id,sort_order);

create unique index if not exists service_recommendations_finding_service_uidx
  on public.service_recommendations(workspace_id,inspection_result_id,service_catalog_id);
