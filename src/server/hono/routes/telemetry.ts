/**
 * Built-in first-party telemetry (Service Writer's own product analytics).
 *
 * Copied from the MOMS website's first-party telemetry system
 * (momsoilchange.com `POST /api/telemetry` + TelemetrySession /
 * TelemetryEvent) and extended for a multi-tenant signed-in platform.
 * No third-party analytics, no external service, no env key — events land
 * in this app's own database (`public.telemetry_sessions` /
 * `public.telemetry_events`, migration 20261112133000_user_telemetry).
 *
 * Two streams share the store (`stream` column):
 * - 'app'     — signed-in activity. `POST /v1/telemetry/events` requires
 *   auth; the server stamps user id/email from the session and resolves
 *   workspace + role from the caller's own memberships (client-sent
 *   identity is never trusted). Every screen view and meaningful click a
 *   user makes is reconstructable, in order.
 * - 'booking' — the public booking funnel. `POST /v1/telemetry/public-events`
 *   is anonymous (a shop's customers are not signed in); it requires a
 *   real, active workspace_id, validates the payload exactly like the
 *   website route does, and writes through the service-role client.
 *   Identity columns stay null; visitor/session ids carry the journey.
 *
 * Reads are owner-tier only — there is deliberately NO self-read:
 * - workspace owners/admins: `GET /v1/telemetry/users`,
 *   `GET /v1/telemetry/events` (per-user timeline), and
 *   `GET /v1/telemetry/funnel` (conversion, drop-off, lost bookings,
 *   cohorts) — all scoped to a workspace the caller owns/administers.
 * - platform admins (user_roles 'admin'): `GET
 *   /v1/telemetry/platform/user-activity` — cross-platform per-user
 *   timeline.
 * Ordinary signed-in users have no read path at all (API or RLS).
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { ApiError, json } from "@/server/api";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { requireAuth, requireWorkspaceAuth } from "../middleware/auth";
import type { RequestAuthContext } from "../types";

export const telemetryRouter = new Hono();

// The website's allowlist, plus the funnel-native types. The commerce
// events are the point of the booking stream: this taxonomy is shaped
// around customer money psychology, not generic pageviews — which
// services were viewed and at what price, what was compared, where the
// price was shown, how long the payment step held them, and whether
// the journey confirmed or was abandoned (and at which step).
const EVENT_TYPES = [
  "pageview",
  "page_exit",
  "click",
  "outbound_click",
  "cta_click",
  "scroll",
  "engagement",
  "error",
  "funnel_step",
  "conversion",
  // Booking commerce events (properties carry the money context:
  // service id/name, price shown, quote total, slot, add-ons).
  "service_viewed",
  "service_selected",
  "services_compared",
  "time_slot_viewed",
  "time_slot_selected",
  "addons_viewed",
  "addons_selected",
  "price_shown",
  "details_started",
  "details_completed",
  "payment_viewed",
  "payment_started",
  "booking_confirmed",
  "booking_abandoned",
] as const;

/** Canonical booking-funnel order — drop-off is computed against this. */
export const FUNNEL_STEPS = [
  "landing",
  "address",
  "vehicle",
  "service",
  "time",
  "details",
  "payment",
  "confirmed",
] as const;

const FUNNEL_STEP_SET = new Set<string>(FUNNEL_STEPS);

