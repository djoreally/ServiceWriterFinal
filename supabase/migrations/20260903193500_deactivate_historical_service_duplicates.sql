-- Preserve restored service history without allowing duplicate active catalog choices.
-- When a workspace has both a restored historical row and a current active row
-- with the same normalized name, the current row remains active.
update public.service_catalog historical
set is_active = false,
    updated_at = now(),
    metadata = coalesce(historical.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'deactivated_reason', 'duplicate_historical_catalog_row',
        'deactivated_at', now()
      )
where historical.is_active
  and historical.metadata ? 'historical_source'
  and exists (
    select 1
    from public.service_catalog current
    where current.workspace_id = historical.workspace_id
      and current.id <> historical.id
      and current.is_active
      and lower(trim(current.name)) = lower(trim(historical.name))
      and not (current.metadata ? 'historical_source')
  );
