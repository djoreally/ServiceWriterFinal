-- RLS policies across Fleet, expenses, inventory, vendors, and CRM call this
-- helper while executing as authenticated users. Revoking EXECUTE from
-- authenticated caused those policies themselves to fail with 42501.
grant execute on function public.has_workspace_role(uuid, public.member_role[]) to authenticated;
