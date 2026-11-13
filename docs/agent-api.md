# Service Writer Agent API + MCP

Service Writer is built for humans **and** agents. This document is the
contract for the standard external connection: the same shape for every
integrator and every workspace — no per-shop special paths.

Two surfaces, **one contract** (both call the same service layer in
`src/server/agent-api/service.ts`):

| Surface | Base | Transport |
| --- | --- | --- |
| REST | `/api/v1/agent/*` | HTTPS + JSON |
| MCP | `/api/mcp` | Streamable HTTP, JSON-RPC 2.0 (stateless) |

## Authentication — workspace API keys

Every call (REST and MCP) carries a **workspace API key**:

```
Authorization: Bearer sw_live_<secret>
# or
x-api-key: sw_live_<secret>
```

- A key belongs to exactly **one workspace**. The workspace for every
  request is resolved from the key — never from the request. Sending a
  `workspace_id` that disagrees with the key is rejected with
  `403 workspace_mismatch`; a matching or omitted one is fine.
- Only the SHA-256 hash of a key is stored. The raw key is shown **once**,
  when an admin creates it.
- Keys can be scoped, expired, and revoked. A revoked or expired key
  stops working immediately.
- Every write a key performs is attributed: the booking/customer record
  is stamped with the key's `integrator` name and key id, and a row is
  written to the key usage trail (`workspace_api_key_usage`).

### Managing keys (workspace admins, staff session)

```http
GET    /api/v1/agent/keys?workspace_id=<uuid>          → list keys (hashes/prefixes only)
POST   /api/v1/agent/keys                              → create; response contains raw_key ONCE
DELETE /api/v1/agent/keys/<id>?workspace_id=<uuid>     → revoke
```

Create body:

```json
{
  "workspace_id": "…",
  "name": "Front-desk booking agent",
  "integrator": "Acme Integrations",
  "scopes": ["catalog:read", "availability:read", "bookings:create"],
  "expires_at": null
}
```

Key management requires a staff session whose workspace role is `owner`
or `admin`. Key records are additionally protected by RLS
(`is_workspace_admin`), so they are never readable by other roles or by
anon/authenticated clients directly.

### Scopes

| Scope | Grants |
| --- | --- |
| `catalog:read` | Service catalog + booking rules |
| `availability:read` | Availability checks, open slots, capacity |
| `bookings:read` | List/get appointments |
| `bookings:create` | Create bookings (through the canonical booking core) |
| `customers:read` | List customers, customer history |
| `customers:create` | Create customers |
| `vehicles:read` | List/search vehicles |
| `locations:read` | List locations |
| `invoices:read` | List invoices |
| `reports:read` | Revenue summary, booking performance |
| `promotions:read` | List promotions/campaigns |

A call without the required scope returns `403 insufficient_scope`.

## REST endpoints

All responses use the platform envelope: `{ "data": … }` on success,
`{ "error": { "code", "message" } }` on failure.

| Method | Path | Scope | Notes |
| --- | --- | --- | --- |
| GET | `/v1/agent/catalog` | `catalog:read` | Active services with price + duration |
| GET | `/v1/agent/booking-rules` | `catalog:read` | The workspace's own hours, lead time, buffers, slot size, tax, radius, upcoming blackout dates |
| POST | `/v1/agent/availability` | `availability:read` | `{ starts_at }` → one-slot verdict; `{ date }` → the day's open slots |
| GET | `/v1/agent/appointments?from&to&status&limit&offset` | `bookings:read` | |
| GET | `/v1/agent/appointments/:id` | `bookings:read` | Includes linked customer, vehicle, location |
| POST | `/v1/agent/bookings` | `bookings:create` | See below |
| GET | `/v1/agent/customers?search&limit&offset` | `customers:read` | |
| GET | `/v1/agent/customers/:id/history` | `customers:read` | Customer + vehicles + recent appointments/invoices |
| POST | `/v1/agent/customers` | `customers:create` | |
| GET | `/v1/agent/vehicles?search&limit&offset` | `vehicles:read` | |
| GET | `/v1/agent/locations` | `locations:read` | |
| GET | `/v1/agent/invoices?status&limit&offset` | `invoices:read` | |

### Availability semantics

`POST /v1/agent/availability` runs the **same rules the booking core
enforces at write time**, read from the workspace's own settings:
business hours, minimum lead time, blackout dates, buffer-expanded
schedule conflicts, and the service-radius fence (when the workspace
configured a radius and center and the caller supplies
`service_lat`/`service_lng`). Response:

```json
{
  "data": {
    "available": false,
    "violations": ["lead_time"],
    "checks": {
      "business_hours": true,
      "lead_time": false,
      "blackout_date": true,
      "schedule_conflict": true,
      "service_radius": "not_applicable"
    },
    "starts_at": "…", "ends_at": "…", "duration_minutes": 45,
    "timezone": "America/New_York"
  }
}
```

