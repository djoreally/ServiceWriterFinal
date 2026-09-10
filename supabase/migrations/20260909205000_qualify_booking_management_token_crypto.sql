begin;

create or replace function public.ensure_appointment_management_token_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.source = 'public_booking'
     and nullif(new.metadata ->> 'management_token','') is null then
    new.metadata := coalesce(new.metadata,'{}'::jsonb)
      || pg_catalog.jsonb_build_object(
        'management_token',
        pg_catalog.encode(extensions.gen_random_bytes(24),'hex')
      );
  end if;
  return new;
end;
$function$;

revoke execute on function public.ensure_appointment_management_token_v1()
  from public, anon, authenticated;

commit;
