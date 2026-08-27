# Service Writer In-App Notification and PWA Push Audit

**Date:** 2026-08-27  
**Repository:** `djoreally/ServiceWriterFinal`  
**Production domain:** [www.servicewriter.xyz](https://www.servicewriter.xyz)  
**Deployment commit:** `4c0e57d` — `Repair in-app notification delivery and PWA push`

## Executive conclusion

The Service Writer notification system was audited, repaired, hardened, deployed, and production-verified. The principal duplication and delivery failures were addressed through database-level idempotency, a unified realtime consumer, an authoritative PWA service worker, and a server-side push outbox with retry-safe claims and Web Push delivery.

The final Vercel production redeploy completed successfully with status **Ready**. The live service worker and public VAPID endpoint were both verified after the redeploy. The public endpoint returned the configured public key and did not expose the private key.

## Findings and repairs

| Area | Finding | Repair | Result |
|---|---|---|---|
| Notification persistence | Production notification tables were missing or not authoritative | Added `in_app_notifications` and `tech_push_subscriptions` foundations with workspace/user ownership and lifecycle fields | Notifications have a durable, scoped source of truth |
| Duplicate creation | Retries, repeated effects, and concurrent event handling could insert duplicates | Refactored `createNotification` and wrappers to use conflict-targeted upserts and stable dedupe keys | Repeated delivery attempts converge on one row |
| Realtime UI | Notification consumers could subscribe or reconcile inconsistently | Unified consumption in `src/hooks/useNotifications.ts` | One consistent stream updates the UI and unread state |
| PWA delivery | No canonical production service worker was available | Added `public/sw.js` with install/activate, push, notification-click, and `SKIP_WAITING` handlers | Background notifications can be shown by the PWA |
| VAPID configuration | Public configuration was not safely available to the browser | Added `/api/notifications/push/public-key` same-origin endpoint | Browser receives only the public key |
| Push dispatch | Delivery was not durable or retry-safe | Added `src/server/notifications/push-outbox.ts` with atomic claims, retry handling, and Web Push delivery | Failed sends can be retried without duplicate processing |
| Scheduled processing | No protected worker route existed for the outbox | Added `app/api/internal/notifications/push/outbox/route.ts` and wired it to the Vercel cron worker | Push outbox processing is available to scheduled execution |
| Realtime database delivery | Notification tables were not enabled for Realtime | Enabled Supabase Realtime for the authoritative notification tables | UI consumers can receive updates without polling |

## Production verification

### Deployment

The corrected production redeploy was created from the `main` branch and commit `4c0e57d`. Vercel reported:

- **Environment:** Production
- **Status:** Ready
- **Duration:** 2m 44s
- **Primary domain:** `www.servicewriter.xyz`
- **Deployment alias:** `servicewriter-2qrxna21x-tyreese-burtons-projects.vercel.app`
- **Build result:** Successful; Vercel displayed the deployment as Ready

The build emitted dependency deprecation/security warnings for old transitive packages such as `glob` and `whatwg-encoding`. These warnings did not fail the build and should be addressed during a separate dependency-maintenance pass.

### Service worker

The live URL [https://www.servicewriter.xyz/sw.js](https://www.servicewriter.xyz/sw.js) returned the canonical service worker. The response contains handlers for:

- `install` with `skipWaiting()`;
- `activate` with `clients.claim()`;
- `push` with JSON/text payload parsing and `showNotification()`;
- `notificationclick` with focus/navigation or `openWindow()` fallback; and
- `message` handling for `SKIP_WAITING`.

### Public VAPID endpoint

The live URL [https://www.servicewriter.xyz/api/notifications/push/public-key](https://www.servicewriter.xyz/api/notifications/push/public-key) returned a JSON object containing `publicKey`. No private key, subject, or other secret was included in the response.

### Technician application route

The live `/tech-app` route correctly redirected unauthenticated access to the role-aware Service Writer login page, which exposes the Technician sign-in path. This confirms that the production route is live and protected. An authenticated technician session was not available in the verification browser, so the rendered unread badge and authenticated in-app notification list were not directly inspected in this final pass; the underlying database, realtime, service-worker, and public-key paths were verified.

## Files implemented or verified

| File | Purpose |
|---|---|
| `src/application/commands/notifications.command.ts` | Idempotent notification creation and dedupe behavior |
| `src/hooks/useNotifications.ts` | Unified realtime notification consumer and unread state |
| `public/sw.js` | Canonical PWA push and notification-click handlers |
| `src/server/notifications/push-outbox.ts` | Atomic push outbox claims, Web Push dispatch, and retry behavior |
| `app/api/notifications/push/public-key/route.ts` | Same-origin public VAPID-key response |
| `app/api/internal/notifications/push/outbox/route.ts` | Protected worker endpoint for outbox processing |
| `supabase/migrations/20260827030000_in_app_notifications_foundation.sql` | Notification and technician push-subscription schema foundation |

## Cleanup

The temporary untracked file `/home/ubuntu/verify_email_audit_migration.json` was removed. Tracked repository audit and verification documentation was preserved. The repository working tree was clean during the final inspection.

## Security follow-up

The VAPID private key was shared in the session during configuration. Although it is stored as a protected production environment variable and is never returned by the public endpoint, it should be **rotated at the next operational opportunity**. Generate a new VAPID key pair, update the production `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` values together, redeploy, and invalidate old push subscriptions if required by the chosen rotation policy.

## Operational recommendations

Continue monitoring the push outbox for retry counts, expired subscriptions, and repeated failure reasons. Add an authenticated browser smoke test for the technician role to CI or a protected staging environment so the unread badge and realtime list rendering are covered end to end. Separately, schedule dependency updates for the Vercel build warnings noted above.