const eventBodySchema = z.object({
  session_id: z.string().trim().min(1).max(200),
  visitor_id: z.string().trim().min(1).max(200).optional(),
  event_type: z.enum(EVENT_TYPES),
  funnel_step: z.string().trim().min(1).max(64).optional(),
  url: z.string().trim().url().max(2000),
  title: z.string().max(1000).optional(),
  occurred_at: z.string().datetime().optional(),
  referrer: z.string().max(2000).optional(),
  target: z.string().max(1000).optional(),
  target_text: z.string().max(1000).optional(),
  x_ratio: z.number().finite().min(0).max(1).optional(),
  y_ratio: z.number().finite().min(0).max(1).optional(),
  scroll_depth: z.number().finite().optional(),
  engaged_ms: z.number().finite().optional(),
  viewport_width: z.number().int().min(0).max(100000).optional(),
  viewport_height: z.number().int().min(0).max(100000).optional(),
  device_class: z.string().trim().max(32).optional(),
  utm: z
    .object({
      source: z.string().max(300).optional().nullable(),
      medium: z.string().max(300).optional().nullable(),
      campaign: z.string().max(300).optional().nullable(),
    })
    .optional(),
  workspace_id: z.string().uuid().optional(),
  // Public booking pages know the shop owner's user id (business profile)
  // before any workspace id; the public route resolves the owned
  // workspace from it server-side.
  owner_user_id: z.string().uuid().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

type EventBody = z.infer<typeof eventBodySchema>;

function browserFamily(ua: string): string {
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\//.test(ua)) return "Opera";
  if (/CriOS|Chrome\//.test(ua)) return "Chrome";
  if (/FxiOS|Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return "Safari";
  return "Other";
}

function clampInt(value: number | undefined, min: number, max: number): number | null {
  if (value === undefined) return null;
  return Math.max(min, Math.min(max, Math.round(value)));
}

async function parseEventBody(c: Context): Promise<EventBody> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new ApiError(400, "Invalid JSON body", "invalid_input");
  }
  const parsed = eventBodySchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(400, "Invalid telemetry event", "invalid_input");
  }
  if (parsed.data.funnel_step !== undefined && !FUNNEL_STEP_SET.has(parsed.data.funnel_step)) {
    throw new ApiError(400, "Unknown funnel step", "invalid_input");
  }
  if (parsed.data.event_type === "funnel_step" && !parsed.data.funnel_step) {
    throw new ApiError(400, "funnel_step is required for funnel_step events", "invalid_input");
  }
  if (parsed.data.event_type === "booking_confirmed" && parsed.data.funnel_step !== "confirmed") {
    throw new ApiError(400, "booking_confirmed must carry funnel_step=confirmed", "invalid_input");
  }
  return parsed.data;
}

type Db = RequestAuthContext["supabase"];

/**
 * Session upsert with the website's create/update semantics, expressed
 * with the PostgREST surface: insert the create-shaped row when the
 * session is new (unique-violation on the PK means it already exists),
 * then always advance last-seen, and maintain the pageview / engaged
 * counters and exit url the way the website's transaction did.
 */
async function recordEvent(
  db: Db,
  stamp: {
    stream: "app" | "booking";
    userId: string | null;
    userEmail: string | null;
    workspaceId: string | null;
    role: string | null;
  },
  body: EventBody,
  userAgent: string,
): Promise<void> {
  const occurredAt = body.occurred_at ? new Date(body.occurred_at) : new Date();
  let path = body.url;
  try {
    path = new URL(body.url).pathname;
  } catch {
    // zod already validated the URL; keep the raw value if parsing fails.
  }
  const browser = browserFamily(userAgent);

  const { error: sessionError } = await db.from("telemetry_sessions").insert({
    id: body.session_id,
    stream: stamp.stream,
    visitor_id: body.visitor_id ?? null,
    user_id: stamp.userId,
    user_email: stamp.userEmail,
    workspace_id: stamp.workspaceId,
    role: stamp.role,
    started_at: occurredAt.toISOString(),
    last_seen_at: occurredAt.toISOString(),
    entry_url: body.url.slice(0, 2000),
    referrer: body.referrer?.slice(0, 1000) ?? null,
    utm_source: body.utm?.source ?? null,
    utm_medium: body.utm?.medium ?? null,
    utm_campaign: body.utm?.campaign ?? null,
    device_class: body.device_class ?? null,
    browser,
    viewport_width: body.viewport_width ?? null,
    viewport_height: body.viewport_height ?? null,
    pageviews: body.event_type === "pageview" ? 1 : 0,
    engaged_ms:
      body.event_type === "engagement" ? (clampInt(body.engaged_ms, 0, 300000) ?? 0) : 0,
  });
  // 23505 = the session row already exists; anything else is a real fault.
  if (sessionError && (sessionError as { code?: string }).code !== "23505") {
    throw sessionError;
  }

  if (!sessionError) {
    // Fresh session — counters already carry this event.
  } else {
    const { data: existing, error: readError } = await db
      .from("telemetry_sessions")
      .select("pageviews, engaged_ms")
      .eq("id", body.session_id)
      .maybeSingle();
    if (readError) throw readError;
    const patch: Record<string, unknown> = {
      last_seen_at: occurredAt.toISOString(),
      browser,
    };
    if (body.event_type === "page_exit") patch.exit_url = body.url.slice(0, 2000);
    if (body.event_type === "pageview") {
      patch.pageviews = Number((existing as { pageviews?: number } | null)?.pageviews ?? 0) + 1;
    }
    if (body.event_type === "engagement") {
      patch.engaged_ms =
        Number((existing as { engaged_ms?: number } | null)?.engaged_ms ?? 0) +
        (clampInt(body.engaged_ms, 0, 300000) ?? 0);
    }
    const { error: updateError } = await db
      .from("telemetry_sessions")
      .update(patch)
      .eq("id", body.session_id);
    if (updateError) throw updateError;
  }

  const { error: eventError } = await db.from("telemetry_events").insert({
    session_id: body.session_id,
    stream: stamp.stream,
    visitor_id: body.visitor_id ?? null,
    user_id: stamp.userId,
    user_email: stamp.userEmail,
    workspace_id: stamp.workspaceId,
    role: stamp.role,
    event_type: body.event_type,
    funnel_step: body.funnel_step ?? null,
    url: body.url.slice(0, 2000),
    path: path.slice(0, 1000),
    title: body.title?.slice(0, 300) ?? null,
    occurred_at: occurredAt.toISOString(),
    referrer: body.referrer?.slice(0, 1000) ?? null,
    target: body.target?.slice(0, 300) ?? null,
    target_text: body.target_text?.slice(0, 120) ?? null,
    x_ratio: body.x_ratio ?? null,
    y_ratio: body.y_ratio ?? null,
    scroll_depth: clampInt(body.scroll_depth, 0, 100),
    engaged_ms: clampInt(body.engaged_ms, 0, 300000),
    viewport_width: body.viewport_width ?? null,
    viewport_height: body.viewport_height ?? null,
    metadata: body.metadata ?? null,
  });
  if (eventError) throw eventError;
}

// ---------------------------------------------------------------------------
// Ingest — signed-in app stream
// ---------------------------------------------------------------------------

telemetryRouter.post("/v1/telemetry/events", async (c: Context) => {
  const { supabase, user } = await requireAuth(c);
  const body = await parseEventBody(c);

  // Workspace + role are resolved from the caller's own active
  // memberships — the same resolution /v1/workspace-context uses. A
  // client-sent workspace_id is a hint, honored only when it names one
  // of those memberships.
  const { data: memberships, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("workspace_id", { ascending: true });
  if (error) throw error;
  const active = (memberships ?? []) as Array<{ workspace_id: string; role: string }>;
  const chosen =
    (body.workspace_id
      ? active.find((membership) => membership.workspace_id === body.workspace_id)
      : undefined) ?? active[0];

  await recordEvent(
    supabase as Db,
    {
      stream: "app",
      userId: user.id,
      userEmail: typeof user.email === "string" ? user.email : null,
      workspaceId: chosen?.workspace_id ?? null,
      role: chosen?.role ?? null,
    },
    body,
    c.req.header("user-agent") ?? "",
  );
  return json({ ok: true });
});

// ---------------------------------------------------------------------------
// Ingest — public booking funnel stream (anonymous)
// ---------------------------------------------------------------------------

telemetryRouter.post("/v1/telemetry/public-events", async (c: Context) => {
  const body = await parseEventBody(c);
  if (!body.workspace_id && !body.owner_user_id) {
    throw new ApiError(400, "workspace_id or owner_user_id is required", "invalid_input");
  }

  const supabase = createSupabaseAdminClient() as unknown as Db;

  let workspaceId = body.workspace_id ?? null;
  if (!workspaceId && body.owner_user_id) {
    // The owned workspace of the shop owner (same resolution the
    // platform router uses for owner-addressed reads): lowest
    // workspace_id wins, deterministically.
    const { data: owned, error: ownedError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", body.owner_user_id)
      .eq("role", "owner")
      .eq("is_active", true)
      .order("workspace_id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (ownedError) throw ownedError;
    workspaceId = (owned as { workspace_id: string } | null)?.workspace_id ?? null;
    if (!workspaceId) throw new ApiError(404, "Workspace not found", "not_found");
  }

  const { data: workspace, error } = await supabase
    .from("workspaces")
    .select("id, is_active")
    .eq("id", workspaceId as string)
    .maybeSingle();
  if (error) throw error;
  if (!workspace || !(workspace as { is_active?: boolean }).is_active) {
    throw new ApiError(404, "Workspace not found", "not_found");
  }

  await recordEvent(
    supabase,
    {
      stream: "booking",
      userId: null,
      userEmail: null,
      workspaceId,
      role: null,
    },
    body,
    c.req.header("user-agent") ?? "",
  );
  return json({ ok: true });
});

// ---------------------------------------------------------------------------
// Reads — workspace owners/admins
// ---------------------------------------------------------------------------

const workspaceQuerySchema = z.object({
  workspace_id: z.string().uuid(),
});

telemetryRouter.get("/v1/telemetry/users", async (c: Context) => {
  const parsed = workspaceQuerySchema.safeParse({ workspace_id: c.req.query("workspace_id") });
  if (!parsed.success) throw new ApiError(400, "Invalid workspace_id", "invalid_workspace");
  const { supabase } = await requireWorkspaceAuth(c, parsed.data.workspace_id, ["owner", "admin"]);

  const { data, error } = await supabase
    .from("telemetry_sessions")
    .select("user_id, user_email, role, pageviews, last_seen_at")
    .eq("workspace_id", parsed.data.workspace_id)
    .eq("stream", "app")
    .order("last_seen_at", { ascending: false })
    .limit(2000);
  if (error) throw error;

  const byUser = new Map<
    string,
    { user_id: string; user_email: string | null; role: string | null; sessions: number; pageviews: number; last_seen_at: string }
  >();
  for (const row of (data ?? []) as Array<{
    user_id: string | null;
    user_email: string | null;
    role: string | null;
    pageviews: number | null;
    last_seen_at: string;
  }>) {
    if (!row.user_id) continue;
    const current = byUser.get(row.user_id);
    if (current) {
      current.sessions += 1;
      current.pageviews += Number(row.pageviews ?? 0);
      if (row.last_seen_at > current.last_seen_at) current.last_seen_at = row.last_seen_at;
    } else {
      byUser.set(row.user_id, {
        user_id: row.user_id,
        user_email: row.user_email,
        role: row.role,
        sessions: 1,
        pageviews: Number(row.pageviews ?? 0),
        last_seen_at: row.last_seen_at,
      });
    }
  }
  return json({ data: [...byUser.values()] });
});

const eventsQuerySchema = z.object({
  workspace_id: z.string().uuid(),
  user_id: z.string().uuid().optional(),
  session_id: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
});

telemetryRouter.get("/v1/telemetry/events", async (c: Context) => {
  const parsed = eventsQuerySchema.safeParse({
    workspace_id: c.req.query("workspace_id"),
    user_id: c.req.query("user_id"),
    session_id: c.req.query("session_id"),
    limit: c.req.query("limit"),
  });
  if (!parsed.success) throw new ApiError(400, "Invalid query", "invalid_input");
  const { supabase } = await requireWorkspaceAuth(c, parsed.data.workspace_id, ["owner", "admin"]);

  let query = supabase
    .from("telemetry_events")
    .select(
      "id, session_id, user_id, user_email, role, event_type, funnel_step, url, path, title, occurred_at, target, target_text, scroll_depth, engaged_ms, metadata",
    )
    .eq("workspace_id", parsed.data.workspace_id)
    .order("occurred_at", { ascending: true })
    .limit(parsed.data.limit);
  if (parsed.data.user_id) query = query.eq("user_id", parsed.data.user_id);
  if (parsed.data.session_id) query = query.eq("session_id", parsed.data.session_id);
  const { data, error } = await query;
  if (error) throw error;
  return json({ data: data ?? [] });
});

// ---------------------------------------------------------------------------
// Reads — booking funnel analytics (workspace owners/admins)
// ---------------------------------------------------------------------------

const funnelQuerySchema = z.object({
  workspace_id: z.string().uuid(),
  days: z.coerce.number().int().min(1).max(365).default(30),
});

interface FunnelSessionRow {
  id: string;
  visitor_id: string | null;
  started_at: string;
  last_seen_at: string;
  entry_url: string;
  referrer: string | null;
  utm_source: string | null;
  pageviews: number | null;
  engaged_ms: number | null;
}

function entrySource(session: FunnelSessionRow): string {
  if (session.utm_source) return session.utm_source;
  if (session.referrer) {
    try {
      return new URL(session.referrer).hostname || "direct";
    } catch {
      return "direct";
    }
  }
  return "direct";
}

function isoWeekKey(iso: string): string {
  const date = new Date(iso);
  const day = (date.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day));
  return monday.toISOString().slice(0, 10);
}

telemetryRouter.get("/v1/telemetry/funnel", async (c: Context) => {
  const parsed = funnelQuerySchema.safeParse({
    workspace_id: c.req.query("workspace_id"),
    days: c.req.query("days"),
  });
  if (!parsed.success) throw new ApiError(400, "Invalid query", "invalid_input");
  const { supabase } = await requireWorkspaceAuth(c, parsed.data.workspace_id, ["owner", "admin"]);

  const since = new Date(Date.now() - parsed.data.days * 24 * 60 * 60 * 1000).toISOString();

  const { data: sessionData, error: sessionError } = await supabase
    .from("telemetry_sessions")
    .select("id, visitor_id, started_at, last_seen_at, entry_url, referrer, utm_source, pageviews, engaged_ms")
    .eq("workspace_id", parsed.data.workspace_id)
    .eq("stream", "booking")
    .gte("started_at", since)
    .order("started_at", { ascending: true })
    .limit(5000);
  if (sessionError) throw sessionError;
  const sessions = (sessionData ?? []) as FunnelSessionRow[];

  const { data: stepData, error: stepError } = await supabase
    .from("telemetry_events")
    .select("session_id, funnel_step, occurred_at")
    .eq("workspace_id", parsed.data.workspace_id)
    .eq("stream", "booking")
    .not("funnel_step", "is", null)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: true })
    .limit(20000);
  if (stepError) throw stepError;

  // Highest funnel step reached per session, in canonical order.
  const maxStepBySession = new Map<string, number>();
  const lastStepBySession = new Map<string, string>();
  for (const row of (stepData ?? []) as Array<{ session_id: string; funnel_step: string | null }>) {
    if (!row.funnel_step) continue;
    const index = (FUNNEL_STEPS as readonly string[]).indexOf(row.funnel_step);
    if (index < 0) continue;
    lastStepBySession.set(row.session_id, row.funnel_step);
    if (index > (maxStepBySession.get(row.session_id) ?? -1)) {
      maxStepBySession.set(row.session_id, index);
    }
  }

  const confirmedIndex = (FUNNEL_STEPS as readonly string[]).indexOf("confirmed");
  const journeys = sessions.filter((session) => maxStepBySession.has(session.id));
  const steps = FUNNEL_STEPS.map((step, index) => {
    const reached = journeys.filter((session) => (maxStepBySession.get(session.id) ?? -1) >= index).length;
    const previous = index === 0 ? reached : journeys.filter((session) => (maxStepBySession.get(session.id) ?? -1) >= index - 1).length;
    return { step, sessions: reached, dropoff_from_previous: index === 0 ? 0 : previous - reached };
  });
  const confirmed = journeys.filter((session) => (maxStepBySession.get(session.id) ?? -1) >= confirmedIndex).length;

  const lostBookings = journeys
    .filter((session) => (maxStepBySession.get(session.id) ?? -1) < confirmedIndex)
    .map((session) => ({
      session_id: session.id,
      visitor_id: session.visitor_id,
      last_step: lastStepBySession.get(session.id) ?? null,
      started_at: session.started_at,
      last_seen_at: session.last_seen_at,
      entry_url: session.entry_url,
      entry_source: entrySource(session),
      pageviews: Number(session.pageviews ?? 0),
      engaged_ms: Number(session.engaged_ms ?? 0),
    }))
    .sort((a, b) => (a.last_seen_at < b.last_seen_at ? 1 : -1))
    .slice(0, 100);

  const cohortMap = new Map<string, { week: string; journeys: number; confirmed: number }>();
  for (const session of journeys) {
    const week = isoWeekKey(session.started_at);
    const cohort = cohortMap.get(week) ?? { week, journeys: 0, confirmed: 0 };
    cohort.journeys += 1;
    if ((maxStepBySession.get(session.id) ?? -1) >= confirmedIndex) cohort.confirmed += 1;
    cohortMap.set(week, cohort);
  }
  const sourceMap = new Map<string, { source: string; journeys: number; confirmed: number }>();
  for (const session of journeys) {
    const source = entrySource(session);
    const bucket = sourceMap.get(source) ?? { source, journeys: 0, confirmed: 0 };
    bucket.journeys += 1;
    if ((maxStepBySession.get(session.id) ?? -1) >= confirmedIndex) bucket.confirmed += 1;
    sourceMap.set(source, bucket);
  }

  return json({
    data: {
      steps,
      totals: {
        journeys: journeys.length,
        confirmed,
        conversion_rate: journeys.length ? confirmed / journeys.length : 0,
      },
      lost_bookings: lostBookings,
      cohorts: {
        by_week: [...cohortMap.values()].sort((a, b) => (a.week < b.week ? -1 : 1)),
        by_source: [...sourceMap.values()].sort((a, b) => b.journeys - a.journeys),
      },
    },
  });
});

// ---------------------------------------------------------------------------
// Reads — service insight (workspace owners/admins): which services
// people look at and do not buy. Aggregated from the commerce events'
// properties payloads: service_viewed / services_compared carry the
// viewed set, service_selected the chosen set, and a session counts as
// bought for a service when it both selected it and confirmed.
// ---------------------------------------------------------------------------

interface ServiceInsightRow {
  service_id: string;
  service_name: string | null;
  price: number | null;
  viewed_sessions: number;
  selected_sessions: number;
  confirmed_sessions: number;
  viewed_not_bought_sessions: number;
}

function servicesFromMetadata(metadata: unknown): Array<{ id: string; name?: string; price?: number }> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const services = (metadata as { services?: unknown }).services;
  if (!Array.isArray(services)) return [];
  const out: Array<{ id: string; name?: string; price?: number }> = [];
  for (const entry of services) {
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as { id?: unknown; name?: unknown; price?: unknown };
    if (typeof candidate.id !== "string" || !candidate.id) continue;
    out.push({
      id: candidate.id,
      name: typeof candidate.name === "string" ? candidate.name : undefined,
      price: typeof candidate.price === "number" ? candidate.price : undefined,
    });
  }
  return out;
}

