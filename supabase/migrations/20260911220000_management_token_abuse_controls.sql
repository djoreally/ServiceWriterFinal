-- Shot 21: replay and malformed-token controls for public appointment links.
begin;

alter table public.appointment_management_tokens
  add constraint appointment_management_tokens_digest_format_check
  check (token_digest ~ '^[0-9a-f]{64}$') not valid;

alter table public.appointment_management_tokens
  validate constraint appointment_management_tokens_digest_format_check;

alter table public.appointment_management_tokens
  add constraint appointment_management_tokens_use_count_check
  check (use_count between 0 and 10) not valid;

alter table public.appointment_management_tokens
  validate constraint appointment_management_tokens_use_count_check;

alter table public.appointment_management_tokens
  add constraint appointment_management_tokens_expiry_order_check
  check (expires_at is null or expires_at > issued_at) not valid;

alter table public.appointment_management_tokens
  validate constraint appointment_management_tokens_expiry_order_check;

comment on column public.appointment_management_tokens.use_count is
  'Successful bearer-link uses. Database constraint caps reuse at 10; exceeding the cap aborts the entire management transaction.';

commit;
