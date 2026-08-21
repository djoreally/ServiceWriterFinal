begin;
alter table public.quote_items enable row level security;
drop policy if exists quote_items_member_select on public.quote_items;
create policy quote_items_member_select on public.quote_items for select to authenticated using (exists (select 1 from public.workspace_members wm where wm.workspace_id = quote_items.workspace_id and wm.user_id = auth.uid() and wm.is_active));
drop policy if exists quote_items_operator_write on public.quote_items;
create policy quote_items_operator_write on public.quote_items for all to authenticated using (exists (select 1 from public.workspace_members wm where wm.workspace_id = quote_items.workspace_id and wm.user_id = auth.uid() and wm.is_active and wm.role::text = any (array['owner','admin','manager','service_advisor']))) with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = quote_items.workspace_id and wm.user_id = auth.uid() and wm.is_active and wm.role::text = any (array['owner','admin','manager','service_advisor']))));
commit;