telemetryRouter.get("/v1/telemetry/services", async (c: Context) => {
  const parsed = funnelQuerySchema.safeParse({
    workspace_id: c.req.query("workspace_id"),
    days: c.req.query("days"),
  });
  if (!parsed.success) throw new ApiError(400, "Invalid query", "invalid_input");
  const { supabase } = await requireWorkspaceAuth(c, parsed.data.workspace_id, ["owner", "admin"]);

  const since = new Date(Date.now() - parsed.data.days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("telemetry_events")
    .select("session_id, event_type, metadata")
    .eq("workspace_id", parsed.data.workspace_id)
    .eq("stream", "booking")
    .in("event_type", ["service_viewed", "services_compared", "service_selected", "booking_confirmed"])
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: true })
    .limit(20000);
  if (error) throw error;

  const viewedBy = new Map<string, Set<string>>();
  const selectedBy = new Map<string, Set<string>>();
  const confirmedSessions = new Set<string>();
  const names = new Map<string, { name: string | null; price: number | null }>();

  for (const row of (data ?? []) as Array<{ session_id: string; event_type: string; metadata: unknown }>) {
    if (row.event_type === "booking_confirmed") {
      confirmedSessions.add(row.session_id);
      continue;
    }
    const bucket =
      row.event_type === "service_selected"
        ? selectedBy
        : row.event_type === "service_viewed" || row.event_type === "services_compared"
          ? viewedBy
          : null;
    if (!bucket) continue;
    for (const service of servicesFromMetadata(row.metadata)) {
      const sessions = bucket.get(service.id) ?? new Set<string>();
      sessions.add(row.session_id);
      bucket.set(service.id, sessions);
      const known = names.get(service.id);
      if (!known || (known.name === null && service.name) || (known.price === null && service.price !== undefined)) {
        names.set(service.id, {
          name: service.name ?? known?.name ?? null,
          price: service.price ?? known?.price ?? null,
        });
      }
    }
  }

  const rows: ServiceInsightRow[] = [];
  for (const [serviceId, viewedSessions] of viewedBy) {
    const selectedSessions = selectedBy.get(serviceId) ?? new Set<string>();
    let confirmedCount = 0;
    for (const sessionId of selectedSessions) {
      if (confirmedSessions.has(sessionId)) confirmedCount += 1;
    }
    rows.push({
      service_id: serviceId,
      service_name: names.get(serviceId)?.name ?? null,
      price: names.get(serviceId)?.price ?? null,
      viewed_sessions: viewedSessions.size,
      selected_sessions: selectedSessions.size,
      confirmed_sessions: confirmedCount,
      viewed_not_bought_sessions: viewedSessions.size - confirmedCount,
    });
  }
  rows.sort((a, b) => b.viewed_sessions - a.viewed_sessions);
  return json({ data: rows.slice(0, 50) });
});

