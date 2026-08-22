-- Keep workforce identity resolution authenticated-only.
revoke execute on function public.get_workforce_identity_v1() from public;
revoke execute on function public.get_workforce_identity_v1() from anon;
grant execute on function public.get_workforce_identity_v1() to authenticated;
