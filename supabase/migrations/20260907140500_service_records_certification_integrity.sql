-- Service Records white-box certification integrity hardening.
-- Enforce workspace-safe source references, canonical technician membership,
-- completed-record timestamps, and canonical financial arithmetic.

alter table public.service_records drop constraint if exists service_records_appointment_id_fkey;
alter table public.service_records add constraint service_records_workspace_appointment_fk
  foreign key (workspace_id, appointment_id)
  references public.appointments(workspace_id, id)
  on delete restrict;

alter table public.service_records drop constraint if exists service_records_work_order_id_fkey;
alter table public.service_records add constraint service_records_workspace_work_order_fk
  foreign key (workspace_id, work_order_id)
  references public.work_orders(workspace_id, id)
  on delete set null;

alter table public.service_records add constraint service_records_workspace_technician_fk
  foreign key (workspace_id, technician_id)
  references public.workspace_members(workspace_id, user_id)
  on delete set null;

alter table public.service_records add constraint service_records_completed_requires_timestamp
  check (status <> 'completed' or completed_at is not null);

alter table public.service_records add constraint service_records_financial_math
  check (
    total_amount is null
    or subtotal is null
    or abs(
      total_amount
      - greatest(subtotal - coalesce(discount_amount, 0) + coalesce(tax_amount, 0), 0)
    ) <= 0.01
  );

create index if not exists service_records_workspace_technician_idx
  on public.service_records(workspace_id, technician_id)
  where technician_id is not null;
