# Service Writer Roadmap — The Million-Dollar Plan

*Written 2026-10-10, after the rescue ship.*

---

## What's Live Now (shipped 2026-10-10)

**Morning: outage fixed.** 3 typecheck errors were blocking all Vercel deploys since Oct 2.
Fixed, pushed, API verified healthy. The "stuck on Loading..." screen is dead —
every API call now has a 15s timeout and failed loads show a retry button.

**Afternoon: the full rescue.** 5 commits pushed:

1. **Backfill production schema** — 245 reverse-engineered migrations + 2 verified
   migrations (8 tables, 32 functions pulled from the real production database).
   The repo can now rebuild the database. This was the existential risk.
2. **Core fixes** — Start Job has a dedicated endpoint with real error messages
   (no more "unexpected error"). Settings toggles actually persist. Fleet bridge
   repaired. Double-booking is impossible at the database level.
3. **Fleet dispatch** — actually works now. Assign jobs to techs, techs see them
   in the tech app, status flows back to the dispatch board.
4. **Google Calendar sync** — appointments sync automatically on create/update/cancel.
   Needs OAuth setup (below) to activate.
5. **Audits** — full forensic audit reports in the repo.

---

## Before You Touch Anything Else

These need to happen in order. Don't skip.

### 1. Apply the functional migrations to production (30 min)
4 migrations exist in the repo but are NOT live in the database:
- `20261010030000_fleet_bridge_workspace_scope.sql` — fleet bridge repair
- `20261010030001_appointments_no_double_booking.sql` — double-booking lock
- `20261010040000_tech_fleet_assignments_rpc.sql` — tech fleet visibility
- `20261010140000_canonical_start_job_rpc.sql` — Start Job endpoint

Run: `supabase db push` from the repo. Or apply them in the Supabase dashboard
SQL editor. Until these are live, fleet dispatch and the new Start Job won't work
in production.

**Do NOT apply the 245 reverse-engineered migrations to production.** They're
marked "VERIFY" — they describe what *should* be there, inferred from code.
Applying them to a live DB that already has these objects could cause conflicts.
They exist so the repo can rebuild from zero, not to run against prod.

### 2. Google OAuth setup (1 hour, one time)
Calendar sync is coded but dormant until you:
1. Google Cloud Console → create OAuth consent screen
2. Create OAuth client → get `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
3. Add authorized redirect: `https://servicewriter.xyz/google-calendar/callback`
   (and the `www.` variant)
4. Set as Supabase edge function secrets: `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI`
5. Deploy: `supabase functions deploy google-calendar-sync`
6. Supabase Dashboard → Auth → enable "Manual Linking"

### 3. Smoke test (30 min)
After the migrations are applied:
- Book a test appointment → Start Job → Complete → Invoice → Payment
- Assign a fleet job → check it appears in the tech app → update status
- Connect Google Calendar → book an appointment → verify it appears

---

## Next 30 Days — Top 10 by Revenue Impact

1. **Onboard 3 pilot shops.** The product works now. Get it in front of operators
   who'll pay. Everything else is secondary to this.
2. **Fix the 47 failing tests.** They're pre-existing, not from the rescue. Triage
   booking/appointments first. A green suite means you can ship fast without fear.
3. **Unify the 3 job tables.** The forensic audit flagged this as the biggest
   structural risk. `appointments`, `work_orders`, `fleet_work_orders` with a
   bridge is fragile. One table with a type column. (1-2 weeks)
4. **Kill the 25 stale test assertions.** Tests asserting fleet dispatch *must throw*
   and Zod errors *must 500* are now wrong. They're noise hiding real failures.
5. **RLS review.** The August audit flagged permissive RLS and anon-callable
   SECURITY DEFINER functions. Still unaddressed. Get a specialist for 1-2 days.
6. **CI gates.** Block merges on typecheck + tests. The Oct 1-2 wave merged without
   gates and that's how we got here.
7. **Tech app polish.** It works, but it's the daily driver for the people doing
   the actual oil changes. Make it fast and offline-tolerant.
8. **Invoice/payment reconciliation.** Verify the money flow end-to-end with real
   Stripe transactions in test mode. One lost payment kills trust.
9. **Customer-facing booking page.** The public booking flow is the top of the
   funnel. Make it load fast and convert.
10. **Decide: workspace-wide calendar sync.** Currently per-user. True workspace
    sync needs a schema change + service-account OAuth. Worth it if dispatchers
    are the buyers.

---

## The Droptop-Killer Differentiators (double down here)

This is what a basic CRUD booking system can't copy:

1. **Vehicle intelligence.** Year/make/model → oil specs (weight, capacity, filter).
   You scraped this data yourself over years. It's the moat. Expand it: transmission
   fluid, coolant, tire specs, service intervals.
2. **Fleet dispatch that works.** Two separate users told you Droptop + ShopMonkey
   can't do this. Dispatch board → tech app → status back → calendar. This is the
   enterprise wedge.
3. **Mobile-first tech workflow.** The tech in the driveway is the user that matters.
   Start Job → checklist → photos → complete → invoice → payment, all from a phone,
   all offline-tolerant.
4. **Honest software.** Settings that actually save. Errors that say what happened.
   No fake "unlimited." Operators deal with enough bullshit from vendors.

---

## What "Make Me a Million Dollars" Actually Takes

The software is no longer the blocker. It was this morning; it isn't now.

The blocker is distribution: 3 pilot shops → 10 → 30. At $200/mo average,
30 shops is $72k/year. At $500/mo for fleet features, 30 shops is $180k/year.
The million comes from the fleet tier — operators running 5+ trucks who'll pay
for dispatch that actually works because their current stack is 3 systems duct-taped
together.

Build the pilot list. The product is ready.
