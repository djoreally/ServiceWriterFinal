# Quote Conversion Schema and API Slice Design

## Executive decision

The quote conversion flow should stop creating rows in `public.services`. The canonical target is a workspace-scoped `public.service_records` aggregate with a new workspace-scoped line-item table. Conversion must be a single transactional application operation that validates the quote, snapshots its commercial data, creates the service record and line items, records an idempotency/audit row, and transitions the quote to `converted`.

The existing `labor_items` and `service_items` tables cannot be reused as the target because both foreign-key to the legacy `services` table and neither table carries explicit workspace ownership. They should remain read-compatible during rollout and be retired only after all legacy consumers are migrated.

## Current-state constraints

| Existing object | Current characteristics | Conversion implication |
|---|---|---|
| `quotes` | Uses `user_id`, customer/vehicle references, description, labor and parts totals, and status. | Add explicit `workspace_id`; do not infer tenant scope from `user_id` in application code. |
| `quote_items` | Uses `quote_id`, description, quantity, unit price, total price, and optional inventory item. | Preserve every item as a source-linked service-record line item. |
| `service_records` | Workspace-scoped operational aggregate with appointment/work-order links, status, work performed, internal notes, oil usage, and JSON metadata. | Extend with `quote_id` and commercial totals, or store the commercial snapshot in a dedicated conversion table. |
| `labor_items` | Foreign key `service_id -> services.id`. | Not a valid target for the new flow. |
| `service_items` | Foreign key `service_id -> services.id`. | Not a valid target for the new flow. |
| `quotes.command.ts` | Performs direct writes to quotes, quote items, legacy services, labor items, and service items. | Replace only the conversion write with one bridge call; keep ordinary quote CRUD separate. |

## Target data model

### 1. Workspace ownership on quotes

Add `workspace_id` to `quotes` and `quote_items`. The migration must backfill existing rows through an explicit owner-to-workspace mapping and must fail closed if any row cannot be mapped.

```sql
alter table public.quotes add column if not exists workspace_id uuid;
alter table public.quote_items add column if not exists workspace_id uuid;

update public.quotes q
set workspace_id = w.id
from public.workspaces w
where w.owner_user_id = q.user_id
  and q.workspace_id is null;

update public.quote_items qi
set workspace_id = q.workspace_id
from public.quotes q
where q.id = qi.quote_id
  and qi.workspace_id is null;

alter table public.quotes
  add constraint quotes_workspace_id_fkey
  foreign key (workspace_id) references public.workspaces(id);

alter table public.quote_items
  add constraint quote_items_workspace_id_fkey
  foreign key (workspace_id) references public.workspaces(id);

create index if not exists quotes_workspace_status_idx
  on public.quotes(workspace_id, status, updated_at desc);

create index if not exists quote_items_workspace_quote_idx
  on public.quote_items(workspace_id, quote_id);
```

Before making either column `not null`, run a migration assertion and abort if orphaned ownership remains:

```sql
do $$
begin
  if exists (select 1 from public.quotes where workspace_id is null)
     or exists (select 1 from public.quote_items where workspace_id is null) then
    raise exception 'Quote workspace backfill incomplete';
  end if;
end $$;
```

After the assertion succeeds, set both columns `not null` and add a composite uniqueness constraint used by the conversion function:

```sql
alter table public.quotes alter column workspace_id set not null;
alter table public.quote_items alter column workspace_id set not null;

create unique index if not exists quotes_workspace_id_id_uidx
  on public.quotes(workspace_id, id);
```

### 2. Canonical service-record line items

Create a new table rather than overloading `metadata`. The table is the source of truth for labor, parts, fees, and discounts created by a quote conversion.

```sql
create type public.service_record_line_item_type as enum ('labor', 'part', 'fee', 'discount');

create table public.service_record_line_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  service_record_id uuid not null references public.service_records(id) on delete cascade,
  source_quote_id uuid references public.quotes(id),
  source_quote_item_id uuid references public.quote_items(id),
  item_type public.service_record_line_item_type not null,
  description text not null check (length(btrim(description)) between 1 and 500),
  inventory_item_id uuid references public.inventory_items(id),
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  total_price numeric(12,2) not null check (total_price >= 0),
  labor_hours numeric(10,2) check (labor_hours is null or labor_hours >= 0),
  labor_rate numeric(12,2) check (labor_rate is null or labor_rate >= 0),
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_record_line_items_workspace_record_fk
    foreign key (workspace_id, service_record_id)
    references public.service_records(workspace_id, id),
  constraint service_record_line_items_workspace_quote_fk
    foreign key (workspace_id, source_quote_id)
    references public.quotes(workspace_id, id),
  constraint service_record_line_items_workspace_quote_item_fk
    foreign key (workspace_id, source_quote_item_id)
    references public.quote_items(workspace_id, id),
  constraint service_record_line_items_total_check
    check (total_price = round(quantity * unit_price, 2) or item_type = 'discount')
);

create index service_record_line_items_record_idx
  on public.service_record_line_items(workspace_id, service_record_id, sort_order);

create unique index service_record_line_items_quote_item_once_uidx
  on public.service_record_line_items(workspace_id, source_quote_item_id)
  where source_quote_item_id is not null;
```