With `{ "date": "2026-11-10", "service_catalog_id": "…" }` instead, the
response lists every open start time for that day (`slots`), each already
run through the full rule check.

### Creating a booking

```http
POST /api/v1/agent/bookings
Authorization: Bearer sw_live_…
```

```json
{
  "customer_id": "…existing customer…",
  "service_catalog_id": "…",
  "starts_at": "2026-11-10T15:00:00Z",
  "location_address": "123 Main St",
  "notes": "Gate code 4417"
}
```

- `customer_id` **or** a `customer` object (created on the fly);
  `vehicle_id` **or** a `vehicle` object, likewise. Creating a booking
  for a new customer exercises an implied customer-create for that
  booking only — the same thing the public booking door does for
  guests. Standalone customer creation still requires
  `customers:create`.
- `ends_at` defaults to `starts_at` + the service's catalog duration.
- **Prices are never caller-set.** The price is the service catalog's
  price and tax follows the workspace's configured tax rate — the
  platform's price-lock rule applies to agent bookings exactly like
  every other door. Extra price fields in the request are ignored.
- Rules are enforced: an unbookable slot returns `409` with the rule
  code (`outside_business_hours`, `lead_time`, `blackout_date`,
  `schedule_conflict`, `outside_service_radius`).
- The created appointment is stamped
  `metadata.integrator`, `metadata.api_key_id`, `metadata.channel = "agent_api"`,
  and the create is recorded in the key usage trail.

## MCP

Endpoint: `POST /api/mcp` with the same API key. Stateless Streamable
HTTP: send JSON-RPC 2.0 messages (`initialize`, `tools/list`,
`tools/call`, `ping`). `tools/list` and `tools/call` require the key;
without one they return JSON-RPC error `-32001`.

Client configuration (any MCP client that supports remote servers with
headers):

```json
{
  "mcpServers": {
    "servicewriter": {
      "type": "http",
      "url": "https://<your-servicewriter-host>/api/mcp",
      "headers": { "Authorization": "Bearer sw_live_…" }
    }
  }
}
```

### Tools (15)

The 12 tools the in-app design advertised
(`src/lib/mcpConnection.ts`) — `list_appointments`, `get_appointment`,
`list_customers`, `get_customer_history`, `list_services`,
`list_vehicles`, `list_locations`, `get_capacity`,
`get_revenue_summary`, `get_booking_performance`, `list_promotions`,
`create_customer` — plus the three the agent contract needs to book
work:

| Tool | Scope | Purpose |
| --- | --- | --- |
| `check_availability` | `availability:read` | Rule-checked slot verdict or a day's open slots |
| `get_booking_rules` | `catalog:read` | The workspace's configured booking rules |
| `create_booking` | `bookings:create` | Create a booking through the canonical core, attributed to the key |

## Document parsing (expense intake)

The `expense-document-parse` Edge Function
(`supabase/functions/expense-document-parse/`) backs the Document
Intake "parse" action. It authenticates either with the caller's
session JWT (the app's `functions.invoke` path) or with a **job-scoped
token** minted server-side for one document
(`src/server/agent-api/job-token.ts`, sent as `x-job-token`). It
downloads the file from the private `document-intake` bucket inside the
function, transcribes audio through an OpenAI-compatible Whisper
endpoint (multipart `formData`, `verbose_json`, word + segment
timestamps), structures the document into the intake `parsed_json`
contract, and updates the `document_intake` row in place
(`parse_status`, `parsed_json`, `confidence`) — the row update is the
only callback; there are no download URLs or webhook job ids.

Function secrets: `EXPENSE_PARSE_AI_API_KEY` (required),
`EXPENSE_PARSE_AI_BASE_URL` (default `https://api.openai.com/v1`),
`EXPENSE_PARSE_WHISPER_MODEL` (default `whisper-1`),
`EXPENSE_PARSE_STRUCTURE_MODEL` (default `gpt-4o-mini`).

## Deployment notes

- The migration `supabase/migrations/20261109000000_workspace_api_keys_v1.sql`
  creates `workspace_api_keys` + `workspace_api_key_usage`. It is
  **additive only** and ships **unapplied** — apply it through the
  normal migration path before creating keys.
- Deploy the `expense-document-parse` Edge Function and set its AI
  secrets for intake parsing to run.
- The in-app MCP connect panel (`src/lib/mcpConnection.ts`) still
  describes the retired Lovable-era OAuth/Supabase-function design.
  Repointing that copy to this key-based `/api/mcp` endpoint is a
  follow-up change, intentionally not bundled here.
