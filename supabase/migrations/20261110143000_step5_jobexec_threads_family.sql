-- ============================================================================
-- Service Writer reconciliation pass - Step 5: Job execution & threads
-- (addendum 2026-11-05 FINAL section 6 step 5). Built from the recon-pass
-- design pair (step5-jobexec.sql + step5-jobexec-spec.md) under
-- TENANCY-RULING.md: full workspace translation + paired code changes;
-- schema and code land as one sequence, platform-wide - never a
-- MOMS-only patch. The per-table section comments below are the design
-- file's own, carried verbatim except where a deviation says otherwise.
--
-- Census basis (2026-11-09): all 16 family tables verified ABSENT in
-- production (160 public tables at the Step 4 close). Expected
-- post-apply census: 160 -> 176 public tables, all 16 empty.
--
-- Shape rule: every CREATE is the code-exercised contract - the design
-- cross-checked against src/integrations/supabase/types.ts and every
-- live .from() payload/select in src/server/hono/routes/work-orders.ts
-- (26 sites) and src/server/hono/routes/messaging.ts (10 sites),
-- translated to workspace tenancy. Root tables carry workspace_id
-- uuid NOT NULL + FK to workspaces(id) with the messaging idiom's RLS
-- (20260822000000_create_messaging.sql); children carry no workspace_id
-- and their policies EXISTS through the parent. Exercised actor
-- columns (owner_user_id, user_id, created_by, sender_id, author_id)
-- are KEPT wherever live code writes or filters them. No CHECK
-- constraints and no pg enum types for status/role/type/kind
-- vocabularies - they live in code (the design's stated posture;
-- types' enum references are collapsed to text).
--
-- FK reality: workspaces, work_orders, appointments, service_records,
-- assets exist; technicians landed at Step 4, which precedes this
-- step in the apply order. OWED FKs (plain columns here, FKs added by
-- the owning step): work_order_checklist_items.playbook_id ->
-- service_playbooks and service_assets.service_id -> services, both
-- Step 8. job_threads.fleet_work_order_id is owed to NOTHING
-- (deviation 1).
--
-- DEVIATIONS FROM THE DESIGN FILE, named plainly:
--  1. The fleet FK is VOID (chair's build-time adjustment,
--     2026-11-10): the design header owed job_threads
--     .fleet_work_order_id an FK to fleet_work_orders at Step 11.
--     Step 11 is STRUCK under the Fleet OS strip (S1/S2 merged; the
--     fleet tables are being excised, never created). The column
--     stays - types and code both carry it - as a plain uuid with no
--     FK owed to anything, and the threads section's
--     "fleet_work_orders after Step 11" derivation is struck with it.
--     ensure_job_thread (section 17) fails loud on job_source =
--     'fleet_work_order'.
--  2. The family RPCs are AUTHORED in section 17. The design left the
--     bodies to the apply-time capture; per the Step 3/4 precedent
--     (log_cash_drawer_event; the clock family) the authored bodies
--     ship in the migration, SECURITY INVOKER, under the exact
--     types.ts signatures, and an apply-time capture that contradicts
--     one is a one-line-class follow-up (the PR #201 pattern):
--       ensure_job_thread - authored against job_threads (the
--         NEED-T1 posture): every exercised child write (events,
--         exceptions) keys off its return value through FKs that
--         types pin to job_threads, and job_threads carries exactly
--         the three link columns the (job_id, job_source) pair maps
--         to ('appointment' -> appointment_id, 'service_record' ->
--         service_record_id, 'fleet_work_order' -> struck, fails
--         loud). Workspace derives from the parent row. If apply-time
--         evidence shows the historical body wrote `threads`, the
--         repoint is a follow-up; `threads` is created as designed
--         and its reads stay empty until a writer lands.
--       ensure_direct_thread - NEED-J1 (the direct-thread workspace
--         rule when a pair shares several workspaces) is the owner's
--         staged decision and the spec states NO default. The
--         authored body takes the least-committal shape: the pair's
--         shared ACTIVE workspaces must number exactly one (the
--         Step 3/4 exactly-one-or-fail-loud idiom), and that one is
--         stamped on the thread; zero or several raises. Participant
--         roles derive from each member's own workspace role
--         (owner/admin -> 'admin'; manager/dispatcher/technician map
--         directly; any other role -> 'technician'). Reversible on
--         the owner's J1 ruling - flagged in the PR body.
--       ensure_job_execution_checklist_v1 - authored as a LOUD STUB
--         raising checklist_not_configured (the checklist-advance
--         route's own idiom): the seed step vocabulary is proven
--         NOWHERE in the repo (NEED-E2) and the function has no
--         caller anywhere; inventing a step list is the failure this
--         pass exists to avoid. The signature ships so the contract
--         exists and any future call fails loudly with the NEED
--         named, instead of 42883 or a guessed seed.
--     NOT authored (outside the family's spec scope; carried as
--     NEED-R1 in the PR body): send_job_thread_message_v2,
--     send_internal_thread_message_v1, mark_job_thread_read_v1.
--     The message send / read-marker paths keep failing loudly
--     (functions absent) until their bodies are authored from a
--     pinned contract in a follow-up; this step lands tables, the
--     ensures, and the four paired payload stamps only.
--  3. UNION RE-BASE on the current tree (build-time): the design
--     pair was evidenced against an older snapshot; every site was
--     re-verified against origin/main at build time (line numbers
--     drifted, shapes held). Two code-side consequences ride in the
--     paired PR and are named in its body: (a) job_photos handler A
--     also gains user_id - the design's own section 3.8 intent
--     ("carried so neither handler errors on shape") cannot hold
--     while the served handler omits the types-required user_id;
--     (b) the service_assets attach/detach stamping resolves the
--     workspace server-side (Step 4's resolveCallerWorkspaceId
--     idiom; an optional client workspace_id is only a
--     disambiguation hint) because the live client command sends
--     no workspace_id - the spec's body-field shape would 400 it.
--
-- Additive only: sixteen new tables + three functions, zero existing
-- data touched. Idempotent - safe to re-run in the SQL Editor.
begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- job_threads — internal-inbox thread header (messaging.ts). ROOT.
-- Contract: types (appointment_id, archived_at, created_by,
-- fleet_work_order_id, last_message_at, owner_user_id, title, type,
-- updated_at) UNION code (kind 'job'|'direct', service_record_id — selected
-- at messaging.ts:2097 and filtered at :2337; NEITHER exists in types).
--   * kind: text NOT NULL, NO default — every consumer requires it and the
--     only writer (ensure_direct_thread / job-thread creation, prod RPCs)
--     necessarily sets it (Step 2's webhook-status precedent). FLAGGED.
--   * type: text NULLABLE — a deliberate types deviation: types mark it
--     Row-non-null/Insert-optional (an original default existed, value
--     unknowable) but NO live code reads or writes it; NOT NULL without a
--     known default would break the RPC writer if it omits the column.
--     FLAGGED in the spec.
--   * workspace_id NOT NULL — populated by the creation RPCs under the
--     paired code change (job threads derive it from the appointment /
--     service record; direct threads from the pair's shared workspace —
--     the multi-workspace disambiguation rule is NEED-J1 in the spec).
-- ---------------------------------------------------------------------------
create table if not exists public.job_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  service_record_id uuid references public.service_records(id) on delete set null,
  fleet_work_order_id uuid,
  kind text not null,
  type text,
  title text,
  last_message_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_threads_workspace_id_idx
  on public.job_threads(workspace_id);
create index if not exists job_threads_owner_user_id_idx
  on public.job_threads(owner_user_id);
create index if not exists job_threads_appointment_id_idx
  on public.job_threads(appointment_id);
create index if not exists job_threads_service_record_id_idx
  on public.job_threads(service_record_id);

alter table public.job_threads enable row level security;

drop policy if exists job_threads_staff_select on public.job_threads;
create policy job_threads_staff_select on public.job_threads
  for select to authenticated using (public.is_workspace_staff(workspace_id));
drop policy if exists job_threads_staff_write on public.job_threads;
create policy job_threads_staff_write on public.job_threads
  for insert to authenticated with check (public.is_workspace_staff(workspace_id));
drop policy if exists job_threads_staff_update on public.job_threads;
create policy job_threads_staff_update on public.job_threads
  for update to authenticated
  using (public.is_workspace_staff(workspace_id))
  with check (public.is_workspace_staff(workspace_id));
drop policy if exists job_threads_admin_delete on public.job_threads;
create policy job_threads_admin_delete on public.job_threads
  for delete to authenticated using (public.is_workspace_admin(workspace_id));

-- ---------------------------------------------------------------------------
-- threads — job-timeline thread header (work-orders.ts), keyed by
-- (job_id, job_source): 'appointment' | 'service_record' |
-- 'fleet_work_order' (all three exercised at work-orders.ts:1312, :1797,
-- and the service-record detail bundle). NO types entry — shape is the
-- draft's, which matches every exercised read exactly. job_id carries NO
-- FK (polymorphic across three parents). Writer is the prod RPC
-- ensure_job_thread — under the paired change it populates workspace_id
-- from the job's parent (appointments / service_records now; the
-- fleet_work_order source is STRUCK — header deviation 1). FLAGGED as
-- NEED-T1 in the spec: the RPC's prod body is not in the repo, and
-- whether it writes `threads` or `job_threads` decides this table's
-- final tenancy wiring. The authored body in section 17 writes
-- job_threads (see header deviation 2).
-- ---------------------------------------------------------------------------
create table if not exists public.threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  job_id uuid,
  job_source text,
  subject text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);

create index if not exists threads_workspace_id_idx
  on public.threads(workspace_id);
create index if not exists threads_job_lookup_idx
  on public.threads(job_id, job_source, created_at desc);

alter table public.threads enable row level security;

drop policy if exists threads_staff_select on public.threads;
create policy threads_staff_select on public.threads
  for select to authenticated using (public.is_workspace_staff(workspace_id));
drop policy if exists threads_staff_write on public.threads;
create policy threads_staff_write on public.threads
  for insert to authenticated with check (public.is_workspace_staff(workspace_id));
drop policy if exists threads_staff_update on public.threads;
create policy threads_staff_update on public.threads
  for update to authenticated
  using (public.is_workspace_staff(workspace_id))
  with check (public.is_workspace_staff(workspace_id));
drop policy if exists threads_admin_delete on public.threads;
create policy threads_admin_delete on public.threads
  for delete to authenticated using (public.is_workspace_admin(workspace_id));

-- ---------------------------------------------------------------------------
-- job_thread_participants — child of job_threads (tenancy via parent).
-- Types-faithful. The one route write is the caller's own read marker
-- (messaging.ts:2283 UPDATE last_read_at by thread_id + user_id), so the
-- UPDATE policy carries an own-row arm alongside the staff arm.
--   * role: text NOT NULL, NO default (types Insert-optional implies an
--     original default existed; its value is unknowable and the creating
--     RPCs necessarily set it). FLAGGED.
--   * No UNIQUE(thread_id, user_id): removed_at implies soft-remove +
--     possible re-add; inventing uniqueness could break the RPC writer
--     (Step 2's sms_opt_outs precedent — considered and deferred).
-- ---------------------------------------------------------------------------
create table if not exists public.job_thread_participants (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.job_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  last_read_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists job_thread_participants_thread_id_idx
  on public.job_thread_participants(thread_id);
create index if not exists job_thread_participants_user_id_idx
  on public.job_thread_participants(user_id);

alter table public.job_thread_participants enable row level security;

drop policy if exists job_thread_participants_staff_select on public.job_thread_participants;
create policy job_thread_participants_staff_select on public.job_thread_participants
  for select to authenticated
  using (exists (
    select 1 from public.job_threads t
    where t.id = thread_id and public.is_workspace_staff(t.workspace_id)
  ));
drop policy if exists job_thread_participants_staff_write on public.job_thread_participants;
create policy job_thread_participants_staff_write on public.job_thread_participants
  for insert to authenticated
  with check (exists (
    select 1 from public.job_threads t
    where t.id = thread_id and public.is_workspace_staff(t.workspace_id)
  ));
drop policy if exists job_thread_participants_update on public.job_thread_participants;
create policy job_thread_participants_update on public.job_thread_participants
  for update to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.job_threads t
      where t.id = thread_id and public.is_workspace_staff(t.workspace_id)
    )
  )
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.job_threads t
      where t.id = thread_id and public.is_workspace_staff(t.workspace_id)
    )
  );
