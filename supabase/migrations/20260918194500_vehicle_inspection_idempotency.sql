-- Make required appointment inspections idempotent per vehicle/template.
-- A retry or double-submit updates the same logical inspection instead of creating a second completion.
create unique index if not exists service_inspections_appointment_vehicle_template_uidx
  on public.service_inspections(workspace_id,appointment_id,vehicle_id,template_id)
  where appointment_id is not null and vehicle_id is not null and template_id is not null
    and status <> 'cancelled';
