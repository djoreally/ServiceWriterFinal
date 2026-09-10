-- Private receipt storage for canonical workspace-scoped expenses.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','application/pdf']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Object key contract: <workspace_id>/<user_id>/<uuid>-<filename>
drop policy if exists receipts_select_workspace_member on storage.objects;
create policy receipts_select_workspace_member on storage.objects
for select to authenticated
using (
  bucket_id = 'receipts'
  and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and public.is_workspace_member(split_part(name, '/', 1)::uuid)
);

drop policy if exists receipts_insert_workspace_self on storage.objects;
create policy receipts_insert_workspace_self on storage.objects
for insert to authenticated
with check (
  bucket_id = 'receipts'
  and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and public.is_workspace_member(split_part(name, '/', 1)::uuid)
  and split_part(name, '/', 2)::uuid = (select auth.uid())
);

drop policy if exists receipts_delete_uploader_or_finance on storage.objects;
create policy receipts_delete_uploader_or_finance on storage.objects
for delete to authenticated
using (
  bucket_id = 'receipts'
  and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and (
    split_part(name, '/', 2)::uuid = (select auth.uid())
    or public.has_workspace_role(
      split_part(name, '/', 1)::uuid,
      array['owner','admin','manager','service_advisor']::public.member_role[]
    )
  )
);