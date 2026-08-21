# ServiceWriter Next API bridge

This directory is the greenfield Next.js server layer for the preserved frontend. It is intentionally separate from the current Vite shell so the UI can be migrated incrementally rather than rewritten under schedule pressure.

## Environment

Copy `.env.example` to `.env.local` for local development. Configure the same variables in the Vercel project environment.

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are safe client configuration values. `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be prefixed with `NEXT_PUBLIC_` or sent to the browser.

## Initial routes

| Route | Methods | Purpose |
|---|---|---|
| `/api/v1/health` | GET | Liveness check. |
| `/api/v1/workspaces` | GET | Current user’s active workspace memberships. |
| `/api/v1/customers` | GET, POST | Tenant-scoped customer search and creation. |
| `/api/v1/vehicles` | GET, POST | Tenant-scoped vehicle search and creation. |
| `/api/v1/appointments` | GET, POST | Tenant-scoped scheduling and basic conflict checking. |
| `/api/v1/work-orders` | GET, POST | Work-order list and creation/conversion. |
| `/api/v1/work-orders/:id` | GET, PATCH | Work-order detail and controlled status/notes updates. |

All authenticated routes resolve the Supabase session from cookies, verify active workspace membership, validate request bodies with Zod, and return a stable `{ data }` or `{ error: { code, message } }` envelope. The API does not trust a workspace ID supplied by the browser without membership verification.

## Migration sequence

1. Keep the current Vite frontend as the visual reference.
2. Connect one low-risk read, such as workspace health or customer search, through `src/lib/nextApiClient.ts`.
3. Replace one command/query pair at a time, beginning with customers and vehicles.
4. Remove the corresponding direct Supabase/legacy function call only after the API route has Jest and browser coverage.
5. Migrate the Next.js app shell after the P0 command surface is stable.

## Vercel deployment

Deploy `apps/web-next` as a Vercel project with the root directory set to `apps/web-next`. The Next.js route handlers run as serverless functions. Use Supabase for persistent state, Auth, Storage, and Realtime. Use a separate queue/worker runtime or scheduled serverless jobs for long-running syncs, reminders, and provider reconciliation; do not depend on a permanently running Express process inside Vercel.