drop policy if exists job_thread_participants_admin_delete on public.job_thread_participants;
create policy job_thread_participants_admin_delete on public.job_thread_participants
  for delete to authenticated
  using (exists (
    select 1 from public.job_threads t
    where t.id = thread_id and public.is_workspace_admin(t.workspace_id)
  ));

-- ---------------------------------------------------------------------------
-- job_thread_messages — child of job_threads (tenancy via parent). Read by
-- BOTH route files (the work-orders job timeline and the messaging inbox);
-- written only through prod RPCs (send_job_thread_message_v2,
-- send_internal_thread_message_v1 — both derive the sender server-side),
-- so there is deliberately NO authenticated INSERT/UPDATE/DELETE policy:
-- the RPCs are the write path and the routes never write this table
-- directly. SELECT is staff-through-parent.
--   * client_message_id: TEXT, a deliberate draft correction — the draft
--     typed it uuid, but types say string and the sending zod accepts any
--     string (crypto.randomUUID() by default, not by contract). No UNIQUE:
--     types list none (dedupe semantics live in the RPC). FLAGGED.
--   * channel DEFAULT 'dispatch': evidenced twice in code (route zod
--     default, work-orders.ts:568; command layer default,
--     job-thread.command.ts). attachments DEFAULT '[]' (types
--     Insert-optional; every route passes an array; consumers coalesce
--     `?? []`).
--   * sender_role / message_type: text NOT NULL, NO default — the send
--     RPCs take neither as a parameter, so they necessarily derive and
--     set both server-side. FLAGGED.
-- ---------------------------------------------------------------------------
create table if not exists public.job_thread_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.job_threads(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null,
  message_type text not null,
  content text not null,
  channel text not null default 'dispatch',
  recipient text,
  attachments jsonb not null default '[]'::jsonb,
  client_message_id text,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists job_thread_messages_thread_created_idx
  on public.job_thread_messages(thread_id, created_at);

alter table public.job_thread_messages enable row level security;

drop policy if exists job_thread_messages_staff_select on public.job_thread_messages;
create policy job_thread_messages_staff_select on public.job_thread_messages
  for select to authenticated
  using (exists (
    select 1 from public.job_threads t
    where t.id = thread_id and public.is_workspace_staff(t.workspace_id)
  ));

-- ---------------------------------------------------------------------------
-- job_thread_events — child of job_threads. INSERT is exercised on the
-- caller's RLS client (work-orders.ts:590), so staff INSERT is granted
-- alongside SELECT. metadata DEFAULT '{}' — the route's own fallback
-- (work-orders.ts:594 `body.metadata ?? {}`, zod default {}).
-- ---------------------------------------------------------------------------
create table if not exists public.job_thread_events (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.job_threads(id) on delete cascade,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists job_thread_events_thread_created_idx
  on public.job_thread_events(thread_id, created_at);

alter table public.job_thread_events enable row level security;

drop policy if exists job_thread_events_staff_select on public.job_thread_events;
create policy job_thread_events_staff_select on public.job_thread_events
  for select to authenticated
  using (exists (
    select 1 from public.job_threads t
    where t.id = thread_id and public.is_workspace_staff(t.workspace_id)
  ));
drop policy if exists job_thread_events_staff_write on public.job_thread_events;
create policy job_thread_events_staff_write on public.job_thread_events
  for insert to authenticated
  with check (exists (
    select 1 from public.job_threads t
    where t.id = thread_id and public.is_workspace_staff(t.workspace_id)
  ));

-- ---------------------------------------------------------------------------
-- job_thread_exceptions — child of job_threads. INSERT exercised on the
-- RLS client (work-orders.ts:615). job_id carries NO FK (polymorphic —
-- appointment or fleet work order; types declare no relationship for it).
-- attachments DEFAULT '[]' (route passes `body.attachments ?? []`).
-- ---------------------------------------------------------------------------
create table if not exists public.job_thread_exceptions (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.job_threads(id) on delete cascade,
  job_id uuid,
  exception_type text not null,
  note text,
  attachments jsonb not null default '[]'::jsonb,
  created_by uuid not null references auth.users(id) on delete cascade,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists job_thread_exceptions_thread_created_idx
  on public.job_thread_exceptions(thread_id, created_at);

alter table public.job_thread_exceptions enable row level security;

drop policy if exists job_thread_exceptions_staff_select on public.job_thread_exceptions;
create policy job_thread_exceptions_staff_select on public.job_thread_exceptions
  for select to authenticated
  using (exists (
    select 1 from public.job_threads t
    where t.id = thread_id and public.is_workspace_staff(t.workspace_id)
  ));
drop policy if exists job_thread_exceptions_staff_write on public.job_thread_exceptions;
create policy job_thread_exceptions_staff_write on public.job_thread_exceptions
  for insert to authenticated
  with check (exists (
    select 1 from public.job_threads t
    where t.id = thread_id and public.is_workspace_staff(t.workspace_id)
  ));

-- ---------------------------------------------------------------------------
-- job_thread_attachments — link table; the family's most uncertain shape.
-- Draft columns only (id, thread_id, asset_id): no types entry, and the
-- single exercised read (work-orders.ts:1309) selects asset_id with an
-- assets(...) embed filtered by thread_id — in a handler that passes the
-- SERVICE RECORD's id as thread_id. Consequences, all deliberate:
--   * asset_id FK -> assets is REQUIRED (the PostgREST embed cannot
--     resolve without it).
--   * thread_id carries NO FK: the exercised read contradicts an FK to
--     job_threads/threads (it keys the column by service-record id).
--     FLAGGED as NEED-A1 — the writer is unknown and the column's true
--     referent must be settled before any FK is added.
--   * workspace_id NULLABLE (the only nullable tenancy column in the
--     family): no known writer can populate it today. The SELECT policy
--     passes on ANY of three evidenced arms — own workspace_id, a
--     service_records row whose id = thread_id in a staff workspace
--     (the exercised read's semantics), or a job_threads row whose
--     id = thread_id in a staff workspace (the name/draft semantics).
--     No write policies: no exercised writer exists.
-- ---------------------------------------------------------------------------
create table if not exists public.job_thread_attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  thread_id uuid,
  asset_id uuid references public.assets(id) on delete cascade
);

create index if not exists job_thread_attachments_thread_id_idx
  on public.job_thread_attachments(thread_id);
create index if not exists job_thread_attachments_asset_id_idx
  on public.job_thread_attachments(asset_id);

alter table public.job_thread_attachments enable row level security;

drop policy if exists job_thread_attachments_select on public.job_thread_attachments;
create policy job_thread_attachments_select on public.job_thread_attachments
  for select to authenticated
  using (
    (workspace_id is not null and public.is_workspace_staff(workspace_id))
    or exists (
      select 1 from public.service_records sr
      where sr.id = thread_id and public.is_workspace_staff(sr.workspace_id)
    )
    or exists (
      select 1 from public.job_threads t
      where t.id = thread_id and public.is_workspace_staff(t.workspace_id)
    )
  );

-- ---------------------------------------------------------------------------
-- job_comments — tech-app job comments (work-orders.ts:1751 read).
-- NO types entry; the draft's column set matches the exercised select
-- exactly (id, appointment_id, author_id, author_name, body, created_at).
-- workspace_id NOT NULL per the ruling — no writer exists in the repo
-- (NEED-C1 in the spec): the writer, wherever it lives, must derive
-- workspace_id from the appointment, which is in hand at every read.
-- author_name is a denormalized display name kept by the contract.
-- ---------------------------------------------------------------------------
create table if not exists public.job_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  author_id uuid references auth.users(id) on delete set null,
  author_name text,
  body text,
  created_at timestamptz default now()
);

create index if not exists job_comments_workspace_id_idx
  on public.job_comments(workspace_id);
create index if not exists job_comments_appointment_created_idx
  on public.job_comments(appointment_id, created_at);

alter table public.job_comments enable row level security;

drop policy if exists job_comments_staff_select on public.job_comments;
create policy job_comments_staff_select on public.job_comments
  for select to authenticated using (public.is_workspace_staff(workspace_id));
drop policy if exists job_comments_staff_write on public.job_comments;
create policy job_comments_staff_write on public.job_comments
  for insert to authenticated with check (public.is_workspace_staff(workspace_id));
drop policy if exists job_comments_staff_update on public.job_comments;
create policy job_comments_staff_update on public.job_comments
  for update to authenticated
  using (public.is_workspace_staff(workspace_id))
  with check (public.is_workspace_staff(workspace_id));
drop policy if exists job_comments_admin_delete on public.job_comments;
create policy job_comments_admin_delete on public.job_comments
  for delete to authenticated using (public.is_workspace_admin(workspace_id));

-- ---------------------------------------------------------------------------
-- job_execution_checklist (SINGULAR) — per-appointment step checklist
-- read by the FIRST-registered GET /v1/jobs/:id/runtime handler
-- (work-orders.ts:1669). NO types entry; the draft's column set matches
-- the exercised select exactly (id, step_key, label, step_order, status,
-- evidence_url, completed_at, completed_by) filtered by appointment_id.
-- DISTINCT from the plural table below — both are exercised, neither is
-- merged into the other (brief rule). step_order is integer here (draft /
-- code-references) vs numeric in the plural (types) — kept as evidenced.
-- Nullability follows the draft (all nullable except id): no NOT NULL
-- evidence exists for any column. workspace_id NOT NULL per the ruling;
-- the seeder is unknown (DB-side presumed) and must populate it from the
-- appointment — NEED-E1 in the spec.
-- ---------------------------------------------------------------------------
create table if not exists public.job_execution_checklist (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete cascade,
  step_key text,
  label text,
  step_order integer,
  status text,
  evidence_url text,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null
);

create index if not exists job_execution_checklist_workspace_id_idx
  on public.job_execution_checklist(workspace_id);
create index if not exists job_execution_checklist_appointment_order_idx
  on public.job_execution_checklist(appointment_id, step_order);

alter table public.job_execution_checklist enable row level security;

drop policy if exists job_execution_checklist_staff_select on public.job_execution_checklist;
create policy job_execution_checklist_staff_select on public.job_execution_checklist
  for select to authenticated using (public.is_workspace_staff(workspace_id));
drop policy if exists job_execution_checklist_staff_write on public.job_execution_checklist;
create policy job_execution_checklist_staff_write on public.job_execution_checklist
  for insert to authenticated with check (public.is_workspace_staff(workspace_id));
drop policy if exists job_execution_checklist_staff_update on public.job_execution_checklist;
create policy job_execution_checklist_staff_update on public.job_execution_checklist
  for update to authenticated
  using (public.is_workspace_staff(workspace_id))
  with check (public.is_workspace_staff(workspace_id));
drop policy if exists job_execution_checklist_admin_delete on public.job_execution_checklist;
create policy job_execution_checklist_admin_delete on public.job_execution_checklist
  for delete to authenticated using (public.is_workspace_admin(workspace_id));

-- ---------------------------------------------------------------------------
-- job_execution_checklists (PLURAL) — per-job step checklist keyed by
-- (job_id, job_source), read by the SECOND-registered runtime handler
-- (work-orders.ts:2772, shadowed today — see spec finding F2). Types
-- shape, including user_id NOT NULL (the seeding actor) — KEPT, with an
-- auth.users FK, and workspace_id NOT NULL added beside it: the table
-- serves both the actor who seeded it and the workspace that owns the
-- job. job_id carries NO FK (polymorphic; types declare no
-- relationships). Seeded by the prod RPC
-- ensure_job_execution_checklist_v1(p_job_id, p_source), which has NO
-- caller and NO definition in the repo — under the paired change it
-- populates workspace_id (from the appointment for job_source
-- 'appointment') and user_id. NEED-E2 in the spec.
--   * status: text NOT NULL, NO default (types Insert-optional implies
--     an original default; no status value is proven anywhere in code
--     for this table). is_required / requires_photo: NOT NULL DEFAULT
--     false (Insert-optional; false is the neutral evidenced-by-shape
--     choice). Both FLAGGED.
--   * updated_at: NOT NULL DEFAULT now() (types Insert-optional).
-- ---------------------------------------------------------------------------
create table if not exists public.job_execution_checklists (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  job_id uuid not null,
  job_source text not null,
  step_key text not null,
  step_name text not null,
  step_order numeric,
  status text not null,
  is_required boolean not null default false,
  requires_photo boolean not null default false,
  evidence_url text,
  notes text,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_execution_checklists_workspace_id_idx
  on public.job_execution_checklists(workspace_id);
create index if not exists job_execution_checklists_job_order_idx
  on public.job_execution_checklists(job_id, job_source, step_order);

alter table public.job_execution_checklists enable row level security;

drop policy if exists job_execution_checklists_staff_select on public.job_execution_checklists;
create policy job_execution_checklists_staff_select on public.job_execution_checklists
  for select to authenticated using (public.is_workspace_staff(workspace_id));
drop policy if exists job_execution_checklists_staff_write on public.job_execution_checklists;
create policy job_execution_checklists_staff_write on public.job_execution_checklists
  for insert to authenticated with check (public.is_workspace_staff(workspace_id));
drop policy if exists job_execution_checklists_staff_update on public.job_execution_checklists;
create policy job_execution_checklists_staff_update on public.job_execution_checklists
  for update to authenticated
  using (public.is_workspace_staff(workspace_id))
  with check (public.is_workspace_staff(workspace_id));
drop policy if exists job_execution_checklists_admin_delete on public.job_execution_checklists;
create policy job_execution_checklists_admin_delete on public.job_execution_checklists
  for delete to authenticated using (public.is_workspace_admin(workspace_id));

-- ---------------------------------------------------------------------------
-- job_photos — tech-app job photos. Types shape, PLUS the three columns
-- only the FIRST-registered of the two duplicate POST handlers inserts
-- (work-orders.ts:1949: business_user_id, photo_url, uploaded_by) —
-- carried NULLABLE so neither handler errors on shape; the
-- types-faithful second handler (work-orders.ts:3470) and the read
-- (work-orders.ts:3202) use the types columns only. The duplicate
-- handlers are finding F1 in the spec (deduplication is a paired-code
-- DECISION, not settled here). workspace_id NOT NULL: both handlers
-- hold appointment_id, so the paired code change derives workspace_id
-- from the appointment. technician_id FK targets Step 4's technicians,
-- which precedes Step 5 in the apply order.
-- ---------------------------------------------------------------------------
create table if not exists public.job_photos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  technician_id uuid references public.technicians(id) on delete set null,
  business_user_id uuid references auth.users(id) on delete set null,
  uploaded_by uuid references auth.users(id) on delete set null,
  photo_type text not null,
  photo_url text,
  storage_path text not null,
  file_name text,
  file_size numeric,
  caption text,
  is_required boolean,
  location jsonb,
  captured_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists job_photos_workspace_id_idx
  on public.job_photos(workspace_id);
create index if not exists job_photos_appointment_created_idx
  on public.job_photos(appointment_id, created_at desc);
create index if not exists job_photos_technician_id_idx
  on public.job_photos(technician_id);

alter table public.job_photos enable row level security;

drop policy if exists job_photos_staff_select on public.job_photos;
create policy job_photos_staff_select on public.job_photos
  for select to authenticated using (public.is_workspace_staff(workspace_id));
drop policy if exists job_photos_staff_write on public.job_photos;
create policy job_photos_staff_write on public.job_photos
  for insert to authenticated with check (public.is_workspace_staff(workspace_id));
drop policy if exists job_photos_staff_update on public.job_photos;
create policy job_photos_staff_update on public.job_photos
  for update to authenticated
  using (public.is_workspace_staff(workspace_id))
  with check (public.is_workspace_staff(workspace_id));
drop policy if exists job_photos_admin_delete on public.job_photos;
create policy job_photos_admin_delete on public.job_photos
  for delete to authenticated using (public.is_workspace_admin(workspace_id));

-- ---------------------------------------------------------------------------
-- work_order_checklist_items — child of work_orders; tenancy lives on
-- the parent, proven by the exercised PATCH itself: it authorizes with
-- requireWorkspaceAuth(body.workspace_id) and filters through a
-- work_orders!inner(workspace_id) join (work-orders.ts:185). It carries
-- NO workspace_id of its own — the sync pair's child-table idiom — and
-- no known writer could populate one (no insert site exists anywhere in
-- the repo; the seeder is unknown, NEED-W1). This is the family's
-- deliberate, evidenced deviation from the NOT NULL default, flagged in
-- the spec. Types shape otherwise; playbook_id is a plain column (FK
-- owed to service_playbooks, Step 8).
--   * status / execution_phase: text, NOT NULL per types, NO defaults
--     (Insert-optional implies originals existed; no values are proven
--     in code — the PATCH's zod caps status at 40 chars but names no
--     vocabulary). is_mandatory / is_unlocked / requires_photo: NOT
--     NULL DEFAULT false (neutral choice; the template-instantiating
--     writer is expected to set them explicitly). All FLAGGED.
-- ---------------------------------------------------------------------------
create table if not exists public.work_order_checklist_items (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  step_name text not null,
  step_order numeric,
  execution_phase text not null,
  status text not null,
  is_mandatory boolean not null default false,
  is_unlocked boolean not null default false,
  requires_photo boolean not null default false,
  evidence_url text,
  notes text,
  playbook_id uuid,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists work_order_checklist_items_work_order_order_idx
  on public.work_order_checklist_items(work_order_id, step_order);

alter table public.work_order_checklist_items enable row level security;

drop policy if exists work_order_checklist_items_staff_select on public.work_order_checklist_items;
create policy work_order_checklist_items_staff_select on public.work_order_checklist_items
  for select to authenticated
  using (exists (
    select 1 from public.work_orders wo
    where wo.id = work_order_id and public.is_workspace_staff(wo.workspace_id)
  ));
drop policy if exists work_order_checklist_items_staff_write on public.work_order_checklist_items;
create policy work_order_checklist_items_staff_write on public.work_order_checklist_items
  for insert to authenticated
  with check (exists (
    select 1 from public.work_orders wo
    where wo.id = work_order_id and public.is_workspace_staff(wo.workspace_id)
  ));
drop policy if exists work_order_checklist_items_staff_update on public.work_order_checklist_items;
create policy work_order_checklist_items_staff_update on public.work_order_checklist_items
  for update to authenticated
  using (exists (
    select 1 from public.work_orders wo
    where wo.id = work_order_id and public.is_workspace_staff(wo.workspace_id)
  ))
  with check (exists (
    select 1 from public.work_orders wo
    where wo.id = work_order_id and public.is_workspace_staff(wo.workspace_id)
  ));
drop policy if exists work_order_checklist_items_admin_delete on public.work_order_checklist_items;
create policy work_order_checklist_items_admin_delete on public.work_order_checklist_items
  for delete to authenticated
  using (exists (
    select 1 from public.work_orders wo
    where wo.id = work_order_id and public.is_workspace_admin(wo.workspace_id)
  ));

-- ---------------------------------------------------------------------------
-- service_record_items — child of service_records (present; its own
-- shape is contested per addendum R2 and is NOT designed here — the FK
-- target is all this step needs). NO types entry. The only exercised
-- access is select("*") by service_id (work-orders.ts:1305), so the
-- exercised column set beyond the draft's (id, service_id) is
-- UNKNOWABLE from the repo — the create is deliberately minimal and the
-- shape poverty is NEED-S1 in the spec (the real columns live only in
-- the old database; Step 14 capture settles them, and any additional
-- columns land as a follow-up ALTER, never a guess here). Tenancy via
-- the parent (sync-pair child idiom); the reading handler verifies the
-- service record's workspace in code before reading.
-- ---------------------------------------------------------------------------
create table if not exists public.service_record_items (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.service_records(id) on delete cascade
);

create index if not exists service_record_items_service_id_idx
  on public.service_record_items(service_id);

alter table public.service_record_items enable row level security;

drop policy if exists service_record_items_staff_select on public.service_record_items;
create policy service_record_items_staff_select on public.service_record_items
  for select to authenticated
  using (exists (
    select 1 from public.service_records sr
    where sr.id = service_id and public.is_workspace_staff(sr.workspace_id)
  ));
drop policy if exists service_record_items_staff_write on public.service_record_items;
create policy service_record_items_staff_write on public.service_record_items
  for insert to authenticated
  with check (exists (
    select 1 from public.service_records sr
    where sr.id = service_id and public.is_workspace_staff(sr.workspace_id)
  ));
drop policy if exists service_record_items_staff_update on public.service_record_items;
create policy service_record_items_staff_update on public.service_record_items
  for update to authenticated
  using (exists (
    select 1 from public.service_records sr
    where sr.id = service_id and public.is_workspace_staff(sr.workspace_id)
  ))
  with check (exists (
    select 1 from public.service_records sr
    where sr.id = service_id and public.is_workspace_staff(sr.workspace_id)
  ));
drop policy if exists service_record_items_admin_delete on public.service_record_items;
create policy service_record_items_admin_delete on public.service_record_items
  for delete to authenticated
  using (exists (
    select 1 from public.service_records sr
    where sr.id = service_id and public.is_workspace_admin(sr.workspace_id)
  ));

-- ---------------------------------------------------------------------------
-- service_record_assets — child of service_records (same posture as
-- above). NO types entry; the draft's three columns are exactly what
-- the exercised read uses (work-orders.ts:1306): asset_id with an
-- assets(...) embed — the asset_id FK -> assets is REQUIRED for that
-- embed to resolve. No writer exists in the repo.
-- ---------------------------------------------------------------------------
create table if not exists public.service_record_assets (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.service_records(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade
);

create index if not exists service_record_assets_service_id_idx
  on public.service_record_assets(service_id);
create index if not exists service_record_assets_asset_id_idx
  on public.service_record_assets(asset_id);

alter table public.service_record_assets enable row level security;

drop policy if exists service_record_assets_staff_select on public.service_record_assets;
create policy service_record_assets_staff_select on public.service_record_assets
  for select to authenticated
  using (exists (
    select 1 from public.service_records sr
    where sr.id = service_id and public.is_workspace_staff(sr.workspace_id)
  ));
drop policy if exists service_record_assets_staff_write on public.service_record_assets;
create policy service_record_assets_staff_write on public.service_record_assets
  for insert to authenticated
  with check (exists (
    select 1 from public.service_records sr
    where sr.id = service_id and public.is_workspace_staff(sr.workspace_id)
  ));
drop policy if exists service_record_assets_staff_update on public.service_record_assets;
create policy service_record_assets_staff_update on public.service_record_assets
  for update to authenticated
  using (exists (
    select 1 from public.service_records sr
    where sr.id = service_id and public.is_workspace_staff(sr.workspace_id)
  ))
  with check (exists (
    select 1 from public.service_records sr
    where sr.id = service_id and public.is_workspace_staff(sr.workspace_id)
  ));
drop policy if exists service_record_assets_admin_delete on public.service_record_assets;
create policy service_record_assets_admin_delete on public.service_record_assets
  for delete to authenticated
  using (exists (
    select 1 from public.service_records sr
    where sr.id = service_id and public.is_workspace_admin(sr.workspace_id)
  ));

-- ---------------------------------------------------------------------------
-- service_assets — asset<->service link WITH an exercised writer:
-- POST /v1/assets/attach upserts on conflict (service_id, asset_id)
-- (work-orders.ts:470) — the UNIQUE(service_id, asset_id) constraint is
-- therefore PROVEN by code and included even though types list no
-- constraint. Types shape + workspace_id NOT NULL per the ruling.
-- service_id references the Step 8 `services` table (types FK) — the FK
-- itself is OWED to Step 8; plain column here. The attach/detach routes
-- run bare requireAuth today and take no workspace input: the paired
-- code change adds workspace_id to the body + requireWorkspaceAuth
-- (the platform's standard pattern) and stamps it on the upsert —
-- NEED-L1 in the spec (an airtight "service belongs to this workspace"
-- check only becomes possible once `services` is workspace-shaped in
-- Step 8). user_id stays as the exercised actor column.
-- ---------------------------------------------------------------------------
create table if not exists public.service_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  service_id uuid not null,
  asset_id uuid not null references public.assets(id) on delete cascade,
  caption text,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint service_assets_service_asset_unique unique (service_id, asset_id)
);

create index if not exists service_assets_workspace_id_idx
  on public.service_assets(workspace_id);
create index if not exists service_assets_service_id_idx
  on public.service_assets(service_id);
create index if not exists service_assets_asset_id_idx
  on public.service_assets(asset_id);

alter table public.service_assets enable row level security;

drop policy if exists service_assets_staff_select on public.service_assets;
create policy service_assets_staff_select on public.service_assets
  for select to authenticated using (public.is_workspace_staff(workspace_id));
drop policy if exists service_assets_staff_write on public.service_assets;
create policy service_assets_staff_write on public.service_assets
  for insert to authenticated with check (public.is_workspace_staff(workspace_id));
drop policy if exists service_assets_staff_update on public.service_assets;
create policy service_assets_staff_update on public.service_assets
  for update to authenticated
  using (public.is_workspace_staff(workspace_id))
  with check (public.is_workspace_staff(workspace_id));
drop policy if exists service_assets_admin_delete on public.service_assets;
create policy service_assets_admin_delete on public.service_assets
  for delete to authenticated using (public.is_workspace_admin(workspace_id));

-- ---------------------------------------------------------------------------
-- location_history — technician location pings (work-orders.ts:2729
-- read: select * by technician_id, recorded_at desc, limit 50). Types
-- shape exactly (the draft agrees). Tenancy via the parent technicians
-- row (Step 4 carries workspace_id — proven in code: work-orders.ts:1820
-- selects technicians.workspace_id), so no workspace_id column of its
-- own (child idiom). recorded_at DEFAULT now(): a ping's recorded
-- instant is its creation instant (Step 2's opted_out_at reasoning).
-- NO writer exists in the repo, and two client query modules call this
-- table "retired in Final" while the tech-os route still reads it —
-- designed as exercised per the addendum; the tension is flagged as
-- NEED-H1 in the spec.
-- ---------------------------------------------------------------------------
create table if not exists public.location_history (
  id uuid primary key default gen_random_uuid(),
  technician_id uuid not null references public.technicians(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  latitude numeric not null,
  longitude numeric not null,
  accuracy numeric,
  altitude numeric,
  heading numeric,
  speed numeric,
  activity_type text,
  recorded_at timestamptz not null default now()
);

create index if not exists location_history_technician_recorded_idx
  on public.location_history(technician_id, recorded_at desc);
create index if not exists location_history_appointment_id_idx
  on public.location_history(appointment_id);

alter table public.location_history enable row level security;

drop policy if exists location_history_staff_select on public.location_history;
create policy location_history_staff_select on public.location_history
  for select to authenticated
  using (exists (
    select 1 from public.technicians t
    where t.id = technician_id and public.is_workspace_staff(t.workspace_id)
  ));
drop policy if exists location_history_staff_write on public.location_history;
create policy location_history_staff_write on public.location_history
  for insert to authenticated
  with check (exists (
    select 1 from public.technicians t
    where t.id = technician_id and public.is_workspace_staff(t.workspace_id)
  ));

-- ============================================================================
-- 17. Family RPCs — AUTHORED FRESH (header deviation 2). None of these
-- exist in production; the repo holds only the types.ts signatures and
-- the call sites. Bodies are written under those exact signatures from
-- the code-exercised contract, SECURITY INVOKER per the Step 3/4
-- precedent, so the tables' RLS above governs every write they make.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 17a. ensure_job_thread(p_job_id, p_job_source, p_created_by) RETURNS uuid
-- — the job-thread find-or-create behind POST /v1/job-threads/ensure and
-- the timeline / messages / events / exceptions routes (work-orders.ts —
-- always called with exactly these three args).
--
-- Target table is job_threads (NEED-T1 posture, header deviation 2):
-- the events/exceptions inserts key off the returned id through FKs
-- that types pin to job_threads, and job_threads carries the three
-- link columns the (job_id, job_source) pair maps to. kind and type
-- are both stamped 'job' (kind is the column live code reads; type is
-- its types-era twin). The workspace derives from the parent row —
-- appointments.workspace_id / service_records.workspace_id — never
-- from the caller. No participant rows are created: no exercised code
-- requires one (thread visibility includes ownership via
-- owner_user_id), and inventing a participant vocabulary for job
-- threads is the same failure as inventing the checklist seed.
-- job_source = 'fleet_work_order' raises: its parent table is struck
-- (header deviation 1) and there is nothing to derive a workspace
-- from. Any other unknown source raises the same way.
-- ----------------------------------------------------------------------------
create or replace function public.ensure_job_thread(
  p_job_id uuid,
  p_job_source text,
  p_created_by uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_thread_id uuid;
begin
  if p_created_by is null then
    raise exception 'Authentication required';
  end if;

  if p_job_source = 'appointment' then
    select workspace_id into v_workspace_id
    from public.appointments
    where id = p_job_id;
    if v_workspace_id is null then
      raise exception 'ensure_job_thread: appointment % not found', p_job_id;
    end if;
    select id into v_thread_id
    from public.job_threads
    where kind = 'job' and appointment_id = p_job_id
    order by created_at asc
    limit 1;
    if v_thread_id is null then
      insert into public.job_threads (
        workspace_id, owner_user_id, created_by, appointment_id, kind, type
      ) values (
        v_workspace_id, p_created_by, p_created_by, p_job_id, 'job', 'job'
      )
      returning id into v_thread_id;
    end if;
  elsif p_job_source = 'service_record' then
    select workspace_id into v_workspace_id
    from public.service_records
    where id = p_job_id;
    if v_workspace_id is null then
      raise exception 'ensure_job_thread: service record % not found', p_job_id;
    end if;
    select id into v_thread_id
    from public.job_threads
    where kind = 'job' and service_record_id = p_job_id
    order by created_at asc
    limit 1;
    if v_thread_id is null then
      insert into public.job_threads (
        workspace_id, owner_user_id, created_by, service_record_id, kind, type
      ) values (
        v_workspace_id, p_created_by, p_created_by, p_job_id, 'job', 'job'
      )
      returning id into v_thread_id;
    end if;
  else
    raise exception 'ensure_job_thread: unsupported job_source %', p_job_source;
  end if;

  return v_thread_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 17b. ensure_direct_thread(p_other_user_id) RETURNS uuid — the
-- direct-message find-or-create behind POST
-- /v1/internal-inbox/threads/direct (messaging.ts; the route accepts a
-- bare uuid return). The caller is auth.uid() (the types signature
-- carries no caller argument).
--
-- NEED-J1 posture (header deviation 2): the pair's shared ACTIVE
-- workspaces must number exactly one; that workspace is stamped on
-- the thread. Zero shared workspaces, or several, raises — the
-- multi-workspace direct-thread rule is the owner's staged decision
-- and this body is reversible on it. Find-or-create matches the
-- inbox's own existing-DM lookup: kind = 'direct' threads in the
-- stamped workspace where BOTH users hold a non-removed participant
-- row. Participant roles derive from each member's workspace_members
-- role in the stamped workspace, mapped onto the participant
-- vocabulary (owner/admin -> 'admin'; manager/dispatcher/technician
-- map directly; any other role -> 'technician').
-- ----------------------------------------------------------------------------
create or replace function public.ensure_direct_thread(
  p_other_user_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_workspace_id uuid;
  v_shared integer;
  v_thread_id uuid;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;
  if p_other_user_id is null or p_other_user_id = v_user then
    raise exception 'ensure_direct_thread: a direct thread requires another user';
  end if;

  -- NB: no min(uuid) — Postgres has no min aggregate for uuid (the
  -- count is taken first; the single workspace is read only when the
  -- count proves there is exactly one).
  select count(*)
    into v_shared
  from public.workspace_members a
  join public.workspace_members b
    on b.workspace_id = a.workspace_id
  where a.user_id = v_user and a.is_active
    and b.user_id = p_other_user_id and b.is_active;
  if v_shared is null or v_shared <> 1 then
    raise exception 'ensure_direct_thread: workspace is ambiguous for this user pair (NEED-J1)';
  end if;
  select a.workspace_id
    into v_workspace_id
  from public.workspace_members a
  join public.workspace_members b
    on b.workspace_id = a.workspace_id
  where a.user_id = v_user and a.is_active
    and b.user_id = p_other_user_id and b.is_active
  limit 1;

  select t.id into v_thread_id
  from public.job_threads t
  where t.kind = 'direct' and t.workspace_id = v_workspace_id
    and exists (
      select 1 from public.job_thread_participants p
      where p.thread_id = t.id and p.user_id = v_user and p.removed_at is null
    )
    and exists (
      select 1 from public.job_thread_participants p
      where p.thread_id = t.id and p.user_id = p_other_user_id and p.removed_at is null
    )
  order by t.created_at asc
  limit 1;
  if v_thread_id is not null then
    return v_thread_id;
  end if;

  insert into public.job_threads (
    workspace_id, owner_user_id, created_by, kind, type
  ) values (
    v_workspace_id, v_user, v_user, 'direct', 'direct'
  )
  returning id into v_thread_id;

  insert into public.job_thread_participants (thread_id, user_id, role)
  select
    v_thread_id,
    m.user_id,
    case
      when m.role in ('owner', 'admin') then 'admin'
      when m.role in ('manager', 'dispatcher', 'technician') then m.role
      else 'technician'
    end
  from public.workspace_members m
  where m.workspace_id = v_workspace_id
    and m.is_active
    and m.user_id in (v_user, p_other_user_id);

  return v_thread_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 17c. ensure_job_execution_checklist_v1(p_job_id, p_source) RETURNS
-- integer — LOUD STUB (header deviation 2). The seed step vocabulary
-- this function would instantiate is proven nowhere in the repo
-- (NEED-E2) and no caller exists; the body raises with the NEED named
-- (the checklist_not_configured idiom of the checklist-advance route)
-- rather than inventing steps. Replacing this body is a follow-up
-- once the vocabulary is pinned.
-- ----------------------------------------------------------------------------
create or replace function public.ensure_job_execution_checklist_v1(
  p_job_id uuid,
  p_source text
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'checklist_not_configured: execution checklist seed vocabulary is not configured (NEED-E2)';
end;
$$;

grant execute on function public.ensure_job_thread(uuid, text, uuid) to authenticated, service_role;
grant execute on function public.ensure_direct_thread(uuid) to authenticated, service_role;
grant execute on function public.ensure_job_execution_checklist_v1(uuid, text) to authenticated, service_role;

commit;
