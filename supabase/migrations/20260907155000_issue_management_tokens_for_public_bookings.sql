begin;
create or replace function public.ensure_appointment_management_token_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.source = 'public_booking' and nullif(new.metadata ->> 'management_token','') is null then
    new.metadata := coalesce(new.metadata,'{}'::jsonb) || jsonb_build_object('management_token', encode(gen_random_bytes(24),'hex'));
  end if;
  return new;
end;
$function$;
drop trigger if exists appointments_ensure_management_token on public.appointments;
create trigger appointments_ensure_management_token before insert on public.appointments for each row execute function public.ensure_appointment_management_token_v1();
update public.appointments set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('management_token',encode(gen_random_bytes(24),'hex')) where source='public_booking' and status in ('requested','confirmed') and starts_at>now() and nullif(metadata->>'management_token','') is null;
commit;
