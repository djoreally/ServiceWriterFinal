-- Work Orders RLS evaluates this security-definer function for authenticated reads.
grant execute on function public.is_assigned_technician(uuid, uuid) to authenticated;