The composite foreign keys require matching unique constraints on the parent tables. If the live schema does not already have them, add `unique (workspace_id, id)` to `service_records`, `quotes`, and `quote_items` before applying the line-item table.

### 3. Quote conversion audit and idempotency

Use a dedicated conversion table to make retries safe, expose conversion status, and retain the source snapshot used to create the operational record.

```sql
create type public.quote_conversion_status as enum ('processing', 'converted', 'failed');

create table public.quote_conversions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  quote_id uuid not null,
  service_record_id uuid references public.service_records(id),
  idempotency_key text not null check (length(btrim(idempotency_key)) between 16 and 200),
  status public.quote_conversion_status not null default 'processing',
  source_quote_snapshot jsonb not null,
  source_items_snapshot jsonb not null default '[]'::jsonb,
  conversion_options jsonb not null default '{}'::jsonb,
  failure_code text,
  failure_message text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint quote_conversions_workspace_quote_fk
    foreign key (workspace_id, quote_id) references public.quotes(workspace_id, id),
  constraint quote_conversions_workspace_service_fk
    foreign key (workspace_id, service_record_id)
    references public.service_records(workspace_id, id),
  unique (workspace_id, quote_id, idempotency_key)
);

create unique index quote_conversions_one_success_uidx
  on public.quote_conversions(workspace_id, quote_id)
  where status = 'converted';
```

The conversion row is not a substitute for the line-item data. It is an immutable audit snapshot and retry boundary.

### 4. Service-record commercial fields

Add normalized totals to `service_records` so downstream invoices and reporting do not need to decode quote metadata:

```sql
alter table public.service_records
  add column if not exists quote_id uuid,
  add column if not exists subtotal numeric(12,2),
  add column if not exists tax_rate numeric(7,4),
  add column if not exists tax_amount numeric(12,2),
  add column if not exists discount_amount numeric(12,2),
  add column if not exists total_amount numeric(12,2),
  add column if not exists currency_code text not null default 'USD';
```

Add a workspace-scoped foreign key from `service_records(workspace_id, quote_id)` to `quotes(workspace_id, id)` after the quote backfill. Keep `total_cost` only as a compatibility projection if it already exists elsewhere; the new conversion API should write one canonical total field and expose an explicit mapping during the transition.

## Conversion invariants

The server, not the browser, owns these rules.

| Invariant | Enforcement |
|---|---|
| Caller belongs to the selected workspace | `requireWorkspaceMember` before the RPC and database RLS inside the transaction. |
| Quote belongs to the workspace | Composite quote lookup by `(workspace_id, quote_id)`. |
| Only convertible statuses are accepted | Allow `draft`, `sent`, `accepted`, or the project’s approved equivalent; reject `converted`, `expired`, `cancelled`, and unknown statuses. |
| A quote can be converted only once successfully | Partial unique index on `(workspace_id, quote_id)` where status is `converted`. |
| Retries are safe | Require an idempotency key and return the existing conversion for the same workspace, quote, and key. |
| Quote data is immutable during conversion | Lock the quote row with `for update` and snapshot quote items under the same transaction. |
| Every line item belongs to the same tenant and source quote | Composite foreign keys and server-side workspace assignment. |
| Totals are deterministic | Recalculate `quantity * unit_price`, compare to submitted values within two decimal places, and reject mismatches. |
| Inventory is not consumed by conversion | Conversion creates a planned part line item only; inventory reservation/consumption is a separate explicit workflow. |
| No partial writes | One database transaction; conversion audit is marked `failed` only if the transaction can safely retain the failure record, otherwise the request is retriable. |

## API slice

### Route

`POST /api/v1/quotes/:id/convert`

