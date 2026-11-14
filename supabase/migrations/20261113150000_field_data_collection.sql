-- Field Data Collection — Phase 1 (SW-137 / SW-138).
--
-- Ty's law (2026-11-13): data collected from the field is NEVER
-- automatically added to anything shared. A submission lands in this
-- quarantine, helps the submitting workspace immediately through the
-- learned tier (vehicle_service_specs, blanks only, provenance in
-- that row's metadata), and reaches the shared catalog / Quick Lube
-- Data only through the later verification phases — which read from
-- here, never the other way around. No read path exists from these
-- tables into any catalog composition.
--
-- field_data_submissions: one row per claimed value for one vehicle
-- application (vin and/or workspace vehicle + year/make/model/engine
-- as resolved at submit time). Status machine:
--   submitted -> corroborated -> verified -> promoted
--   submitted|corroborated -> rejected ; any -> superseded
-- Phase 1 writes only 'submitted' (capture + owner retraction to
-- 'superseded'); the later states are the verification phases' to move.
--
-- field_data_corroborations: one row per INDEPENDENT workspace that
-- agrees with a submission's claim. Corroboration counts distinct
-- workspaces only — a workspace's repeats are one voice. Rows are
-- written exclusively by record_field_submission_corroborations(),
-- a SECURITY DEFINER function: matching across workspaces happens
-- inside the database so that no client, not even server route code
-- running on a user's token, ever reads another workspace's raw
-- submissions. Counts are all that come back out.

create table if not exists public.field_data_submissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  submitted_by uuid not null references auth.users(id),
  submitted_by_role text,
  vin text,
  vehicle_id uuid,
  year int,
  make text,
  model text,
  engine text,
  field text not null,
  value_as_stated text not null,
  value_normalized text not null,
  source_surface text not null,
  source_job_id uuid,
  photo_ref text,
  note text,
  status text not null default 'submitted'
    check (status in ('submitted', 'corroborated', 'verified', 'promoted', 'rejected', 'superseded')),
  corroboration_count int not null default 0,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  verification_note text,
  promoted_target text,
  promoted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.field_data_submissions is
  'Field Data Collection quarantine (SW-137): user-submitted spec/part values, never auto-added to any shared catalog. Own-workspace value flows through vehicle_service_specs blanks-only write-through with metadata.field_provenance; sharing happens only via the verification phases.';

-- Workspace-vehicle link, same composite shape as vehicle_service_specs:
-- a submission tied to a workspace vehicle dies with that vehicle.
alter table public.field_data_submissions
  drop constraint if exists field_data_submissions_workspace_vehicle_fk;
alter table public.field_data_submissions
  add constraint field_data_submissions_workspace_vehicle_fk
  foreign key (workspace_id, vehicle_id)
  references public.vehicles(workspace_id, id) on delete cascade;

create index if not exists field_data_submissions_workspace_created_idx
  on public.field_data_submissions (workspace_id, created_at desc);
create index if not exists field_data_submissions_vehicle_idx
  on public.field_data_submissions (workspace_id, vehicle_id)
  where vehicle_id is not null;
-- The corroboration matcher's lookup shape: same application + field
-- + normalized value, across workspaces.
create index if not exists field_data_submissions_match_idx
  on public.field_data_submissions (year, lower(make), lower(model), field, value_normalized)
  where status in ('submitted', 'corroborated', 'verified', 'promoted');

create table if not exists public.field_data_corroborations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.field_data_submissions(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  value_normalized text not null,
  created_at timestamptz not null default now(),
  constraint field_data_corroborations_submission_workspace_unique
    unique (submission_id, workspace_id)
);

comment on table public.field_data_corroborations is
  'One row per distinct workspace agreeing with a field_data_submissions claim. Written only by record_field_submission_corroborations(); the row names the AGREEING workspace, never exposes the underlying submission to it.';

create index if not exists field_data_corroborations_submission_idx
  on public.field_data_corroborations (submission_id);

alter table public.field_data_submissions enable row level security;
alter table public.field_data_corroborations enable row level security;

-- Submissions: a workspace's staff see and manage ONLY their own
-- workspace's submissions. Cross-workspace agreement is counted by
-- the definer function below, never by reading across.
drop policy if exists field_data_submissions_staff_all on public.field_data_submissions;
create policy field_data_submissions_staff_all on public.field_data_submissions
  for all to authenticated
  using (public.is_workspace_staff(workspace_id))
  with check (public.is_workspace_staff(workspace_id));

-- Corroborations: readable by the agreeing workspace's staff and by
-- the staff of the workspace that owns the submission (so a shop can
-- see how much agreement its own claims carry). No direct client
-- writes at all — the definer function is the only writer.
drop policy if exists field_data_corroborations_select on public.field_data_corroborations;
create policy field_data_corroborations_select on public.field_data_corroborations
  for select to authenticated
  using (
    public.is_workspace_staff(workspace_id)
    or exists (
      select 1 from public.field_data_submissions s
      where s.id = field_data_corroborations.submission_id
        and public.is_workspace_staff(s.workspace_id)
    )
  );

drop trigger if exists field_data_submissions_set_updated_at on public.field_data_submissions;
create trigger field_data_submissions_set_updated_at
  before update on public.field_data_submissions
  for each row execute function public.set_updated_at();

-- Corroboration matcher. Given a fresh submission, find the ACTIVE
-- submissions from OTHER workspaces claiming the same normalized
-- value for the same application + field (engines match when both
-- sides state one and they agree; a blank engine on either side does
-- not block the match — field vehicles often lack a settled engine),
-- record the agreement in both directions (deduplicated by the
-- unique constraint), and refresh the denormalized distinct-workspace
-- counts on every touched submission. Returns the anchor's count.
create or replace function public.record_field_submission_corroborations(p_submission_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anchor public.field_data_submissions%rowtype;
  v_match record;
  v_count int;
begin
  select * into v_anchor from public.field_data_submissions where id = p_submission_id;
  if not found or v_anchor.status not in ('submitted', 'corroborated', 'verified', 'promoted') then
    return coalesce(v_anchor.corroboration_count, 0);
  end if;

  for v_match in
    select s.id, s.workspace_id, s.submitted_by
    from public.field_data_submissions s
    where s.id <> v_anchor.id
      and s.workspace_id <> v_anchor.workspace_id
      and s.status in ('submitted', 'corroborated', 'verified', 'promoted')
      and s.year is not distinct from v_anchor.year
      and s.make is not null and v_anchor.make is not null
      and lower(s.make) = lower(v_anchor.make)
      and s.model is not null and v_anchor.model is not null
      and lower(s.model) = lower(v_anchor.model)
      and s.field = v_anchor.field
      and s.value_normalized = v_anchor.value_normalized
      and (s.engine is null or v_anchor.engine is null or lower(s.engine) = lower(v_anchor.engine))
  loop
    -- Their agreement with the anchor's claim.
    insert into public.field_data_corroborations (submission_id, workspace_id, user_id, value_normalized)
    values (v_anchor.id, v_match.workspace_id, v_match.submitted_by, v_anchor.value_normalized)
    on conflict (submission_id, workspace_id) do nothing;
    -- The anchor's agreement with theirs.
    insert into public.field_data_corroborations (submission_id, workspace_id, user_id, value_normalized)
    values (v_match.id, v_anchor.workspace_id, v_anchor.submitted_by, v_anchor.value_normalized)
    on conflict (submission_id, workspace_id) do nothing;
    -- Refresh the matched submission's count.
    update public.field_data_submissions s
    set corroboration_count = (
      select count(distinct c.workspace_id)
      from public.field_data_corroborations c
      where c.submission_id = s.id
    )
    where s.id = v_match.id;
  end loop;

  update public.field_data_submissions s
  set corroboration_count = (
    select count(distinct c.workspace_id)
    from public.field_data_corroborations c
    where c.submission_id = s.id
  )
  where s.id = v_anchor.id
  returning s.corroboration_count into v_count;

  return coalesce(v_count, 0);
end;
$$;

comment on function public.record_field_submission_corroborations(uuid) is
  'Field Data Collection (SW-137): records cross-workspace agreement for one submission and refreshes corroboration counts. SECURITY DEFINER so matching never exposes another workspace''s submissions to the caller.';
