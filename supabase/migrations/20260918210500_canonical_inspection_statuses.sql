-- Canonical inspection finding vocabulary used by technician UX and recommendation automation.
alter table public.inspection_results drop constraint if exists inspection_results_status_check;

update public.inspection_results set status='good' where status='pass';
update public.inspection_results set status='attention' where status='warning';
update public.inspection_results set status='urgent' where status='fail';

alter table public.inspection_results
  add constraint inspection_results_status_check
  check (status in ('good','attention','urgent','not_applicable','not_checked'));
