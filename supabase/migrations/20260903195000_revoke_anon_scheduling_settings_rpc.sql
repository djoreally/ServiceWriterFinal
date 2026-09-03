-- Defense in depth: the scheduling settings mutation is authenticated-only.
revoke all on function public.update_workspace_scheduling_settings_v1(uuid,jsonb,integer,integer,integer,integer,boolean,integer,boolean,integer,boolean,boolean,integer,text,boolean) from anon;
revoke all on function public.update_workspace_scheduling_settings_v1(uuid,jsonb,integer,integer,integer,integer,boolean,integer,boolean,integer,boolean,boolean,integer,text,boolean) from public;
grant execute on function public.update_workspace_scheduling_settings_v1(uuid,jsonb,integer,integer,integer,integer,boolean,integer,boolean,integer,boolean,boolean,integer,text,boolean) to authenticated, service_role;