The route is intentionally a domain operation rather than a generic multi-table CRUD endpoint. It should be implemented at:

```text
apps/web-next/src/app/api/v1/quotes/[id]/convert/route.ts
```

### Request contract

```ts
import { z } from "zod";

export const quoteConversionRequestSchema = z.object({
  workspace_id: z.string().uuid(),
  idempotency_key: z.string().trim().min(16).max(200),
  service_date: z.string().date().optional(),
  technician_id: z.string().uuid().nullable().optional(),
  appointment_id: z.string().uuid().nullable().optional(),
  work_order_id: z.string().uuid().nullable().optional(),
  internal_notes: z.string().trim().max(10000).nullable().optional(),
  preserve_quote_description: z.boolean().default(true),
  expected_quote_updated_at: z.string().datetime().nullable().optional(),
});
```

The browser must not submit authoritative customer, vehicle, price, tax, or quote-item data. Those values are read and calculated by the server from the locked quote and its items.

### Response contract

```ts
export const quoteConversionResponseSchema = z.object({
  data: z.object({
    conversion_id: z.string().uuid(),
    quote_id: z.string().uuid(),
    service_record_id: z.string().uuid(),
    status: z.literal("converted"),
    totals: z.object({
      subtotal: z.number(),
      tax_amount: z.number(),
      discount_amount: z.number(),
      total_amount: z.number(),
      currency_code: z.string().length(3),
    }),
    line_item_count: z.number().int().nonnegative(),
  }),
});
```

### Route behavior

1. Parse JSON with the request schema and reject unknown fields through a strict object policy if the project’s Zod conventions permit it.
2. Call `requireWorkspaceMember(workspace_id, ["owner", "admin", "manager", "service_advisor"])`.
3. Validate the route `id` as a UUID and pass the authenticated user ID to the database operation.
4. Call `convert_quote_to_service_record_v1` with only validated options.
5. Normalize database error codes into stable API errors such as `quote_not_found`, `quote_already_converted`, `quote_status_not_convertible`, `quote_changed_refresh_required`, and `conversion_in_progress`.
6. Return the canonical conversion response and never expose raw Postgres errors to the browser.

### API client method

Add this method to `src/lib/nextApiClient.ts`:

```ts
quotes: {
  // existing quote methods remain unchanged
  convert: (quoteId: string, payload: Record<string, unknown>) =>
    request<{ data: unknown }>(
      `/v1/quotes/${encodeURIComponent(quoteId)}/convert`,
      { method: "POST", body: JSON.stringify(payload) },
    ),
},
```

The client should validate the response with `quoteConversionResponseSchema` before returning it to UI code.

## Database operation shape

Prefer a versioned database function behind the API route so the multi-table operation is atomic and independently testable.

```sql
create or replace function public.convert_quote_to_service_record_v1(
  p_workspace_id uuid,
  p_quote_id uuid,
  p_idempotency_key text,
  p_created_by uuid,
  p_service_date date default current_date,
  p_technician_id uuid default null,
  p_appointment_id uuid default null,
  p_work_order_id uuid default null,
  p_internal_notes text default null,
  p_expected_quote_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
-- Pseudocode contract; implement with explicit row locks and exception codes.
-- 1. Assert caller/workspace membership.
-- 2. Lock quote by workspace_id + quote_id.
-- 3. Check expected updated_at if supplied.
-- 4. Return existing successful conversion for an idempotency retry.
-- 5. Reject an already-converted quote.
-- 6. Snapshot quote and quote_items.
-- 7. Insert service_records row with quote_id and normalized totals.
-- 8. Insert labor/part/fee line items into service_record_line_items.
-- 9. Insert quote_conversions row with source snapshots.
-- 10. Update quote status to converted.
-- 11. Return conversion_id, service_record_id, totals, and item count.
$$;
```

The actual SQL must use explicit `raise exception using errcode = 'P0001', message = 'quote_already_converted'` or a project-standard typed error mechanism. Do not return an ambiguous null result for business-rule failures.

## `quotes.command.ts` migration

`createServiceFromQuote` should be replaced with a conversion command that does not accept a `ServiceInsert` object. The command should accept only the quote ID and conversion options.