// ---------------------------------------------------------------------------
// Reads — platform admin (cross-platform per-user timeline)
// ---------------------------------------------------------------------------

const platformActivityQuerySchema = z.object({
  user_id: z.string().uuid().optional(),
  user_email: z.string().trim().email().max(320).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
});

telemetryRouter.get("/v1/telemetry/platform/user-activity", async (c: Context) => {
  const parsed = platformActivityQuerySchema.safeParse({
    user_id: c.req.query("user_id"),
    user_email: c.req.query("user_email"),
    limit: c.req.query("limit"),
  });
  if (!parsed.success || (!parsed.data.user_id && !parsed.data.user_email)) {
    throw new ApiError(400, "user_id or user_email is required", "invalid_input");
  }
  const { supabase, user } = await requireAuth(c);
  // Same platform-admin record the platform router checks (user_roles).
  const { data: adminRole, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (roleError) throw roleError;
  if (!adminRole) throw new ApiError(403, "Platform admin access required", "forbidden");

  let query = supabase
    .from("telemetry_events")
    .select(
      "id, session_id, workspace_id, user_id, user_email, role, stream, event_type, funnel_step, url, path, title, occurred_at, target, target_text, scroll_depth, engaged_ms, metadata",
    )
    .order("occurred_at", { ascending: true })
    .limit(parsed.data.limit);
  if (parsed.data.user_id) query = query.eq("user_id", parsed.data.user_id);
  if (parsed.data.user_email) query = query.eq("user_email", parsed.data.user_email);
  const { data, error } = await query;
  if (error) throw error;
  return json({ data: data ?? [] });
});
