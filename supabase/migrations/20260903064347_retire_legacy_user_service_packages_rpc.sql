-- Retire the obsolete user-scoped package seeding RPC.
-- Service packages are workspace-owned; the active application uses
-- populate_workspace_service_packages(uuid), which enforces workspace membership
-- and copies canonical template pricing into public.service_packages.
drop function if exists public.populate_user_service_packages(uuid);