```ts
export interface ConvertQuoteInput {
  quoteId: string;
  idempotencyKey: string;
  serviceDate?: string;
  technicianId?: string | null;
  appointmentId?: string | null;
  workOrderId?: string | null;
  internalNotes?: string | null;
  expectedQuoteUpdatedAt?: string | null;
}

export async function convertQuoteToServiceRecord(input: ConvertQuoteInput) {
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) {
    return { data: null, error: new Error("Select a workspace before converting a quote.") };
  }

  try {
    const response = await nextApi.quotes.convert(input.quoteId, {
      workspace_id,
      idempotency_key: input.idempotencyKey,
      service_date: input.serviceDate,
      technician_id: input.technicianId ?? null,
      appointment_id: input.appointmentId ?? null,
      work_order_id: input.workOrderId ?? null,
      internal_notes: input.internalNotes ?? null,
      expected_quote_updated_at: input.expectedQuoteUpdatedAt ?? null,
    });
    return { data: response.data, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error("Quote conversion failed."),
    };
  }
}
```

The current `handleConvertToService` in `src/pages/Quotes.tsx` should call this command and stop inserting `labor_items` and `service_items` afterward. The API returns the new service-record ID and line-item count, so the UI only needs to refresh the quote list and show the resulting service record. Any invoice-generation follow-up must be a separate command operating on the new service-record aggregate.

## RLS design

Enable RLS on all new tables. Policies should use the project’s existing workspace-membership helper rather than repeating ad hoc owner checks.

```sql
alter table public.service_record_line_items enable row level security;
alter table public.quote_conversions enable row level security;

create policy service_record_line_items_select_member
on public.service_record_line_items
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy service_record_line_items_write_operator
on public.service_record_line_items
for all to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin','manager','service_advisor']))
with check (public.has_workspace_role(workspace_id, array['owner','admin','manager','service_advisor']));

create policy quote_conversions_select_member
on public.quote_conversions
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy quote_conversions_insert_operator
on public.quote_conversions
for insert to authenticated
with check (public.has_workspace_role(workspace_id, array['owner','admin','manager','service_advisor']));
```

If the project uses different helper names, substitute the existing canonical helper functions. The API route remains mandatory even with RLS because it provides schema validation, stable errors, idempotency handling, and audit semantics.

## Rollout sequence

| Stage | Change | Exit criterion |
|---|---|---|
| 1 | Add workspace ownership to quotes and quote items. | No unmapped rows; RLS policies pass tenant-isolation tests. |
| 2 | Add `service_record_line_items`, `quote_conversions`, and service-record commercial fields. | Migration applies cleanly to a production-shaped database. |
| 3 | Implement the conversion function and route behind a feature flag. | Transaction, duplicate, stale-update, and authorization tests pass. |
| 4 | Add the typed API client and new command. | No quote UI code constructs a legacy `ServiceInsert` for conversion. |
| 5 | Switch Quotes UI to the conversion command. | Conversion creates one service record and all line items in one request. |
| 6 | Migrate readers and reporting. | No active reader requires `labor_items` or `service_items` for converted quotes. |
| 7 | Deprecate legacy writes and then archive old tables. | Repository grep finds no direct conversion writes to `services`. |

## Test plan

### Database and API tests

Test that a member of workspace A cannot convert a quote in workspace B, that a non-operator role is rejected, that an invalid UUID or unknown field is rejected by Zod, and that a stale `expected_quote_updated_at` returns `quote_changed_refresh_required` without writes.

Test successful conversion with zero quote items, labor-only items, parts-only items, mixed items, discounts, tax, and an optional appointment or work-order link. Assert that totals are recalculated server-side and that inventory is not consumed.

Test idempotent retries with the same key return the same conversion, concurrent conversion attempts produce one successful conversion, a second conversion with a different key returns `quote_already_converted`, and a failed transaction leaves no orphaned service record or line items.

### Frontend command tests

Mock `nextApi.quotes.convert`, seed a workspace, and assert that `convertQuoteToServiceRecord` sends only IDs and conversion options. Assert that the command rejects missing workspace context and normalizes API errors without falling back to Supabase writes.

### Journey tests

The Quotes journey should create a quote, convert it, verify the quote status becomes `converted`, verify the service record appears in the service-record view, verify all line items and totals, refresh the page, and confirm no duplicate service record is created. A second user in another workspace must not see the converted record.

## Definition of done

The slice is complete when `quotes.command.ts` contains no direct write to `public.services`, `labor_items`, or `service_items` for quote conversion; the new route is workspace-scoped and strictly validated; the database operation is atomic and idempotent; converted quote data has normalized line items; all new tables have RLS; and the full typecheck, Jest suite, Next.js build, and quote-conversion journey tests pass.
