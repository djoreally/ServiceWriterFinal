-- Tighten canonical expense write authorization.
-- Applies after 20260908024500_canonical_expense_ledger.sql.

-- Non-finance members may only create pending submissions for themselves.
drop policy if exists expenses_insert_member on public.expenses;
create policy expenses_insert_member on public.expenses
  for insert to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and coalesce(submitted_by_user_id, auth.uid()) = auth.uid()
    and coalesce(created_by, auth.uid()) = auth.uid()
    and (
      status = 'pending'
      or public.has_workspace_role(
        workspace_id,
        array['owner','admin','manager','service_advisor']::public.member_role[]
      )
    )
  );

-- Line-item writes must follow the parent expense authorization boundary.
drop policy if exists expense_line_items_insert_member on public.expense_line_items;
create policy expense_line_items_insert_member on public.expense_line_items
  for insert to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and exists (
      select 1
      from public.expenses e
      where e.workspace_id = expense_line_items.workspace_id
        and e.id = expense_line_items.expense_id
        and e.deleted_at is null
        and (
          public.has_workspace_role(
            e.workspace_id,
            array['owner','admin','manager','service_advisor']::public.member_role[]
          )
          or (e.submitted_by_user_id = auth.uid() and e.status = 'pending')
        )
    )
  );

drop policy if exists expense_line_items_update_member on public.expense_line_items;
create policy expense_line_items_update_member on public.expense_line_items
  for update to authenticated
  using (
    exists (
      select 1
      from public.expenses e
      where e.workspace_id = expense_line_items.workspace_id
        and e.id = expense_line_items.expense_id
        and e.deleted_at is null
        and (
          public.has_workspace_role(
            e.workspace_id,
            array['owner','admin','manager','service_advisor']::public.member_role[]
          )
          or (e.submitted_by_user_id = auth.uid() and e.status = 'pending')
        )
    )
  )
  with check (
    exists (
      select 1
      from public.expenses e
      where e.workspace_id = expense_line_items.workspace_id
        and e.id = expense_line_items.expense_id
        and e.deleted_at is null
        and (
          public.has_workspace_role(
            e.workspace_id,
            array['owner','admin','manager','service_advisor']::public.member_role[]
          )
          or (e.submitted_by_user_id = auth.uid() and e.status = 'pending')
        )
    )
  );

drop policy if exists expense_line_items_delete_member on public.expense_line_items;
create policy expense_line_items_delete_member on public.expense_line_items
  for delete to authenticated
  using (
    exists (
      select 1
      from public.expenses e
      where e.workspace_id = expense_line_items.workspace_id
        and e.id = expense_line_items.expense_id
        and e.deleted_at is null
        and (
          public.has_workspace_role(
            e.workspace_id,
            array['owner','admin','manager','service_advisor']::public.member_role[]
          )
          or (e.submitted_by_user_id = auth.uid() and e.status = 'pending')
        )
    )
  );