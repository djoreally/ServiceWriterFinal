/**
 * PLATFORM domain router (Phase 1 Hono migration).
 *
 * Migrated from:
 * - app/api/v1/health/route.ts (GET, public)
 * - app/api/v1/identity/route.ts (GET, authenticated)
 * - app/api/v1/workspaces/route.ts (GET, authenticated; per-route OPTIONS is
 *   covered by the app-level OPTIONS * handler in app.ts, which returns 204
 *   with the same corsHeaders())
 * - app/api/v1/invitations/route.ts (GET, POST)
 * - app/api/v1/invitations/[id]/route.ts (GET public token lookup, DELETE, POST accept)
 * - app/api/v1/invitations/[id]/resend/route.ts (POST)
 * - app/api/v1/invitations/resolve/route.ts (GET, public token lookup)
 * - app/api/v1/imports/route.ts (GET, POST)
 * - app/api/v1/imports/[id]/route.ts (GET, POST execute/rollback)
 * - app/api/v1/public-booking/[slug]/route.ts (GET, public)
 * - app/api/v1/public-booking/[slug]/confirmation/route.ts (POST, public)
 *
 * New in Phase 2 (no legacy route handler; replaces the client-side
 * workspace god-module `src/application/queries/settings.query.ts`):
 * - /v1/workspace-context (GET, authenticated) — current workspace id +
 *   business settings resolved server-side from the auth token
 * - /v1/workspace-context (PUT, authenticated) — saves business settings
 * - /v1/workspace-context/slug-availability (GET, authenticated)
 *
 * Paths are registered relative to `/api` (the app-level basePath); do not
 * include the `/api` prefix. Public vs authenticated access is preserved
 * exactly per endpoint. `/v1/invitations/resolve` is registered before
 * `/v1/invitations/:id` so the static segment cannot be shadowed.
 *
 * Phase 2 (ServiceWriter application-layer migration): `/v1/platform/*`
 * endpoints below replace direct Supabase access in
 * `src/application/commands/*` and `src/application/queries/*`. Each endpoint
 * replicates the original client-side query logic server-side against the
 * user-scoped client (identical RLS semantics to the browser); the client
 * modules become thin `apiClient` wrappers with byte-identical exports.
 * `selected_workspace_id` is a UI preference hint only — validated against
 * memberships, never used for authorization.
 */
import { createHash, randomBytes } from "node:crypto";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import type { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient, createSupabaseAnonServerClient, supabaseFunctionsBaseUrl, supabasePublishableKey } from "@/lib/supabase";
import { sendInvitationEmail } from "@/server/invitations/mailer";
import { recordOperationalAudit } from "@/server/audit";
import { ApiError, json, paginationSchema } from "@/server/api";
import { accountExportSchema, createImportBatch, executeImportBatch, rollbackImportBatch } from "@/server/accountImport";
import { sendBookingConfirmation } from "@/server/messaging/booking-confirmation";
import { enrollNewsletterFromBooking } from "@/server/crm/newsletter";
import { requireAuth, requireWorkspaceAuth } from "@/server/hono/middleware/auth";
import type { RequestAuthContext } from "@/server/hono/types";
import {
  AUTOMATION_TEMPLATES,
  SAMPLE_PREVIEW_CONTEXT,
  renderTemplate,
} from "@/lib/retention/automation-templates";
import { zonedDateTimeParts, zonedLocalDateTimeToUtc } from "@/server/scheduling/timezone";
import { dollarsToCents as dollarsToCents360, toDollars as toDollars360 } from "@/lib/money";
import type { Cents as Cents360 } from "@/lib/money";

export const platformRouter = new Hono();

// ---------------------------------------------------------------------------
// Health (public)
// ---------------------------------------------------------------------------

platformRouter.get("/v1/health", () => {
  return json({ ok: true, service: "servicewriter-api", version: "v1", timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Identity (authenticated)
// ---------------------------------------------------------------------------

platformRouter.get("/v1/identity", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const [{ data: memberships, error: membershipError }, { data: customerLinks, error: customerError }] = await Promise.all([
    supabase
      .from("workspace_members")
      .select("workspace_id, role, is_active, workspaces(id, name, kind, timezone)")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    supabase
      .from("customer_users")
      .select("workspace_id, customer_id, is_primary, customers(id, first_name, last_name, company_name)")
      .eq("user_id", user.id)
      .order("is_primary", { ascending: false }),
  ]);
  if (membershipError) throw membershipError;
  if (customerError) throw customerError;
  return json({
    data: {
      user: { id: user.id, email: user.email ?? null },
      memberships: memberships ?? [],
      customer_links: customerLinks ?? [],
    },
  });
});

// ---------------------------------------------------------------------------
// Workspaces (authenticated)
// ---------------------------------------------------------------------------

platformRouter.get("/v1/workspaces", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id,role,is_active,workspaces(id,name,slug,kind,timezone,currency_code,is_active)")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("workspace_id", { ascending: true });
  if (error) throw error;
  return json({ data: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
});

// ---------------------------------------------------------------------------
// Workspace context (authenticated)
//
// Server-side resolution of the "current workspace" plus its business
// settings — the counterpart of the client-side god-module
// `src/application/queries/settings.query.ts`. The workspace is resolved
// from the authenticated user's memberships (mirroring the historical
// client logic: first active membership, or the requested one when it is an
// active membership of the caller). `selected_workspace_id` is a UI
// preference hint only — it is validated against memberships and never
// grants access on its own.
// ---------------------------------------------------------------------------

const workspaceContextQuerySchema = z.object({
  selected_workspace_id: z.string().uuid().optional(),
});

type WorkspaceMembershipRow = {
  workspace_id: string;
  role: string;
  is_active: boolean;
  workspaces: {
    id: string;
    name: string;
    slug: string;
    kind: string;
    timezone: string;
    currency_code: string;
    is_active: boolean;
  } | null;
};

async function resolveWorkspaceIdForUser(
  supabase: RequestAuthContext["supabase"],
  userId: string,
  selectedWorkspaceId?: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id,role,is_active,workspaces(id,name,slug,kind,timezone,currency_code,is_active)")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("workspace_id", { ascending: true });
  if (error) throw error;
  const active = ((data ?? []) as unknown as WorkspaceMembershipRow[]).filter(
    (membership) => membership.is_active && membership.workspaces?.is_active,
  );
  if (selectedWorkspaceId) {
    const selected = active.find((membership) => membership.workspace_id === selectedWorkspaceId);
    if (selected) return selected.workspace_id;
  }
  return active[0]?.workspace_id ?? null;
}

const DEFAULT_WORKSPACE_CONTEXT_PROFILE = {
  business_name: "",
  owner_name: "",
  phone: "",
  email: "",
  address: "",
  logo_url: "",
  terminology: { customer: "Customer", vehicle: "Vehicle", service: "Service", quote: "Quote" },
  date_format: "MM/DD/YYYY hh:mm A",
  timezone: "America/New_York",
  currency: "USD",
  opening_time: "09:00",
  closing_time: "17:00",
  working_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  booking_slug: "",
  service_radius_miles: 25,
  service_address: "",
  service_coordinates: null as { lat: number; lng: number } | null,
};

const businessSettingsSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  business_name: z.string(),
  owner_name: z.string(),
  phone: z.string(),
  email: z.string(),
  address: z.string(),
  logo_url: z.string(),
  terminology: z.object({
    customer: z.string(),
    vehicle: z.string(),
    service: z.string(),
    quote: z.string(),
  }),
  date_format: z.string(),
  timezone: z.string(),
  currency: z.string(),
  opening_time: z.string(),
  closing_time: z.string(),
  working_days: z.array(z.string()),
  booking_slug: z.string(),
  service_radius_miles: z.number(),
  service_address: z.string(),
  service_coordinates: z.object({ lat: z.number(), lng: z.number() }).nullable(),
});

const workspaceContextResponseSchema = z.object({
  workspaceId: z.string().uuid().nullable(),
  businessSettings: businessSettingsSchema.nullable(),
});

function readOperationalObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function parseContextTerminology(value: unknown): { customer: string; vehicle: string; service: string; quote: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_WORKSPACE_CONTEXT_PROFILE.terminology;
  const raw = value as Record<string, unknown>;
  return {
    customer: typeof raw.customer === "string" ? raw.customer : "Customer",
    vehicle: typeof raw.vehicle === "string" ? raw.vehicle : "Vehicle",
    service: typeof raw.service === "string" ? raw.service : "Service",
    quote: typeof raw.quote === "string" ? raw.quote : "Quote",
  };
}

function buildContextAddress(settings: {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  region?: string | null;
  postal_code?: string | null;
} | null): string {
  return [settings?.address_line1, settings?.address_line2, settings?.city, settings?.region, settings?.postal_code]
    .filter(Boolean)
    .join(", ");
}

async function loadBusinessSettingsForWorkspace(
  supabase: RequestAuthContext["supabase"],
  userId: string,
  workspaceId: string,
): Promise<z.infer<typeof businessSettingsSchema> | null> {
  const [{ data: workspace, error: workspaceError }, { data: settings, error: settingsError }] = await Promise.all([
    supabase.from("workspaces").select("id, name, slug, timezone, currency_code").eq("id", workspaceId).maybeSingle(),
    supabase.from("workspace_settings").select("*").eq("workspace_id", workspaceId).maybeSingle(),
  ]);
  if (workspaceError) throw workspaceError;
  if (settingsError) throw settingsError;
  if (!workspace) return null;

  const operational = readOperationalObject(settings?.operational_settings);
  const coordinates = readOperationalObject(operational.service_coordinates);
  const lat = Number(coordinates.lat);
  const lng = Number(coordinates.lng);
  const serviceCoordinates = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  const defaults = DEFAULT_WORKSPACE_CONTEXT_PROFILE;

  return businessSettingsSchema.parse({
    id: workspaceId,
    user_id: userId,
    business_name: workspace.name || "",
    owner_name: settings?.owner_name || "",
    phone: settings?.phone || "",
    email: settings?.email || "",
    address: buildContextAddress(settings),
    logo_url: settings?.logo_url || "",
    terminology: parseContextTerminology(settings?.terminology),
    date_format: typeof operational.date_format === "string" ? operational.date_format : defaults.date_format,
    timezone: workspace.timezone || (typeof operational.timezone === "string" ? operational.timezone : defaults.timezone),
    currency: workspace.currency_code || (typeof operational.currency === "string" ? operational.currency : defaults.currency),
    opening_time: settings?.opening_time || defaults.opening_time,
    closing_time: settings?.closing_time || defaults.closing_time,
    working_days: Array.isArray(settings?.working_days) ? settings.working_days : defaults.working_days,
    booking_slug: settings?.booking_slug || workspace.slug || "",
    service_radius_miles: Number(settings?.service_radius_miles ?? defaults.service_radius_miles),
    service_address: typeof operational.service_address === "string" ? operational.service_address : buildContextAddress(settings),
    service_coordinates: serviceCoordinates,
  });
}

const saveWorkspaceContextSchema = z.object({
  selected_workspace_id: z.string().uuid().optional(),
  slug: z.string().trim().toLowerCase().min(1).max(120),
  profile: businessSettingsSchema.omit({ id: true, user_id: true }),
});

// Registered before the bare `/v1/workspace-context` GET so the static
// segment cannot be shadowed by a future parameterized sibling.
platformRouter.get("/v1/workspace-context/slug-availability", async (c) => {
  const url = new URL(c.req.url);
  const slug = z.string().trim().toLowerCase().min(1).max(120).parse(url.searchParams.get("slug") ?? "");
  const { selected_workspace_id } = workspaceContextQuerySchema.parse(Object.fromEntries(url.searchParams));
  const { supabase, user } = await requireAuth(c);
  const workspaceId = await resolveWorkspaceIdForUser(supabase, user.id, selected_workspace_id);
  if (!workspaceId) return json({ available: null });
  const [{ data: workspaceMatch, error: workspaceError }, { data: settingsMatch, error: settingsError }] = await Promise.all([
    supabase.from("workspaces").select("id").eq("slug", slug).neq("id", workspaceId).limit(1),
    supabase.from("workspace_settings").select("workspace_id").eq("booking_slug", slug).neq("workspace_id", workspaceId).limit(1),
  ]);
  if (workspaceError || settingsError) return json({ available: null });
  return json({ available: !(workspaceMatch?.length || settingsMatch?.length) });
});

platformRouter.get("/v1/workspace-context", async (c) => {
  const url = new URL(c.req.url);
  const { selected_workspace_id } = workspaceContextQuerySchema.parse(Object.fromEntries(url.searchParams));
  const { supabase, user } = await requireAuth(c);
  const workspaceId = await resolveWorkspaceIdForUser(supabase, user.id, selected_workspace_id);
  if (!workspaceId) return json(workspaceContextResponseSchema.parse({ workspaceId: null, businessSettings: null }));
  const businessSettings = await loadBusinessSettingsForWorkspace(supabase, user.id, workspaceId);
  return json(workspaceContextResponseSchema.parse({ workspaceId, businessSettings }));
});

platformRouter.put("/v1/workspace-context", async (c) => {
  const { selected_workspace_id, slug, profile } = saveWorkspaceContextSchema.parse(await c.req.json());
  const { supabase, user } = await requireAuth(c);
  const workspaceId = await resolveWorkspaceIdForUser(supabase, user.id, selected_workspace_id);
  if (!workspaceId) throw new ApiError(400, "No active workspace", "no_workspace");

  const { data: existingSettings, error: readError } = await supabase
    .from("workspace_settings")
    .select("operational_settings")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (readError) throw readError;

  const operational = {
    ...readOperationalObject(existingSettings?.operational_settings),
    date_format: profile.date_format,
    timezone: profile.timezone,
    currency: profile.currency,
    service_address: profile.service_address,
    service_coordinates: profile.service_coordinates,
  };

  const { error: workspaceError } = await supabase.from("workspaces").update({
    name: profile.business_name,
    slug,
    timezone: profile.timezone || DEFAULT_WORKSPACE_CONTEXT_PROFILE.timezone,
    currency_code: profile.currency || DEFAULT_WORKSPACE_CONTEXT_PROFILE.currency,
  }).eq("id", workspaceId);
  if (workspaceError?.code === "23505") throw new ApiError(409, "This booking link is already taken. Please choose another.", "slug_taken");
  if (workspaceError) throw workspaceError;

  const { error: settingsError } = await supabase.from("workspace_settings").update({
    owner_name: profile.owner_name || null,
    phone: profile.phone || null,
    email: profile.email || null,
    logo_url: profile.logo_url || null,
    terminology: profile.terminology,
    opening_time: profile.opening_time || null,
    closing_time: profile.closing_time || null,
    working_days: profile.working_days,
    booking_slug: slug || null,
    service_radius_miles: profile.service_radius_miles,
    operational_settings: operational,
  }).eq("workspace_id", workspaceId);
  if (settingsError?.code === "23505") throw new ApiError(409, "This booking link is already taken. Please choose another.", "slug_taken");
  if (settingsError) throw settingsError;

  return json({ success: true });
});

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

const invitationRole = z.enum(["owner", "admin", "manager", "service_advisor", "technician", "dispatcher", "receptionist", "fleet_manager", "viewer", "customer"]);
const createInvitationSchema = z.object({
  workspace_id: z.string().uuid(),
  invited_email: z.string().trim().toLowerCase().email(),
  invited_role: invitationRole,
  customer_id: z.string().uuid().optional(),
  expires_in_days: z.coerce.number().int().min(1).max(30).default(7),
});

const invitationSelect = "id,workspace_id,customer_id,invited_email,invited_role,expires_at,accepted_at,accepted_by,revoked_at,created_by,created_at,updated_at";
const digest = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");
const exposeToken = process.env.INVITATION_EXPOSE_RAW_TOKEN === "true" && process.env.NODE_ENV !== "production";

async function assertSendRateLimit(supabase: RequestAuthContext["supabase"], workspaceId: string, email: string) {
  const now = Date.now();
  const { data, error } = await supabase
    .from("invitation_delivery_attempts")
    .select("id,created_at")
    .eq("workspace_id", workspaceId)
    .ilike("invited_email", email)
    .gte("created_at", new Date(now - 3_600_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  const attempts = data ?? [];
  if (attempts.length >= 5) throw new ApiError(429, "Invitation delivery rate limit exceeded for this email and workspace.", "rate_limited");
  if (attempts.some((attempt) => now - new Date(attempt.created_at).getTime() < 60_000)) throw new ApiError(429, "Please wait at least one minute before sending another invitation to this email.", "cooldown_active");
}

async function recordDeliveryAttempt(input: {
  workspaceId: string;
  invitationId: string;
  email: string;
  actorUserId: string;
  provider: string;
  providerMessageId?: string;
  status: "accepted" | "failed";
}) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("invitation_delivery_attempts").insert({
    workspace_id: input.workspaceId,
    invitation_id: input.invitationId,
    invited_email: input.email,
    actor_user_id: input.actorUserId,
    provider: input.provider,
    provider_message_id: input.providerMessageId ?? null,
    status: input.status,
  });
  if (error) throw error;
}

platformRouter.get("/v1/invitations", async (c) => {
  const url = new URL(c.req.url);
  const workspaceId = url.searchParams.get("workspace_id");
  if (!workspaceId) return json({ error: { code: "missing_workspace", message: "workspace_id is required" } }, { status: 400 });
  const { supabase } = await requireWorkspaceAuth(c, workspaceId, ["owner", "admin"]);
  const { limit, offset } = paginationSchema.parse(Object.fromEntries(url.searchParams));
  const { data, error } = await supabase.from("invitations").select(invitationSelect).eq("workspace_id", workspaceId).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw error;
  return json({ data: data ?? [], pagination: { limit, offset } });
});

platformRouter.post("/v1/invitations", async (c) => {
  const body = createInvitationSchema.parse(await c.req.json());
  const { supabase, user, membership } = await requireWorkspaceAuth(c, body.workspace_id, ["owner", "admin"]);
  if (body.invited_role === "owner" && membership.role !== "owner") {
    throw new ApiError(403, "Only a workspace owner can invite another owner.", "owner_role_required");
  }
  if (body.invited_role === "customer" && !body.customer_id) return json({ error: { code: "customer_required", message: "customer_id is required for customer invitations" } }, { status: 400 });
  await assertSendRateLimit(supabase, body.workspace_id, body.invited_email);
  const { data: existing, error: existingError } = await supabase.from("invitations").select("id").eq("workspace_id", body.workspace_id).ilike("invited_email", body.invited_email).is("accepted_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString()).limit(1);
  if (existingError) throw existingError;
  if (existing?.length) return json({ error: { code: "invitation_pending", message: "An active invitation already exists for this email." } }, { status: 409 });

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + body.expires_in_days * 86_400_000).toISOString();
  const { expires_in_days: _expiresInDays, ...input } = body;
  const { data, error } = await supabase.from("invitations").insert({ ...input, token_hash: digest(token), expires_at: expiresAt, created_by: user.id }).select(invitationSelect).single();
  if (error?.code === "23505") throw new ApiError(409, "An active invitation already exists for this email.", "invitation_pending");
  if (error?.code === "23503" && body.customer_id) throw new ApiError(400, "The customer does not belong to this workspace.", "customer_workspace_mismatch");
  if (error) throw error;

  const { error: eventError } = await supabase.from("invitation_events").insert({ invitation_id: data.id, workspace_id: data.workspace_id, event_type: "created", actor_user_id: user.id, metadata: { invited_role: data.invited_role } });
  if (eventError) throw eventError;
  const admin = createSupabaseAdminClient();
  await recordOperationalAudit({ supabase: admin, request: c.req.raw, workspaceId: data.workspace_id, actorUserId: user.id, action: "invitation.created", entityType: "invitation", entityId: data.id, metadata: { invited_role: data.invited_role } });

  let delivery: { status: "accepted" | "failed"; provider?: string; provider_message_id?: string; error?: string };
  try {
    const result = await sendInvitationEmail({ invitationId: data.id, workspaceId: data.workspace_id, recipientEmail: data.invited_email, role: data.invited_role, token, expiresAt: data.expires_at });
    await recordDeliveryAttempt({ workspaceId: data.workspace_id, invitationId: data.id, email: data.invited_email, actorUserId: user.id, provider: result.providerName, providerMessageId: result.providerMessageId, status: "accepted" });
    delivery = { status: "accepted", provider: result.providerName, provider_message_id: result.providerMessageId };
  } catch (deliveryError) {
    const message = deliveryError instanceof Error ? deliveryError.message : "Invitation delivery failed";
    try {
      await recordDeliveryAttempt({ workspaceId: data.workspace_id, invitationId: data.id, email: data.invited_email, actorUserId: user.id, provider: "supabase_auth", status: "failed" });
    } catch (auditError) {
      console.error("invitation_delivery_audit_failed", auditError instanceof Error ? auditError.message : "unknown error");
    }
    delivery = { status: "failed", provider: "supabase_auth", error: message };
  }
  return json({ data, delivery, ...(exposeToken ? { token } : {}) }, { status: 201 });
});

// Public token lookup by static segment; registered before `/v1/invitations/:id`.
platformRouter.get("/v1/invitations/resolve", async (c) => {
  const token = z.string().trim().min(20).max(200).parse(new URL(c.req.url).searchParams.get("token") ?? "");
  const admin = createSupabaseAdminClient();
  const { data: invitation, error } = await admin
    .from("invitations")
    .select("id,expires_at,accepted_at,revoked_at")
    .eq("token_hash", digest(token))
    .maybeSingle();
  if (error) throw error;
  if (!invitation) throw new ApiError(404, "Invitation not found or token is invalid", "invalid_invitation");
  if (invitation.accepted_at) throw new ApiError(409, "Invitation has already been accepted", "invitation_used");
  if (invitation.revoked_at || new Date(invitation.expires_at).getTime() <= Date.now()) throw new ApiError(410, "Invitation is no longer valid", "invitation_expired");

  return json({ data: { invitation_id: invitation.id } });
});

const invitationIdSchema = z.string().uuid();
const acceptSchema = z.object({ token: z.string().trim().min(20).max(200) });

// Public token-based invitation lookup.
platformRouter.get("/v1/invitations/:id", async (c) => {
  const id = invitationIdSchema.parse(c.req.param("id"));
  const token = new URL(c.req.url).searchParams.get("token") ?? "";
  const parsed = acceptSchema.safeParse({ token });
  if (!parsed.success) throw new ApiError(404, "Invitation not found or token is invalid", "invalid_invitation");

  const admin = createSupabaseAdminClient();
  const { data: invitation, error } = await admin
    .from("invitations")
    .select("id,workspace_id,invited_email,invited_role,expires_at,accepted_at,revoked_at")
    .eq("id", id)
    .eq("token_hash", digest(parsed.data.token))
    .maybeSingle();
  if (error) throw error;
  if (!invitation) throw new ApiError(404, "Invitation not found or token is invalid", "invalid_invitation");
  if (invitation.accepted_at) throw new ApiError(409, "Invitation has already been accepted", "invitation_used");
  if (invitation.revoked_at || new Date(invitation.expires_at).getTime() <= Date.now()) throw new ApiError(410, "Invitation is no longer valid", "invitation_expired");

  const { data: workspace } = await admin.from("workspaces").select("name").eq("id", invitation.workspace_id).maybeSingle();
  return json({
    data: {
      id: invitation.id,
      invited_email: invitation.invited_email,
      invited_role: invitation.invited_role,
      expires_at: invitation.expires_at,
      workspace_name: workspace?.name ?? "Service Writer",
    },
  });
});

platformRouter.delete("/v1/invitations/:id", async (c) => {
  const id = invitationIdSchema.parse(c.req.param("id"));
  const { user } = await requireAuth(c);
  const admin = createSupabaseAdminClient();
  const { data: invitation, error: readError } = await admin
    .from("invitations")
    .select("id,workspace_id,accepted_at,revoked_at")
    .eq("id", id)
    .single();
  if (readError || !invitation) throw new ApiError(404, "Invitation not found", "not_found");

  await requireWorkspaceAuth(c, invitation.workspace_id, ["owner", "admin"]);

  const { data, error } = await admin.rpc("revoke_invitation_v1", {
    p_invitation_id: id,
    p_workspace_id: invitation.workspace_id,
    p_actor_user_id: user.id,
  });
  if (error) {
    if (/not found/i.test(error.message ?? "")) throw new ApiError(404, "Invitation not found", "not_found");
    if (/state changed/i.test(error.message ?? "")) throw new ApiError(409, "Invitation state changed", "invitation_conflict");
    throw error;
  }

  return json({ data });
});

// Public accept (token-bound to the invitation id).
platformRouter.post("/v1/invitations/:id", async (c) => {
  const id = invitationIdSchema.parse(c.req.param("id"));
  const { token } = acceptSchema.parse(await c.req.json());
  const { supabase, user } = await requireAuth(c);
  if (!user.email) throw new ApiError(400, "The authenticated account has no email address", "email_required");

  const { data, error } = await supabase.rpc("accept_invitation_v1", {
    p_invitation_id: id,
    p_token: token,
  });
  if (error) {
    const message = error.message ?? "Invitation could not be accepted";
    if (/already been accepted/i.test(message)) throw new ApiError(409, message, "invitation_used");
    if (/revoked/i.test(message)) throw new ApiError(410, message, "invitation_revoked");
    if (/expired/i.test(message)) throw new ApiError(410, message, "invitation_expired");
    if (/different email/i.test(message)) throw new ApiError(403, message, "invitation_email_mismatch");
    if (/not found|token is invalid/i.test(message)) throw new ApiError(404, message, "invalid_invitation");
    throw error;
  }

  return json({ data });
});

platformRouter.post("/v1/invitations/:id/resend", async (c) => {
  const id = invitationIdSchema.parse(c.req.param("id"));
  const admin = createSupabaseAdminClient();
  const { data: invitation, error: readError } = await admin
    .from("invitations")
    .select("id,workspace_id,customer_id,invited_email,invited_role,expires_at,accepted_at,revoked_at")
    .eq("id", id)
    .single();
  if (readError || !invitation) throw new ApiError(404, "Invitation not found", "not_found");

  const { supabase, user } = await requireWorkspaceAuth(c, invitation.workspace_id, ["owner", "admin"]);
  const { data: attempts, error: attemptsError } = await admin
    .from("invitation_delivery_attempts")
    .select("id,created_at")
    .eq("invitation_id", id)
    .gte("created_at", new Date(Date.now() - 3_600_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(10);
  if (attemptsError) throw attemptsError;
  if ((attempts ?? []).length >= 5) throw new ApiError(429, "Invitation delivery rate limit exceeded", "rate_limited");
  if ((attempts ?? []).some((attempt) => Date.now() - new Date(attempt.created_at).getTime() < 60_000)) throw new ApiError(429, "Please wait at least one minute before resending", "cooldown_active");
  if (invitation.accepted_at) throw new ApiError(409, "Invitation has already been accepted", "invitation_used");
  if (invitation.revoked_at) throw new ApiError(410, "Invitation has been revoked", "invitation_revoked");

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("invitations")
    .update({ token_hash: digest(token), expires_at: expiresAt })
    .eq("id", id)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .select(invitationSelect)
    .single();
  if (error) throw error;

  const { error: eventError } = await supabase.from("invitation_events").insert({
    invitation_id: id,
    workspace_id: data.workspace_id,
    event_type: "resent",
    actor_user_id: user.id,
    metadata: { expires_at: expiresAt },
  });
  if (eventError) throw eventError;

  try {
    const result = await sendInvitationEmail({ invitationId: id, workspaceId: data.workspace_id, recipientEmail: data.invited_email, role: data.invited_role, token, expiresAt });
    await recordDeliveryAttempt({ workspaceId: data.workspace_id, invitationId: id, email: data.invited_email, actorUserId: user.id, provider: result.providerName, providerMessageId: result.providerMessageId, status: "accepted" });
    return json({ data, delivery: { status: "accepted", provider: result.providerName, provider_message_id: result.providerMessageId }, ...(exposeToken ? { token } : {}) });
  } catch (deliveryError) {
    const message = deliveryError instanceof Error ? deliveryError.message : "Invitation delivery failed";
    try {
      await recordDeliveryAttempt({ workspaceId: data.workspace_id, invitationId: id, email: data.invited_email, actorUserId: user.id, provider: "supabase_auth", status: "failed" });
    } catch (auditError) {
      console.error("invitation_delivery_audit_failed", auditError instanceof Error ? auditError.message : "unknown error");
    }
    return json({ data, delivery: { status: "failed", provider: "supabase_auth", error: message } }, { status: 502 });
  }
});

// ---------------------------------------------------------------------------
// Account imports
// ---------------------------------------------------------------------------

const createImportSchema = z.object({
  workspace_id: z.string().uuid(),
  file_name: z.string().trim().min(1).max(255),
  export: accountExportSchema,
});

const importBatchSelect = "id,workspace_id,source_system,source_version,source_file_name,source_sha256,status,dry_run,total_records,imported_records,skipped_records,failed_records,error_summary,created_at,completed_at,rolled_back_at";

platformRouter.get("/v1/imports", async (c) => {
  const url = new URL(c.req.url);
  const workspaceId = z.string().uuid().parse(url.searchParams.get("workspace_id"));
  const pagination = paginationSchema.parse({ limit: url.searchParams.get("limit") || undefined, offset: url.searchParams.get("offset") || undefined });
  const { supabase } = await requireWorkspaceAuth(c, workspaceId, ["owner", "admin"]);
  const { data, error, count } = await supabase.from("account_import_batches").select(importBatchSelect, { count: "exact" }).eq("workspace_id", workspaceId).order("created_at", { ascending: false }).range(pagination.offset, pagination.offset + pagination.limit - 1);
  if (error) throw error;
  return json({ data: data ?? [], meta: { limit: pagination.limit, offset: pagination.offset, total: count ?? 0 } });
});

platformRouter.post("/v1/imports", async (c) => {
  const payload = createImportSchema.parse(await c.req.json());
  const { supabase, user } = await requireWorkspaceAuth(c, payload.workspace_id, ["owner", "admin"]);
  const result = await createImportBatch({ supabase, user: user as unknown as User, workspaceId: payload.workspace_id, fileName: payload.file_name, input: payload.export });
  return json({ data: result.batch, preview: { source_version: result.exportData.exportVersion, sections: Object.fromEntries(Object.entries(result.exportData.data).map(([section, rows]) => [section, rows.length])) } }, { status: 201 });
});

const importIdSchema = z.string().uuid();
const importActionSchema = z.object({ workspace_id: z.string().uuid(), action: z.enum(["execute", "rollback"]), export: accountExportSchema.optional() });

platformRouter.get("/v1/imports/:id", async (c) => {
  const id = importIdSchema.parse(c.req.param("id"));
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id"));
  const { supabase } = await requireWorkspaceAuth(c, workspaceId, ["owner", "admin"]);
  const { data: batch, error } = await supabase.from("account_import_batches").select(importBatchSelect).eq("id", id).eq("workspace_id", workspaceId).single();
  if (error) throw error;
  const { data: records, error: recordsError } = await supabase.from("account_import_records").select("id,source_section,source_id,target_table,target_id,action,status,error_code,error_message,created_at").eq("batch_id", id).eq("workspace_id", workspaceId).order("created_at", { ascending: true }).limit(5000);
  if (recordsError) throw recordsError;
  return json({ data: batch, records: records ?? [] });
});

platformRouter.post("/v1/imports/:id", async (c) => {
  const id = importIdSchema.parse(c.req.param("id"));
  const body = importActionSchema.parse(await c.req.json());
  const { supabase, user } = await requireWorkspaceAuth(c, body.workspace_id, ["owner", "admin"]);
  const { data: batch, error: batchError } = await supabase.from("account_import_batches").select("id,status,source_sha256,workspace_id").eq("id", id).eq("workspace_id", body.workspace_id).single();
  if (batchError || !batch) throw batchError ?? new Error("Import batch not found");
  if (body.action === "rollback") {
    const result = await rollbackImportBatch({ supabase, user: user as unknown as User, batchId: id, workspaceId: body.workspace_id, mappings: new Map() });
    return json({ data: result });
  }
  if (!body.export) return json({ error: { code: "missing_export", message: "The original export is required to execute this batch." } }, { status: 400 });
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(JSON.stringify(body.export)).digest("hex");
  if (hash !== batch.source_sha256) return json({ error: { code: "source_mismatch", message: "The supplied export does not match the staged batch." } }, { status: 409 });
  if (!["staged", "approved"].includes(batch.status)) return json({ error: { code: "invalid_batch_state", message: "This import batch is not executable." } }, { status: 409 });
  await supabase.from("account_import_batches").update({ status: "running", dry_run: false }).eq("id", id).eq("workspace_id", body.workspace_id);
  const result = await executeImportBatch({ supabase, user: user as unknown as User, batchId: id, workspaceId: body.workspace_id, mappings: new Map() }, body.export);
  return json({ data: result });
});

// ---------------------------------------------------------------------------
// Public booking (public)
// ---------------------------------------------------------------------------

const publicBookingSlugSchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i);
const publicBookingQuerySchema = z.object({
  section: z.enum(["profile", "catalog", "packages", "slots", "blocked_dates", "settings"]).default("profile"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const bookingSlugAliases: Readonly<Record<string, string>> = {
  moms: "momsoilchange",
  "moms-mobile-oil-change": "momsoilchange",
};

type RpcRow = Record<string, unknown>;
type Requirement = "basic_vehicle" | "oil_fitment" | "tire_fitment" | "tire_quantity" | "detailing_assessment";

function unavailable() { return new Error("public_booking_unavailable"); }

function canonicalBookingSlug(slug: string): string {
  return bookingSlugAliases[slug.toLowerCase()] ?? slug;
}

function normalizedRequirements(row: RpcRow): Requirement[] {
  const requirements = new Set<Requirement>(["basic_vehicle"]);
  const stored = Array.isArray(row.booking_requirements) ? row.booking_requirements : [];
  for (const requirement of stored) {
    if (["basic_vehicle", "oil_fitment", "tire_fitment", "tire_quantity", "detailing_assessment"].includes(String(requirement))) requirements.add(requirement as Requirement);
  }
  const identity = [row.category_id, row.category, row.name].filter((value): value is string => typeof value === "string").join(" ").toLowerCase().replaceAll("_", " ");
  if (/\b(oil|lube|lubrication|oil fluids?|fluid service)\b/.test(identity)) requirements.add("oil_fitment");
  if (/\b(tire|tires|tyre|wheel|wheels|tpms|rotation)\b/.test(identity)) requirements.add("tire_fitment");
  if (/\b(detail|detailing|wash|ceramic|coating|wax|polish|interior|exterior)\b/.test(identity)) requirements.add("detailing_assessment");
  return Array.from(requirements);
}

function normalizeCatalog(rows: RpcRow[]): RpcRow[] {
  return rows.map((row) => ({ ...row, booking_requirements: normalizedRequirements(row) }));
}

async function profileForSlug(supabase: ReturnType<typeof createSupabaseAdminClient>, slug: string) {
  const { data, error } = await supabase.rpc("get_public_booking_profile_v3", { booking_slug_param: slug });
  if (error || !Array.isArray(data) || data.length === 0) throw unavailable();
  return data[0] as RpcRow;
}

platformRouter.get("/v1/public-booking/:slug", async (c) => {
  try {
    const slug = canonicalBookingSlug(publicBookingSlugSchema.parse(c.req.param("slug")));
    const url = new URL(c.req.url);
    const query = publicBookingQuerySchema.parse({ section: url.searchParams.get("section") ?? undefined, date: url.searchParams.get("date") ?? undefined });
    const supabase = createSupabaseAdminClient();
    const profile = await profileForSlug(supabase, slug);
    const businessUserId = z.string().uuid().parse(profile.user_id);

    if (query.section === "profile") return json({ data: profile }, { headers: { "Cache-Control": "no-store" } });

    if (query.section === "catalog") {
      const v2 = await supabase.rpc("get_public_service_catalog_v2", { p_business_user_id: businessUserId, p_booking_context_id: null });
      if (!v2.error && Array.isArray(v2.data)) return json({ data: normalizeCatalog(v2.data as RpcRow[]) }, { headers: { "Cache-Control": "no-store" } });
      const v1 = await supabase.rpc("get_public_service_catalog", { business_user_id: businessUserId });
      if (v1.error || !Array.isArray(v1.data)) throw unavailable();
      return json({ data: normalizeCatalog(v1.data as RpcRow[]) }, { headers: { "Cache-Control": "no-store" } });
    }

    if (query.section === "packages") {
      const { data, error } = await supabase.rpc("get_public_service_packages", { business_user_id: businessUserId });
      if (error || !Array.isArray(data)) throw unavailable();
      return json({ data }, { headers: { "Cache-Control": "no-store" } });
    }

    if (query.section === "slots") {
      if (!query.date) return json({ error: { code: "invalid_date", message: "date is required for slots" } }, { status: 400 });
      const { data, error } = await supabase.rpc("get_booked_slots", { business_user_id: businessUserId, booking_date: query.date });
      if (error || !Array.isArray(data)) throw unavailable();
      return json({ data }, { headers: { "Cache-Control": "no-store" } });
    }

    if (query.section === "blocked_dates") {
      const db = supabase as any;
      const { data, error } = await db.rpc("get_public_blocked_dates_v2", { p_booking_slug: slug });
      if (error || !Array.isArray(data)) throw unavailable();
      return json({ data }, { headers: { "Cache-Control": "no-store" } });
    }

    const { data, error } = await supabase.rpc("get_public_booking_settings", { p_business_user_id: businessUserId });
    if (error) throw unavailable();
    return json({ data: Array.isArray(data) ? data[0] ?? null : data ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // Domain-specific error mapping, preserved from the original handler.
    // All other errors propagate to the app-level onError -> errorResponse.
    if (error instanceof z.ZodError) return json({ error: { code: "invalid_public_booking_request", message: "Invalid public booking request" } }, { status: 400 });
    if (error instanceof Error && error.message === "public_booking_unavailable") return json({ error: { code: "public_booking_unavailable", message: "This booking page is not currently available." } }, { status: 503 });
    throw error;
  }
});

const confirmationBodySchema = z.object({
  appointment_id: z.string().uuid(),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().max(32).nullable().optional(),
  transactional_sms_consent: z.boolean().optional(),
  marketing_sms_consent: z.boolean().optional(),
  marketing_email_consent: z.boolean().optional(),
  consent_texts: z.object({
    transactional_sms: z.string().max(4000),
    marketing_sms: z.string().max(4000),
    marketing_email: z.string().max(4000),
  }).optional(),
});

/**
 * Public booking confirmation handler, exported separately so the existing
 * jest suite can exercise it directly (same Request-in/Request-out contract
 * the Next.js route had). Registered on the router below.
 */
export async function postPublicBookingConfirmation(request: Request, slug: string) {
  try {
    const parsedSlug = publicBookingSlugSchema.parse(slug);
    const body = confirmationBodySchema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    // Resolve the exact workspace from the canonical booking slug. Booking
    // creation uses this same workspace_settings mapping; selecting an owner's
    // first workspace here breaks confirmation for multi-workspace owners.
    const bookingSettingsResult = await admin.from("workspace_settings")
      .select("workspace_id")
      .eq("booking_slug", parsedSlug)
      .eq("booking_enabled", true)
      .limit(1)
      .single();
    if (bookingSettingsResult.error || !bookingSettingsResult.data?.workspace_id) {
      return json({ error: { code: "booking_unavailable", message: "Booking provider unavailable" } }, { status: 404 });
    }

    const workspaceResult = await admin.from("workspaces")
      .select("id,name,timezone,created_by")
      .eq("id", bookingSettingsResult.data.workspace_id)
      .eq("is_active", true)
      .single();
    if (workspaceResult.error || !workspaceResult.data) {
      return json({ error: { code: "booking_unavailable", message: "Booking provider unavailable" } }, { status: 404 });
    }

    const appointmentResult = await admin.from("appointments")
      .select("id,workspace_id,customer_id,starts_at,ends_at,status,notes,metadata,created_at")
      .eq("id", body.appointment_id)
      .eq("workspace_id", workspaceResult.data.id)
      .single();
    const appointment = appointmentResult.data;
    const boundEmail = String((appointment?.metadata as Record<string, unknown> | null)?.guest_email || "").toLowerCase();
    if (appointmentResult.error || !appointment || boundEmail !== body.email.toLowerCase()) {
      return json({ error: { code: "confirmation_not_found", message: "Booking confirmation not found" } }, { status: 404 });
    }

    const consentRows = [
      { channel: "sms", purpose: "transactional", granted: body.transactional_sms_consent, text: body.consent_texts?.transactional_sms },
      { channel: "sms", purpose: "marketing", granted: body.marketing_sms_consent, text: body.consent_texts?.marketing_sms },
      { channel: "email", purpose: "marketing", granted: body.marketing_email_consent, text: body.consent_texts?.marketing_email },
    ].filter((consent): consent is typeof consent & { granted: boolean } => typeof consent.granted === "boolean");
    for (const consent of consentRows) {
      const evidence = { appointment_id: appointment.id, consent_text: consent.text || null };
      const existing = await admin.from("messaging_consents")
        .select("id")
        .eq("workspace_id", appointment.workspace_id)
        .eq("channel", consent.channel)
        .eq("purpose", consent.purpose)
        .contains("evidence", { appointment_id: appointment.id })
        .maybeSingle();
      const values = {
        workspace_id: appointment.workspace_id,
        customer_id: appointment.customer_id,
        contact_email: body.email.toLowerCase(),
        contact_phone: body.phone || null,
        channel: consent.channel,
        purpose: consent.purpose,
        status: consent.granted ? "granted" : "revoked",
        source: "checkout",
        legal_basis: consent.purpose === "transactional" ? "contract" : "consent",
        consented_at: consent.granted ? new Date().toISOString() : null,
        revoked_at: consent.granted ? null : new Date().toISOString(),
        evidence,
      };
      const consentResult = existing.data?.id
        ? await admin.from("messaging_consents").update(values).eq("id", existing.data.id)
        : await admin.from("messaging_consents").insert(values);
      if (consentResult.error) throw consentResult.error;
    }

    if (body.marketing_email_consent === true) {
      try {
        await enrollNewsletterFromBooking({
          workspaceId: appointment.workspace_id,
          ownerUserId: String(workspaceResult.data.created_by),
          customerId: appointment.customer_id,
          email: body.email,
          bookingSlug: parsedSlug,
          businessName: workspaceResult.data.name,
        });
      } catch (newsletterError) {
        console.error("[Newsletter] booking enrollment failed", newsletterError instanceof Error ? newsletterError.message : "unknown");
      }
    }

    const result = await sendBookingConfirmation({
      appointment,
      workspaceName: workspaceResult.data.name,
      workspaceTimezone: workspaceResult.data.timezone,
      recipientEmail: body.email.toLowerCase(),
      actionUrl: new URL(`/booking/${parsedSlug}/confirmation?appointment_id=${appointment.id}`, request.url).toString(),
    });
    return json({ data: { status: result.status, provider_message_id: result.providerMessageId } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // Domain-specific validation mapping preserved from the original handler.
    // All other errors propagate to the app-level onError -> errorResponse.
    if (error instanceof z.ZodError) return json({ error: { code: "invalid_confirmation_request", message: "Invalid confirmation request" } }, { status: 400 });
    throw error;
  }
}

platformRouter.post("/v1/public-booking/:slug/confirmation", (c) =>
  postPublicBookingConfirmation(c.req.raw, c.req.param("slug")),
);

// ---------------------------------------------------------------------------
// Phase 2 — application-layer migration helpers
//
// Shared helpers for the `/v1/platform/*` endpoints that replace direct
// Supabase access in `src/application/commands/*` and
// `src/application/queries/*`.
// ---------------------------------------------------------------------------

const workspaceHintSchema = z.object({
  selected_workspace_id: z.string().uuid().optional(),
});

/** Read the `selected_workspace_id` UI hint from the query string, if valid. */
function readWorkspaceHint(c: Context): string | undefined {
  const parsed = workspaceHintSchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  return parsed.success ? parsed.data.selected_workspace_id : undefined;
}

/**
 * Authenticated + workspace-resolved request context. Mirrors the historical
 * client flow: `resolveCurrentWorkspace()` (selected membership or first
 * active membership). The user identity comes from the auth token; the hint
 * is validated against memberships and never grants access on its own.
 */
async function requirePlatformWorkspace(c: Context) {
  const { supabase, user } = await requireAuth(c);
  const workspaceId = await resolveWorkspaceIdForUser(supabase, user.id, readWorkspaceHint(c));
  if (!workspaceId) throw new ApiError(400, "No active workspace", "no_workspace");
  return { supabase, user, workspaceId };
}

/**
 * Platform-admin gate. Mirrors the client-side `checkAdminRole` in
 * `src/application/queries/admin-login.query.ts` (same table, same filter).
 */
async function requirePlatformAdmin(c: Context) {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(403, "Platform admin access required", "forbidden");
  return { supabase, user };
}

type EdgeProxyResult =
  | { ok: true; data: unknown }
  | { ok: false; status: number; message: string; detail: string };

type EdgeProxyError = Extract<EdgeProxyResult, { ok: false }>;

/** Explicit type guard for the error variant (keeps narrowing robust). */
function isEdgeError(result: EdgeProxyResult): result is EdgeProxyError {
  return !result.ok;
}

/**
 * Invoke a Supabase edge function server-side with the caller's identity and
 * normalize the result. The client modules that previously called
 * `supabase.functions.invoke(...)` now POST to the per-function proxy
 * endpoints that use this helper, preserving error shapes (including the
 * `edge:<status>:<body>` message contract and the 409-conflict contract).
 */
async function invokeEdgeFunction(
  c: Context,
  functionName: string,
  options: { method?: "POST" | "GET" | "PUT" | "PATCH" | "DELETE"; body?: unknown } = {},
): Promise<EdgeProxyResult> {
  const { supabase } = await requireAuth(c);
  const { data, error } = await supabase.functions.invoke(functionName, {
    method: options.method ?? "POST",
    body: options.body,
  });
  if (error) {
    const status = typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : 502;
    let detail = "";
    const context = (error as { context?: unknown }).context;
    if (context && typeof (context as { text?: unknown }).text === "function") {
      try {
        detail = await (context as Response).text();
      } catch {
        detail = "";
      }
    }
    const message = `edge:${status}:${detail || error.message || "Edge function failed"}`;
    return { ok: false, status, message, detail: detail || error.message || "Edge function failed" };
  }
  return { ok: true, data: data ?? null };
}

function parseJsonLoose(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ---------------------------------------------------------------------------
// Admin — audit logs (migrated from admin-audit.query.ts)
// ---------------------------------------------------------------------------

platformRouter.get("/v1/platform/admin/audit-logs", async (c) => {
  const { action } = z.object({ action: z.string().trim().max(120).optional() })
    .parse(Object.fromEntries(new URL(c.req.url).searchParams));
  const { supabase } = await requirePlatformAdmin(c);
  let query = supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (action && action !== "all") query = query.eq("action", action);
  const { data, error } = await query;
  if (error) throw error;
  return json(data ?? []);
});

// ---------------------------------------------------------------------------
// Admin — Carfax settings (migrated from admin-carfax.command.ts)
// ---------------------------------------------------------------------------

platformRouter.get("/v1/platform/admin/carfax/settings", async (c) => {
  const { supabase } = await requirePlatformAdmin(c);
  const { data, error } = await supabase
    .from("carfax_settings")
    .select("setting_key, setting_value, updated_at")
    .order("setting_key");
  if (error) throw error;
  const settings: Record<string, { value: string; updated_at: string }> = {};
  for (const row of (data ?? []) as Array<{ setting_key: string; setting_value: string; updated_at: string }>) {
    settings[row.setting_key] = { value: row.setting_value, updated_at: row.updated_at };
  }
  return json(settings);
});

platformRouter.get("/v1/platform/admin/carfax/export-stats", async (c) => {
  const { supabase } = await requirePlatformAdmin(c);
  const { data, error } = await supabase
    .from("carfax_export_history")
    .select("exported_at")
    .order("exported_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return json({ lastExportAt: (data?.[0] as { exported_at?: string } | undefined)?.exported_at ?? null });
});

platformRouter.put("/v1/platform/admin/carfax/settings", async (c) => {
  const { enabled } = z.object({ enabled: z.boolean() }).parse(await c.req.json());
  const { supabase } = await requirePlatformAdmin(c);
  const { error } = await supabase
    .from("carfax_settings")
    .upsert({ setting_key: "export_enabled", setting_value: String(enabled) }, { onConflict: "setting_key" });
  if (error) throw error;
  return json({ success: true });
});

// ---------------------------------------------------------------------------
// Admin — access check (migrated from admin-dashboard.query.ts)
// ---------------------------------------------------------------------------

platformRouter.get("/v1/platform/admin/access", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data: roleData, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (error || !roleData) return json({ isAdmin: false, email: "" });
  return json({ isAdmin: true, email: user.email ?? "" });
});

// ---------------------------------------------------------------------------
// Admin — database explorer (migrated from database-explorer.command.ts)
// ---------------------------------------------------------------------------

const databaseExplorerTableSchema = z.object({
  tableName: z.string().trim().min(1).max(120),
});

type UntypedDb = {
  from: (table: string) => {
    select: (cols: string) => {
      limit: (n: number) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
    };
    insert: (row: unknown) => Promise<{ error: { message: string } | null }>;
    update: (patch: unknown) => {
      eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>;
    };
    delete: () => {
      eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>;
    };
  };
};

platformRouter.post("/v1/platform/admin/database-explorer/rows", async (c) => {
  const { tableName, limit } = databaseExplorerTableSchema
    .extend({ limit: z.number().int().min(1).max(1000).default(50) })
    .parse(await c.req.json());
  const { supabase } = await requirePlatformAdmin(c);
  const { data, error } = await (supabase as unknown as UntypedDb).from(tableName).select("*").limit(limit);
  if (error) throw new Error(error.message);
  return json(data ?? []);
});

platformRouter.post("/v1/platform/admin/database-explorer/query", async (c) => {
  const { tableName } = databaseExplorerTableSchema.parse(await c.req.json());
  const { supabase } = await requirePlatformAdmin(c);
  const start = Date.now();
  const { data, error } = await (supabase as unknown as UntypedDb).from(tableName).select("*").limit(100);
  const executionTime = Date.now() - start;
  if (error) throw new Error(error.message);
  return json({ data: data ?? [], executionTime });
});

platformRouter.post("/v1/platform/admin/database-explorer/insert", async (c) => {
  const { tableName, data } = databaseExplorerTableSchema
    .extend({ data: z.record(z.string(), z.unknown()) })
    .parse(await c.req.json());
  const { supabase } = await requirePlatformAdmin(c);
  const { error } = await (supabase as unknown as UntypedDb).from(tableName).insert(data);
  if (error) throw new Error(error.message);
  return json({ success: true });
});

platformRouter.post("/v1/platform/admin/database-explorer/update", async (c) => {
  const { tableName, updates, whereColumn, whereValue } = databaseExplorerTableSchema
    .extend({
      updates: z.record(z.string(), z.unknown()),
      whereColumn: z.string().trim().min(1).max(120),
      whereValue: z.unknown(),
    })
    .parse(await c.req.json());
  const { supabase } = await requirePlatformAdmin(c);
  const { error } = await (supabase as unknown as UntypedDb).from(tableName).update(updates).eq(whereColumn, whereValue);
  if (error) throw new Error(error.message);
  return json({ success: true });
});

platformRouter.post("/v1/platform/admin/database-explorer/delete", async (c) => {
  const { tableName, whereColumn, whereValue } = databaseExplorerTableSchema
    .extend({
      whereColumn: z.string().trim().min(1).max(120),
      whereValue: z.unknown(),
    })
    .parse(await c.req.json());
  const { supabase } = await requirePlatformAdmin(c);
  const { error } = await (supabase as unknown as UntypedDb).from(tableName).delete().eq(whereColumn, whereValue);
  if (error) throw new Error(error.message);
  return json({ success: true });
});

platformRouter.post("/v1/platform/admin/database-explorer/log", async (c) => {
  const { queryType, tableName } = z.object({
    queryType: z.string().trim().min(1).max(40),
    tableName: z.string().trim().min(1).max(120),
  }).parse(await c.req.json());
  const { supabase } = await requirePlatformAdmin(c);
  // Shadow Data Audit Finding #12: never persist raw SQL strings (may contain
  // PII in WHERE clauses) — only the query type and table name.
  const { error } = await supabase.from("audit_logs").insert({
    action: `ADMIN_${queryType}`,
    table_name: tableName,
    new_data: { queryType, tableName, timestamp: new Date().toISOString() },
  } as never);
  if (error) throw error;
  return json({ success: true });
});

platformRouter.post("/v1/platform/admin/database-explorer/ai", async (c) => {
  const { messages, writeEnabled } = z.object({
    messages: z.array(z.object({ role: z.string(), content: z.string() })),
    writeEnabled: z.boolean().optional().default(false),
  }).parse(await c.req.json());
  const { supabase } = await requirePlatformAdmin(c);
  const { data, error } = await supabase.functions.invoke("admin-db-ai", {
    body: { messages, writeEnabled },
  });
  if (error) throw error;
  return json(data ?? null);
});

// ---------------------------------------------------------------------------
// Admin — organization 360 (migrated from admin-organization-360.query.ts)
// ---------------------------------------------------------------------------

interface Organization360FeatureUsage {
  appointments: boolean;
  customers: boolean;
  inventory: boolean;
  reports: boolean;
  newsletter: boolean;
  marketplace: boolean;
}

interface Organization360Profile {
  organizationId: string;
  organizationName: string;
  planName: string;
  mrrCents: Cents360;
  daysActive: number;
  employeeCount: number;
  customerCount: number;
  vehicleCount: number;
  appointmentCount: number;
  completedAppointmentCount: number;
  revenueCents: Cents360;
  featureUsage: Organization360FeatureUsage;
  healthScore: number;
  risk: "Low" | "Medium" | "High";
  lastActiveLabel: string;
  firstValueLabel: string;
  retentionRate: number;
}

function org360DaysBetween(start: string | null, end = new Date()): number {
  if (!start) return 0;
  const startTime = new Date(start).getTime();
  if (!Number.isFinite(startTime)) return 0;
  return Math.max(Math.floor((end.getTime() - startTime) / 86_400_000), 0);
}

function org360FormatLastActive(lastActiveAt: string | null): string {
  if (!lastActiveAt) return "Never";
  const days = org360DaysBetween(lastActiveAt);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function org360FormatFirstValue(createdAt: string | null, firstValueAt: string | null): string {
  if (!createdAt || !firstValueAt) return "Not yet";
  const created = new Date(createdAt).getTime();
  const firstValue = new Date(firstValueAt).getTime();
  if (!Number.isFinite(created) || !Number.isFinite(firstValue) || firstValue < created) return "Not yet";
  const minutes = Math.round((firstValue - created) / 60_000);
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hours`;
  return `${Math.round(hours / 24)} days`;
}

function org360GetRisk(healthScore: number): Organization360Profile["risk"] {
  if (healthScore >= 80) return "Low";
  if (healthScore >= 60) return "Medium";
  return "High";
}

function org360CalculateHealthScore(input: {
  daysSinceActive: number;
  retentionRate: number;
  firstValueLabel: string;
  completedAppointmentCount: number;
  customerCount: number;
  vehicleCount: number;
  revenueCents: Cents360;
  featureUsage: Organization360FeatureUsage;
}): number {
  const featureCount = Object.values(input.featureUsage).filter(Boolean).length;
  let score = 0;
  if (input.daysSinceActive <= 14) score += 20;
  if (input.retentionRate >= 90) score += 20;
  else if (input.retentionRate >= 75) score += 12;
  if (input.firstValueLabel !== "Not yet") score += 15;
  if (input.completedAppointmentCount > 0) score += 15;
  if (input.customerCount > 0 && input.vehicleCount > 0) score += 10;
  if (input.revenueCents > 0) score += 10;
  if (featureCount >= 4) score += 10;
  else if (featureCount >= 2) score += 5;
  return Math.min(score, 100);
}

platformRouter.get("/v1/platform/admin/organization-360", async (c) => {
  const { supabase } = await requirePlatformAdmin(c);
  const db = supabase as any;

  async function countRows(table: string, userId: string): Promise<number> {
    const { count, error } = await db.from(table).select("id", { count: "exact", head: true }).eq("user_id", userId);
    if (error) throw error;
    return count ?? 0;
  }

  const { data: profiles, error } = await db
    .from("business_profiles")
    .select("user_id, business_name, created_at, marketplace_opt_in, marketing_email_enabled")
    .not("business_name", "is", null)
    .neq("business_name", "")
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!profiles?.length) return json([]);

  const results: Organization360Profile[] = await Promise.all(
    (profiles as Array<{
      user_id: string;
      business_name: string | null;
      created_at: string | null;
      marketplace_opt_in: boolean | null;
      marketing_email_enabled: boolean | null;
    }>).map(async (profile) => {
      const userId = profile.user_id;
      const [
        customerCount,
        vehicleCount,
        appointmentCount,
        completedAppointmentCount,
        inventoryCount,
        teamCount,
        invoicesRes,
        lastAppointmentRes,
        firstCompletedRes,
        subscriptionRes,
      ] = await Promise.all([
        countRows("customers", userId),
        countRows("vehicles", userId),
        countRows("appointments", userId),
        (async () => {
          const { count, error: completedError } = await db
            .from("appointments")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("status", "completed");
          if (completedError) throw completedError;
          return completedError ? 0 : (count ?? 0);
        })(),
        countRows("inventory_items", userId),
        db.from("team_user_links").select("id", { count: "exact", head: true }).eq("owner_user_id", userId),
        db.from("invoices").select("total, amount_paid").eq("user_id", userId).is("deleted_at", null),
        db.from("appointments").select("updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        db.from("appointments").select("updated_at, actual_end_time").eq("user_id", userId).eq("status", "completed").order("updated_at", { ascending: true }).limit(1).maybeSingle(),
        db.from("business_subscriptions").select("plan_id, status").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);

      if (teamCount.error) throw teamCount.error;
      if (invoicesRes.error) throw invoicesRes.error;
      if (lastAppointmentRes.error) throw lastAppointmentRes.error;
      if (firstCompletedRes.error) throw firstCompletedRes.error;
      if (subscriptionRes.error) throw subscriptionRes.error;

      let planName = "Free";
      let mrrCents = dollarsToCents360(toDollars360(0));
      if (subscriptionRes.data?.plan_id) {
        const { data: plan, error: planError } = await db
          .from("subscription_plan_templates")
          .select("name, price")
          .eq("id", subscriptionRes.data.plan_id)
          .maybeSingle();
        if (planError) throw planError;
        planName = plan?.name ?? subscriptionRes.data.status ?? "Unknown";
        mrrCents = dollarsToCents360(toDollars360(plan?.price ?? 0));
      }

      const revenueDollars = ((invoicesRes.data ?? []) as Array<{ total?: number | null; amount_paid?: number | null }>).reduce(
        (sum, invoice) => sum + Number(invoice.amount_paid || invoice.total || 0),
        0,
      );
      const revenueCents = dollarsToCents360(toDollars360(revenueDollars));
      const retentionRate = appointmentCount > 0
        ? Math.round((completedAppointmentCount / appointmentCount) * 100)
        : 0;
      const firstValueAt = firstCompletedRes.data?.actual_end_time ?? firstCompletedRes.data?.updated_at ?? null;
      const firstValueLabel = org360FormatFirstValue(profile.created_at, firstValueAt);
      const lastActiveAt = lastAppointmentRes.data?.updated_at ?? profile.created_at ?? null;
      const featureUsage: Organization360FeatureUsage = {
        appointments: appointmentCount > 0,
        customers: customerCount > 0,
        inventory: inventoryCount > 0,
        reports: invoicesRes.data?.length ? true : false,
        newsletter: Boolean(profile.marketing_email_enabled),
        marketplace: Boolean(profile.marketplace_opt_in),
      };
      const healthScore = org360CalculateHealthScore({
        daysSinceActive: org360DaysBetween(lastActiveAt),
        retentionRate,
        firstValueLabel,
        completedAppointmentCount,
        customerCount,
        vehicleCount,
        revenueCents,
        featureUsage,
      });

      return {
        organizationId: userId,
        organizationName: profile.business_name ?? "Unnamed organization",
        planName,
        mrrCents,
        daysActive: org360DaysBetween(profile.created_at),
        employeeCount: (teamCount.count ?? 0) + 1,
        customerCount,
        vehicleCount,
        appointmentCount,
        completedAppointmentCount,
        revenueCents,
        featureUsage,
        healthScore,
        risk: org360GetRisk(healthScore),
        lastActiveLabel: org360FormatLastActive(lastActiveAt),
        firstValueLabel,
        retentionRate,
      };
    }),
  );
  return json(results);
});

// ---------------------------------------------------------------------------
// Platform — stats, users, plans, system health
// (migrated from platform-stats.query.ts, admin-users.command.ts,
//  platform-plans.command.ts, system-health.query.ts)
// ---------------------------------------------------------------------------

platformRouter.get("/v1/platform/stats", async (c) => {
  const { supabase } = await requirePlatformAdmin(c);
  const { data, error } = await (supabase as any).rpc("get_platform_stats");
  if (error) throw error;
  const statsData = data as Partial<{
    usersCount: number;
    vehiclesCount: number;
    servicesCount: number;
    appointmentsCount: number;
    totalRevenue: number;
    shopsCount: number;
  }> | null;
  return json({
    totalUsers: Number(statsData?.usersCount ?? 0),
    totalVehicles: Number(statsData?.vehiclesCount ?? 0),
    totalServices: Number(statsData?.servicesCount ?? 0),
    totalAppointments: Number(statsData?.appointmentsCount ?? 0),
    totalRevenue: Number(statsData?.totalRevenue ?? 0),
    activeShops: Number(statsData?.shopsCount ?? 0),
  });
});

platformRouter.get("/v1/platform/system-health", async (c) => {
  const { supabase } = await requirePlatformAdmin(c);
  // Database probe
  const dbStart = Date.now();
  const { error: dbError } = await (supabase as any).from("platform_settings").select("id").limit(1);
  const databaseLatency = Date.now() - dbStart;

  // Auth probe
  const authStart = Date.now();
  const { error: authError } = await supabase.auth.getUser();
  const authLatency = Date.now() - authStart;

  // Storage probe
  const { data: buckets, error: storageError } = await supabase.storage.listBuckets();

  return json({
    health: {
      database: dbError ? "down" : databaseLatency > 500 ? "degraded" : "healthy",
      auth: authError ? "down" : authLatency > 500 ? "degraded" : "healthy",
      storage: storageError ? "down" : "healthy",
      edgeFunctions: "healthy",
    },
    metrics: {
      databaseLatency,
      authLatency,
      storageUsed: buckets?.length || 0,
      lastChecked: new Date().toISOString(),
    },
  });
});

platformRouter.get("/v1/platform/admin/users", async (c) => {
  const { supabase } = await requirePlatformAdmin(c);
  const { data: profiles, error: profilesError } = await supabase
    .from("business_profiles")
    .select("user_id, business_name, email, created_at, booking_slug, marketplace_opt_in, deleted_at, onboarding_completed")
    .order("created_at", { ascending: false });
  if (profilesError) throw profilesError;
  const profileList = (profiles ?? []) as Array<{
    user_id: string;
    business_name: string | null;
    email: string | null;
    created_at: string;
    booking_slug: string | null;
    marketplace_opt_in: boolean | null;
    deleted_at: string | null;
    onboarding_completed: boolean | null;
  }>;
  const userIds = profileList.map((p) => p.user_id);
  const rolesRes = userIds.length
    ? await supabase.from("user_roles").select("user_id, role").in("user_id", userIds)
    : { data: [] as Array<{ user_id: string; role: string }>, error: null };
  if (rolesRes.error) throw rolesRes.error;
  const roleByUser = new Map<string, string>();
  for (const row of (rolesRes.data ?? []) as Array<{ user_id: string; role: string }>) {
    if (!roleByUser.has(row.user_id)) roleByUser.set(row.user_id, row.role);
  }
  return json(
    profileList.map((profile) => ({
      id: profile.user_id,
      email: profile.email || "",
      created_at: profile.created_at,
      business_name: profile.business_name,
      role: roleByUser.get(profile.user_id) ?? "user",
      booking_slug: profile.booking_slug ?? null,
      marketplace_opt_in: Boolean(profile.marketplace_opt_in),
      deleted_at: profile.deleted_at ?? null,
      onboarding_completed: Boolean(profile.onboarding_completed),
    })),
  );
});

platformRouter.get("/v1/platform/admin/users/:userId/role", async (c) => {
  const userId = z.string().uuid().parse(c.req.param("userId"));
  const { supabase } = await requirePlatformAdmin(c);
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw error;
  return json({ data: (data as { role: string } | null) ?? null });
});

platformRouter.post("/v1/platform/admin/users/:userId/role", async (c) => {
  const userId = z.string().uuid().parse(c.req.param("userId"));
  const { role } = z.object({ role: z.literal("admin") }).parse(await c.req.json());
  const { supabase } = await requirePlatformAdmin(c);
  const { error } = await supabase.from("user_roles").upsert({ user_id: userId, role });
  if (error) throw error;
  return json({ success: true });
});

platformRouter.delete("/v1/platform/admin/users/:userId/role", async (c) => {
  const userId = z.string().uuid().parse(c.req.param("userId"));
  const { supabase } = await requirePlatformAdmin(c);
  const { error } = await supabase
    .from("user_roles")
    .delete()
    .eq("user_id", userId)
    .eq("role", "admin");
  if (error) throw error;
  return json({ success: true });
});

platformRouter.patch("/v1/platform/admin/users/:userId", async (c) => {
  const userId = z.string().uuid().parse(c.req.param("userId"));
  const { marketplace_opt_in, archived, booking_slug } = z.object({
    marketplace_opt_in: z.boolean().optional(),
    archived: z.boolean().optional(),
    booking_slug: z.string().trim().toLowerCase().min(1).max(120).nullable().optional(),
  }).parse(await c.req.json());
  const { supabase } = await requirePlatformAdmin(c);
  if (marketplace_opt_in !== undefined) {
    const { error } = await supabase
      .from("business_profiles")
      .update({ marketplace_opt_in })
      .eq("user_id", userId);
    if (error) throw error;
  }
  if (archived !== undefined) {
    // Archiving also clears marketplace visibility; restoring leaves the
    // flag as-is so admins can re-opt the provider in explicitly.
    const payload: { deleted_at: string | null; marketplace_opt_in?: boolean } = archived
      ? { deleted_at: new Date().toISOString(), marketplace_opt_in: false }
      : { deleted_at: null };
    const { error } = await supabase
      .from("business_profiles")
      .update(payload)
      .eq("user_id", userId);
    if (error) throw error;
  }
  if (booking_slug !== undefined) {
    const slugValue = booking_slug?.trim() ? booking_slug.trim() : null;
    const { error: profileError } = await supabase
      .from("business_profiles")
      .update({ booking_slug: slugValue })
      .eq("user_id", userId);
    if (profileError) throw profileError;
    const { error: settingsError } = await supabase
      .from("workspace_settings")
      .update({ booking_slug: slugValue })
      .eq("user_id", userId);
    if (settingsError) throw settingsError;
  }
  return json({ success: true });
});

platformRouter.get("/v1/platform/plans", async (c) => {
  const { supabase } = await requirePlatformAdmin(c);
  const { data, error } = await supabase
    .from("platform_plans")
    .select("*")
    .order("display_order");
  if (error) throw error;
  return json({ data: data ?? [] });
});

platformRouter.get("/v1/platform/plans/subscription-stats", async (c) => {
  const { supabase } = await requirePlatformAdmin(c);
  const { data, error } = await supabase
    .from("business_subscriptions")
    .select("plan_id, platform_plans!inner(name, price_cents)");
  if (error) throw error;
  return json({ data: data ?? [] });
});

platformRouter.patch("/v1/platform/plans/:id", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const { updates } = z.object({ updates: z.record(z.string(), z.unknown()) }).parse(await c.req.json());
  const { supabase } = await requirePlatformAdmin(c);
  const { error } = await (supabase as any).from("platform_plans").update(updates).eq("id", id);
  if (error) throw error;
  return json({ success: true });
});

// ---------------------------------------------------------------------------
// Automation (migrated from automation-rules.command.ts,
// automation-template.command.ts, automation-executions.query.ts)
//
// The `automation_rules` table uses the *_jsonb column model
// (trigger_jsonb / actions_jsonb / conditions_jsonb / audience_jsonb /
// frequency_guard_jsonb) — see AutomationRulePayload in the original module.
// ---------------------------------------------------------------------------

const automationRulePayloadSchema = z.object({
  user_id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  is_active: z.boolean(),
  priority: z.number().int(),
  trigger_jsonb: z.unknown(),
  actions_jsonb: z.unknown(),
  conditions_jsonb: z.unknown().nullable(),
  audience_jsonb: z.unknown().nullable(),
  frequency_guard_jsonb: z.unknown().nullable(),
});

platformRouter.post("/v1/platform/automation/rules", async (c) => {
  const payload = automationRulePayloadSchema.parse(await c.req.json());
  if (!payload.user_id) throw new ApiError(400, "Not signed in — please refresh and try again.", "unauthenticated");
  const { supabase } = await requirePlatformWorkspace(c);
  const { error } = await supabase.from("automation_rules").insert(payload);
  if (error) throw new Error(error.message);
  return json({ success: true });
});

platformRouter.patch("/v1/platform/automation/rules/:id", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const payload = automationRulePayloadSchema.parse(await c.req.json());
  if (!payload.user_id) throw new ApiError(400, "Not signed in — please refresh and try again.", "unauthenticated");
  const { supabase } = await requirePlatformWorkspace(c);
  const { error } = await supabase.from("automation_rules").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
  return json({ success: true });
});

/**
 * Re-runs the server-side default seeders. Idempotent — the RPCs skip
 * rules/segments already present by name.
 */
platformRouter.post("/v1/platform/automation/rules/seed-defaults", async (c) => {
  const { user_id } = z.object({ user_id: z.string().uuid() }).parse(await c.req.json());
  const { supabase } = await requirePlatformWorkspace(c);
  const db = supabase as unknown as {
    rpc: (fn: string, args: Record<string, string>) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const [rulesRes, segsRes] = await Promise.all([
    db.rpc("seed_default_automation_rules", { p_user_id: user_id }),
    db.rpc("seed_default_customer_segments", { p_user_id: user_id }),
  ]);
  if (rulesRes.error) throw new Error(rulesRes.error.message);
  if (segsRes.error) throw new Error(segsRes.error.message);
  return json({
    rules: (rulesRes.data as number) ?? 0,
    segments: (segsRes.data as number) ?? 0,
    automationRulesInserted: Number(rulesRes.data || 0),
    customerSegmentsInserted: Number(segsRes.data || 0),
  });
});

platformRouter.post("/v1/platform/automation/templates/seed", async (c) => {
  const { user_id, template_id } = z.object({
    user_id: z.string().uuid(),
    template_id: z.string().trim().min(1).max(120),
  }).parse(await c.req.json());
  const { supabase } = await requirePlatformWorkspace(c);
  const template = AUTOMATION_TEMPLATES.find((t) => t.id === template_id);
  if (!template) throw new ApiError(404, `Unknown automation template: ${template_id}`, "not_found");
  const record = {
    user_id,
    name: template.name,
    is_active: true,
    priority: template.priority,
    trigger_jsonb: { type: template.trigger },
    actions_jsonb: template.actions,
    conditions_jsonb: template.conditions ?? null,
    audience_jsonb: template.audience ?? null,
    frequency_guard_jsonb: { min_hours_between: template.cooldownHours },
  };
  const { data, error } = await supabase
    .from("automation_rules")
    .insert(record)
    .select("id, name")
    .single();
  if (error || !data) throw new Error(error?.message || "Failed to seed automation template");
  const row = data as { id: string; name: string };
  return json({ ruleId: row.id, ruleName: row.name });
});

platformRouter.post("/v1/platform/automation/rules/:id/dry-run", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const { user_id, customer_id } = z.object({
    user_id: z.string().uuid(),
    customer_id: z.string().uuid().optional(),
  }).parse(await c.req.json());
  const { supabase, workspaceId } = await requirePlatformWorkspace(c);
  const { data: rule, error } = await supabase
    .from("automation_rules")
    .select("id, name, trigger_jsonb, actions_jsonb")
    .eq("id", id)
    .eq("user_id", user_id)
    .single();
  if (error || !rule) throw new ApiError(404, "Rule not found", "not_found");
  const typedRule = rule as {
    id: string;
    name: string;
    trigger_jsonb: { type?: string } | null;
    actions_jsonb: Array<{ type: string; subject?: string; body?: string; template?: string; config?: Record<string, unknown> }> | null;
  };

  let context: Record<string, string> = { ...SAMPLE_PREVIEW_CONTEXT };
  if (customer_id) {
    const { data: cust, error: customerError } = await (supabase as unknown as {
      from: (table: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            eq: (col: string, val: string) => {
              maybeSingle: () => Promise<{ data: Record<string, string | null> | null; error: unknown }>;
            };
          };
        };
      };
    })
      .from("customers")
      .select("first_name,last_name,company_name,email,phone")
      .eq("workspace_id", workspaceId)
      .eq("id", customer_id)
      .maybeSingle();
    if (customerError) throw customerError;
    if (cust) {
      const fullName = [cust.first_name, cust.last_name].filter(Boolean).join(" ") || cust.company_name || context.customer_name;
      context = {
        ...context,
        customer_name: fullName ?? context.customer_name,
        customer_first_name: cust.first_name || (fullName ?? "").split(" ")[0] || context.customer_first_name,
      };
    }
  }

  const trigger = typedRule.trigger_jsonb?.type || "unknown";
  const actions = typedRule.actions_jsonb || [];
  const actionResults = actions.map((a) => {
    try {
      const preview: { subject?: string; body?: string; template?: string; config?: Record<string, unknown> } = {};
      if (a.subject) preview.subject = renderTemplate(a.subject, context);
      if (a.body) preview.body = renderTemplate(a.body, context);
      if (a.template) preview.template = a.template;
      if (a.config) preview.config = a.config;
      return { type: a.type, status: "would_send", preview };
    } catch (e) {
      return {
        type: a.type,
        status: "error",
        preview: {},
        reason: e instanceof Error ? e.message : "Unknown error",
      };
    }
  });
  return json({
    ruleId: typedRule.id,
    ruleName: typedRule.name,
    matchedTrigger: trigger,
    actionResults,
  });
});

platformRouter.get("/v1/platform/automation/executions", async (c) => {
  const { user_id, limit } = z.object({
    user_id: z.string().uuid(),
    limit: z.coerce.number().int().min(1).max(500).default(50),
  }).parse(Object.fromEntries(new URL(c.req.url).searchParams));
  const { supabase } = await requirePlatformWorkspace(c);
  const { data, error } = await supabase
    .from("retention_action_executions")
    .select("id, rule_id, customer_id, action_type, status, executed_at, result_jsonb, automation_rules(name), customers(name)")
    .eq("user_id", user_id)
    .order("executed_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return json(
    ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
      const ruleRel = row.automation_rules as { name?: string } | null;
      const custRel = row.customers as { name?: string } | null;
      return {
        id: row.id,
        rule_id: row.rule_id,
        rule_name: ruleRel?.name ?? null,
        customer_id: row.customer_id,
        customer_name: custRel?.name ?? null,
        action_type: row.action_type,
        status: row.status,
        executed_at: row.executed_at,
        result_jsonb: (row.result_jsonb ?? null) as Record<string, unknown> | null,
      };
    }),
  );
});


// ---------------------------------------------------------------------------
// Business preferences (migrated from business-preferences.query.ts)
// ---------------------------------------------------------------------------

platformRouter.get("/v1/platform/business-preferences", async (c) => {
  const { supabase, workspaceId } = await requirePlatformWorkspace(c);
  const [{ data: workspace, error: workspaceError }, { data: settings, error: settingsError }] = await Promise.all([
    supabase.from("workspaces").select("timezone,currency_code").eq("id", workspaceId).maybeSingle(),
    supabase.from("workspace_settings").select("terminology,operational_settings").eq("workspace_id", workspaceId).maybeSingle(),
  ]);
  if (workspaceError) throw workspaceError;
  if (settingsError) throw settingsError;
  const operational = settings?.operational_settings && typeof settings.operational_settings === "object" && !Array.isArray(settings.operational_settings)
    ? settings.operational_settings as Record<string, unknown>
    : {};
  const ws = workspace as { timezone?: string | null; currency_code?: string | null } | null;
  return json({
    date_format: typeof operational.date_format === "string" ? operational.date_format : null,
    timezone: ws?.timezone ?? null,
    currency: ws?.currency_code?.trim?.() ?? ws?.currency_code ?? null,
    terminology: (settings as { terminology?: unknown } | null)?.terminology ?? null,
  });
});

// ---------------------------------------------------------------------------
// Business profile coordinates (migrated from business-profile.query.ts)
// ---------------------------------------------------------------------------

platformRouter.get("/v1/platform/business-profile/coordinates", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const workspaceId = await resolveWorkspaceIdForUser(supabase, user.id, readWorkspaceHint(c));
  if (!workspaceId) return json(null);
  const { data: settings, error } = await supabase
    .from("workspace_settings")
    .select("operational_settings")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  const coords = serviceCoordinatesFromOperational(settings?.operational_settings);
  return coords ? json(coords) : json(null);
});

// ---------------------------------------------------------------------------
// Settings page (migrated from settings-page.query.ts / settings-page.command.ts)
// ---------------------------------------------------------------------------

platformRouter.get("/v1/platform/settings/business-profile", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const workspaceId = await resolveWorkspaceIdForUser(supabase, user.id, readWorkspaceHint(c));
  if (!workspaceId) return json({ data: null, error: null });
  const profile = await loadBusinessSettingsForWorkspace(supabase, user.id, workspaceId);
  if (!profile) return json({ data: null, error: null });
  const { data: settings, error } = await supabase
    .from("workspace_settings")
    .select("website_url, marketplace_opt_in, day_hours, operational_settings")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) return json({ data: null, error: { message: error.message } });
  const operational = settings?.operational_settings && typeof settings.operational_settings === "object" && !Array.isArray(settings.operational_settings)
    ? settings.operational_settings as Record<string, unknown>
    : {};
  return json({
    data: {
      ...profile,
      website_url: (settings as { website_url?: string } | null)?.website_url ?? "",
      marketplace_opt_in: (settings as { marketplace_opt_in?: boolean } | null)?.marketplace_opt_in ?? false,
      day_hours: (settings as { day_hours?: unknown } | null)?.day_hours ?? null,
      cover_image_url: typeof operational.cover_image_url === "string" ? operational.cover_image_url : "",
      weather_guard_enabled: operational.weather_guard_enabled === true,
      weather_guard_settings: operational.weather_guard_settings ?? null,
    },
    error: null,
  });
});

platformRouter.get("/v1/platform/settings/slug-check", async (c) => {
  const url = new URL(c.req.url);
  const slug = z.string().parse(url.searchParams.get("slug") ?? "");
  if (!slug || slug.length < 3) return json({ available: null, workspaceId: null, userId: null });
  if (!/^[a-z0-9-]+$/.test(slug)) return json({ available: false, workspaceId: null, userId: null });
  const { supabase, user } = await requireAuth(c);
  const workspaceId = await resolveWorkspaceIdForUser(supabase, user.id, readWorkspaceHint(c));
  if (!workspaceId) return json({ available: null, workspaceId: null, userId: null });
  const [{ data: workspaceMatch, error: workspaceError }, { data: settingsMatch, error: settingsError }] = await Promise.all([
    supabase.from("workspaces").select("id").eq("slug", slug).neq("id", workspaceId).limit(1),
    supabase.from("workspace_settings").select("workspace_id").eq("booking_slug", slug).neq("workspace_id", workspaceId).limit(1),
  ]);
  if (workspaceError || settingsError) return json({ available: null, workspaceId: null, userId: null });
  return json({
    available: !(workspaceMatch?.length || settingsMatch?.length),
    workspaceId,
    userId: user.id,
  });
});

platformRouter.post("/v1/platform/settings/business-profile", async (c) => {
  const { data, selected_workspace_id } = z.object({
    data: z.record(z.string(), z.unknown()),
    selected_workspace_id: z.string().uuid().optional(),
  }).parse(await c.req.json());
  const { supabase, user } = await requireAuth(c);
  const workspaceId = await resolveWorkspaceIdForUser(supabase, user.id, selected_workspace_id);
  if (!workspaceId) {
    return json({ data: null, error: { code: "workspace_not_found", message: "No active workspace found" } });
  }
  const db = supabase as any;

  const workspacePatch: Record<string, unknown> = {};
  if (typeof data.business_name === "string") workspacePatch.name = data.business_name;
  if (typeof data.timezone === "string" && data.timezone) workspacePatch.timezone = data.timezone;
  if (typeof data.currency === "string" && data.currency) workspacePatch.currency_code = data.currency;
  if (typeof data.booking_slug === "string" && data.booking_slug) workspacePatch.slug = data.booking_slug;
  if (Object.keys(workspacePatch).length > 0) {
    const { error } = await db.from("workspaces").update(workspacePatch).eq("id", workspaceId);
    if (error) return json({ data: null, error: { message: error.message } });
  }

  const { data: currentSettings, error: readError } = await db
    .from("workspace_settings")
    .select("operational_settings")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (readError) return json({ data: null, error: { message: readError.message } });

  const currentOperational = currentSettings?.operational_settings && typeof currentSettings.operational_settings === "object" && !Array.isArray(currentSettings.operational_settings)
    ? currentSettings.operational_settings as Record<string, unknown>
    : {};
  const operational = {
    ...currentOperational,
    date_format: data.date_format,
    service_address: data.service_address,
    service_coordinates: data.service_coordinates,
    cover_image_url: data.cover_image_url,
    weather_guard_enabled: data.weather_guard_enabled,
    weather_guard_settings: data.weather_guard_settings,
  };
  const settingsPatch: Record<string, unknown> = {
    owner_name: data.owner_name || null,
    phone: data.phone || null,
    email: data.email || null,
    address_line1: data.address || null,
    website_url: data.website_url || null,
    logo_url: data.logo_url || null,
    terminology: data.terminology ?? {},
    opening_time: data.opening_time || null,
    closing_time: data.closing_time || null,
    working_days: data.working_days ?? [],
    booking_slug: data.booking_slug || null,
    service_radius_miles: data.service_radius_miles ?? null,
    marketplace_opt_in: data.marketplace_opt_in === true,
    day_hours: data.day_hours ?? {},
    operational_settings: operational,
  };
  const { data: updated, error } = await db.from("workspace_settings").update(settingsPatch).eq("workspace_id", workspaceId);
  if (error) return json({ data: null, error: { message: error.message } });
  return json({ data: updated ?? null, error: null });
});

async function uploadBrandAsset(c: Context, kind: "logo" | "cover") {
  const { supabase, user } = await requireAuth(c);
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "file is required", "invalid_file");
  const fileExt = file.name.split(".").pop() || "png";
  const fileName = `${user.id}/${kind}.${fileExt}`;
  const { error } = await supabase.storage.from("logos").upload(fileName, file, { upsert: true });
  if (error) throw new Error(error.message);
  const { data: { publicUrl } } = supabase.storage.from("logos").getPublicUrl(fileName);
  return json({ data: publicUrl });
}

platformRouter.post("/v1/platform/settings/logo", (c) => uploadBrandAsset(c, "logo"));
platformRouter.post("/v1/platform/settings/cover", (c) => uploadBrandAsset(c, "cover"));

// ---------------------------------------------------------------------------
// Tracking settings (migrated from tracking-settings.query.ts /
// tracking-settings.command.ts)
// ---------------------------------------------------------------------------

const TRACKING_COLS = "ga4_measurement_id,google_ads_id,google_ads_conversion_label,meta_pixel_id,custom_head_script,custom_body_script,enabled";
const TRACKING_PUBLIC_COLS = "ga4_measurement_id,google_ads_id,google_ads_conversion_label,meta_pixel_id,enabled";

platformRouter.get("/v1/platform/tracking-settings", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await (supabase as any)
    .from("tenant_tracking_settings")
    .select(TRACKING_COLS)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return json(data ?? null);
});

platformRouter.get("/v1/platform/tracking-settings/public", async (c) => {
  const url = new URL(c.req.url);
  const userId = z.string().uuid().parse(url.searchParams.get("user_id") ?? "");
  const supabase = createSupabaseAdminClient();
  const { data, error } = await (supabase as any)
    .from("tenant_tracking_settings")
    .select(TRACKING_PUBLIC_COLS)
    .eq("user_id", userId)
    .eq("enabled", true)
    .maybeSingle();
  if (error || !data) return json(null);
  return json({ ...data, custom_head_script: null, custom_body_script: null });
});

platformRouter.put("/v1/platform/tracking-settings", async (c) => {
  const settings = z.object({
    ga4_measurement_id: z.string().nullable().optional(),
    google_ads_id: z.string().nullable().optional(),
    google_ads_conversion_label: z.string().nullable().optional(),
    meta_pixel_id: z.string().nullable().optional(),
    custom_head_script: z.string().nullable().optional(),
    custom_body_script: z.string().nullable().optional(),
    enabled: z.boolean(),
  }).passthrough().parse(await c.req.json());
  const { supabase, user } = await requireAuth(c);
  const payload = {
    user_id: user.id,
    ...settings,
    enabled: settings.enabled,
    custom_head_script: settings.custom_head_script || null,
    custom_body_script: settings.custom_body_script || null,
  };
  const { error } = await (supabase as any).from("tenant_tracking_settings").upsert(payload, { onConflict: "user_id" });
  if (error) throw error;
  return json({ success: true });
});

platformRouter.patch("/v1/platform/tracking-settings/enabled", async (c) => {
  const { enabled } = z.object({ enabled: z.boolean() }).parse(await c.req.json());
  const { supabase, user } = await requireAuth(c);
  const { error } = await (supabase as any)
    .from("tenant_tracking_settings")
    .upsert({ user_id: user.id, enabled }, { onConflict: "user_id" });
  if (error) throw error;
  return json({ success: true });
});

// ---------------------------------------------------------------------------
// Onboarding (canonical workspace-backed contract)
// ---------------------------------------------------------------------------

const onboardingStateSchema = z.object({
  step: z.number().int().min(0).max(5).default(0),
  completed: z.boolean().default(false),
  completed_at: z.string().datetime().nullable().optional(),
});

const onboardingProfileInputSchema = z.object({
  business_name: z.string().trim().max(200).optional(),
  owner_name: z.string().trim().max(200).optional(),
  email: z.string().email().max(320).optional(),
  phone: z.string().trim().max(40).optional(),
  logo_url: z.string().url().nullable().optional(),
  service_address: z.string().trim().max(500).optional(),
  service_radius_miles: z.number().min(0).max(500).optional(),
  timezone: z.string().trim().min(1).max(120).optional(),
  service_coordinates: z.object({ lat: z.number(), lng: z.number() }).nullable().optional(),
  working_days: z.array(z.string().trim().min(1).max(20)).max(7).optional(),
  opening_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  closing_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  day_hours: z.record(z.string(), z.unknown()).optional(),
  website_url: z.string().url().nullable().optional(),
  brand_primary_color: z.string().max(64).nullable().optional(),
  brand_secondary_color: z.string().max(64).nullable().optional(),
  brand_font_family: z.string().max(120).nullable().optional(),
  onboarding_step: z.number().int().min(0).max(5).optional(),
  onboarding_completed: z.boolean().optional(),
}).strict();

function onboardingStateFromOperational(value: unknown) {
  const operational = readOperationalObject(value);
  const raw = readOperationalObject(operational.onboarding);
  const parsed = onboardingStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : { step: 0, completed: false, completed_at: null };
}

function serviceCoordinatesFromOperational(value: unknown): { lat: number; lng: number } | null {
  const operational = readOperationalObject(value);
  const raw = readOperationalObject(operational.service_coordinates);
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function onboardingProfileIsComplete(workspace: any, settings: any): boolean {
  const state = onboardingStateFromOperational(settings?.operational_settings);
  if (!state.completed || state.step < 5) return false;
  return Boolean(
    workspace?.id &&
    workspace?.name?.trim() &&
    workspace?.timezone?.trim() &&
    settings?.owner_name?.trim() &&
    settings?.email &&
    settings?.phone?.trim() &&
    settings?.address_line1?.trim() &&
    Array.isArray(settings?.working_days) &&
    settings.working_days.length > 0 &&
    settings?.opening_time &&
    settings?.closing_time
  );
}

async function loadCanonicalOnboardingProfile(supabase: any, userId: string) {
  const workspaceId = await resolveWorkspaceIdForUser(supabase, userId);
  if (!workspaceId) return { workspaceId: null, workspace: null, settings: null, profile: null };

  const [{ data: workspace, error: workspaceError }, { data: settings, error: settingsError }] = await Promise.all([
    supabase.from("workspaces").select("id,name,timezone,currency_code,is_active,created_at").eq("id", workspaceId).maybeSingle(),
    supabase.from("workspace_settings").select("*").eq("workspace_id", workspaceId).maybeSingle(),
  ]);
  if (workspaceError) throw workspaceError;
  if (settingsError) throw settingsError;
  if (!workspace) return { workspaceId, workspace: null, settings: null, profile: null };

  const state = onboardingStateFromOperational(settings?.operational_settings);
  const operational = readOperationalObject(settings?.operational_settings);
  const profile = {
    business_name: workspace.name ?? "",
    owner_name: settings?.owner_name ?? "",
    email: settings?.email ?? "",
    phone: settings?.phone ?? "",
    logo_url: settings?.logo_url ?? null,
    service_address: settings?.address_line1 ?? "",
    service_radius_miles: Number(settings?.service_radius_miles ?? 25),
    timezone: workspace.timezone ?? "America/New_York",
    service_coordinates: serviceCoordinatesFromOperational(settings?.operational_settings),
    working_days: settings?.working_days ?? [],
    opening_time: settings?.opening_time ? String(settings.opening_time).slice(0, 5) : "09:00",
    closing_time: settings?.closing_time ? String(settings.closing_time).slice(0, 5) : "17:00",
    day_hours: settings?.day_hours ?? {},
    website_url: settings?.website_url ?? null,
    brand_primary_color: typeof operational.brand_primary_color === "string" ? operational.brand_primary_color : null,
    brand_secondary_color: typeof operational.brand_secondary_color === "string" ? operational.brand_secondary_color : null,
    brand_font_family: typeof operational.brand_font_family === "string" ? operational.brand_font_family : null,
    onboarding_step: state.step,
    onboarding_completed: onboardingProfileIsComplete(workspace, settings),
  };
  return { workspaceId, workspace, settings, profile };
}

platformRouter.get("/v1/platform/onboarding/status", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const workspaceId = await resolveWorkspaceIdForUser(supabase, user.id);
  return json({
    authenticated: true,
    onboardingCompleted: true,
    verified: true,
    workspaceId,
    sunset: true,
  });
});

platformRouter.get("/v1/platform/onboarding/profile", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const canonical = await loadCanonicalOnboardingProfile(supabase, user.id);
  return json(canonical.profile);
});

platformRouter.post("/v1/platform/onboarding/profile", async (c) => {
  const profileData = onboardingProfileInputSchema.parse(await c.req.json());
  const { supabase, user } = await requireAuth(c);
  const workspaceId = await resolveWorkspaceIdForUser(supabase, user.id);
  if (!workspaceId) throw new ApiError(409, "Your workspace has not been provisioned yet.", "onboarding_workspace_missing");

  const [{ data: existingWorkspace, error: workspaceReadError }, { data: existingSettings, error: settingsReadError }] = await Promise.all([
    supabase.from("workspaces").select("id,name,timezone").eq("id", workspaceId).maybeSingle(),
    supabase.from("workspace_settings").select("*").eq("workspace_id", workspaceId).maybeSingle(),
  ]);
  if (workspaceReadError) throw workspaceReadError;
  if (settingsReadError) throw settingsReadError;
  if (!existingWorkspace) throw new ApiError(409, "Your workspace has not been provisioned yet.", "onboarding_workspace_missing");

  const currentOperational = readOperationalObject(existingSettings?.operational_settings);
  const previousState = onboardingStateFromOperational(existingSettings?.operational_settings);
  const nextStep = profileData.onboarding_step ?? previousState.step;
  const wantsComplete = profileData.onboarding_completed ?? previousState.completed;
  const nextOnboarding = {
    step: nextStep,
    completed: wantsComplete,
    completed_at: wantsComplete ? (previousState.completed_at ?? new Date().toISOString()) : null,
  };

  const workspacePatch: Record<string, unknown> = {};
  if (profileData.business_name !== undefined) workspacePatch.name = profileData.business_name;
  if (profileData.timezone !== undefined) workspacePatch.timezone = profileData.timezone;
  if (Object.keys(workspacePatch).length > 0) {
    const { error } = await supabase.from("workspaces").update(workspacePatch).eq("id", workspaceId);
    if (error) throw error;
  }

  const settingsPayload: Record<string, unknown> = {
    workspace_id: workspaceId,
    operational_settings: {
      ...currentOperational,
      onboarding: nextOnboarding,
      ...(profileData.service_coordinates !== undefined ? { service_coordinates: profileData.service_coordinates } : {}),
      ...(profileData.brand_primary_color !== undefined ? { brand_primary_color: profileData.brand_primary_color } : {}),
      ...(profileData.brand_secondary_color !== undefined ? { brand_secondary_color: profileData.brand_secondary_color } : {}),
      ...(profileData.brand_font_family !== undefined ? { brand_font_family: profileData.brand_font_family } : {}),
    },
  };
  if (profileData.owner_name !== undefined) settingsPayload.owner_name = profileData.owner_name;
  if (profileData.email !== undefined) settingsPayload.email = profileData.email;
  if (profileData.phone !== undefined) settingsPayload.phone = profileData.phone;
  if (profileData.logo_url !== undefined) settingsPayload.logo_url = profileData.logo_url;
  if (profileData.service_address !== undefined) settingsPayload.address_line1 = profileData.service_address;
  if (profileData.service_radius_miles !== undefined) settingsPayload.service_radius_miles = profileData.service_radius_miles;
  if (profileData.working_days !== undefined) settingsPayload.working_days = profileData.working_days;
  if (profileData.opening_time !== undefined) settingsPayload.opening_time = profileData.opening_time;
  if (profileData.closing_time !== undefined) settingsPayload.closing_time = profileData.closing_time;
  if (profileData.day_hours !== undefined) settingsPayload.day_hours = profileData.day_hours;
  if (profileData.website_url !== undefined) settingsPayload.website_url = profileData.website_url;

  const { error: settingsWriteError } = await (supabase as any)
    .from("workspace_settings")
    .upsert(settingsPayload, { onConflict: "workspace_id" });
  if (settingsWriteError) throw settingsWriteError;

  const persisted = await loadCanonicalOnboardingProfile(supabase, user.id);
  if (!persisted.profile) throw new ApiError(500, "Onboarding settings were not readable after save.", "onboarding_verify_failed");
  if (profileData.onboarding_step !== undefined && persisted.profile.onboarding_step !== profileData.onboarding_step) {
    throw new ApiError(500, "Onboarding progress did not persist.", "onboarding_verify_failed");
  }
  if (profileData.onboarding_completed === true && !persisted.profile.onboarding_completed) {
    throw new ApiError(409, "Complete the required business, contact, service-area, and hours fields before finishing onboarding.", "onboarding_requirements_incomplete");
  }

  await recordOperationalAudit({
    supabase: createSupabaseAdminClient(),
    request: c.req.raw,
    workspaceId,
    actorUserId: user.id,
    action: profileData.onboarding_completed ? "onboarding.completed" : "onboarding.progress_saved",
    entityType: "workspace",
    entityId: workspaceId,
    metadata: { step: persisted.profile.onboarding_step ?? 0, verified: true },
  });

  return json({ success: true, verified: true, profile: persisted.profile });
});

const onboardingServiceSchema = z.object({
  name: z.string().trim().min(1).max(250),
  description: z.string().max(5000).default(""),
  price: z.number().nonnegative().nullable().optional(),
  duration_minutes: z.number().int().nonnegative().max(1440).optional(),
});

platformRouter.post("/v1/platform/onboarding/services", async (c) => {
  const { services } = z.object({ services: z.array(onboardingServiceSchema).max(100) }).parse(await c.req.json());
  const { supabase, user } = await requireAuth(c);
  const workspaceId = await resolveWorkspaceIdForUser(supabase, user.id);
  if (!workspaceId) throw new ApiError(409, "Your workspace has not been provisioned yet.", "onboarding_workspace_missing");
  if (services.length === 0) return json({ count: 0, verified: true });

  let persistedCount = 0;
  for (const service of services) {
    const { data: existing, error: existingError } = await (supabase as any)
      .from("service_catalog")
      .select("id")
      .eq("workspace_id", workspaceId)
      .ilike("name", service.name)
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;

    const row = {
      workspace_id: workspaceId,
      name: service.name,
      description: service.description,
      labor_price: service.price ?? 0,
      estimated_minutes: service.duration_minutes ?? null,
      is_active: true,
      metadata: { source: "onboarding" },
    };

    if (existing?.id) {
      const { error } = await (supabase as any).from("service_catalog").update(row).eq("id", existing.id).eq("workspace_id", workspaceId);
      if (error) throw error;
    } else {
      const { error } = await (supabase as any).from("service_catalog").insert(row);
      if (error) throw error;
    }
    persistedCount += 1;
  }

  const { count, error: verifyError } = await (supabase as any)
    .from("service_catalog")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .in("name", services.map((service) => service.name));
  if (verifyError) throw verifyError;
  if ((count ?? 0) < persistedCount) throw new ApiError(500, "Onboarding services did not persist.", "onboarding_services_verify_failed");

  await recordOperationalAudit({
    supabase: createSupabaseAdminClient(),
    request: c.req.raw,
    workspaceId,
    actorUserId: user.id,
    action: "onboarding.services_saved",
    entityType: "workspace",
    entityId: workspaceId,
    metadata: { requested: services.length, verified: count ?? 0 },
  });

  return json({ count: persistedCount, verified: true });
});

platformRouter.post("/v1/platform/onboarding/site-import", async (c) => {
  const { url } = z.object({ url: z.string().url() }).parse(await c.req.json());
  const result = await invokeEdgeFunction(c, "onboarding-site-import", { body: { url } });
  if (isEdgeError(result)) {
    let message = "We couldn't import that website.";
    const parsed = parseJsonLoose(result.detail);
    if (parsed && typeof parsed === "object" && typeof (parsed as { error?: unknown }).error !== "undefined") {
      message = String((parsed as { error: unknown }).error);
    }
    throw new ApiError(result.status >= 400 && result.status < 600 ? result.status : 502, message, "site_import_failed");
  }
  const payload = result.data as { result?: unknown; warnings?: unknown } | null;
  if (!payload?.result) throw new ApiError(502, "We couldn't read anything useful from that website.", "site_import_empty");
  return json({ result: payload.result, warnings: payload.warnings ?? [] });
});

platformRouter.get("/v1/platform/onboarding/site-import/latest", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await (supabase as any)
    .from("onboarding_site_imports")
    .select("payload, warnings, status")
    .eq("user_id", user.id)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.payload) return json(null);
  return json({ result: data.payload, warnings: data.warnings ?? [] });
});

// ---------------------------------------------------------------------------
// Dashboard (migrated from dashboard.query.ts, dashboard-cockpit.query.ts,
// command-palette.query.ts). Endpoints return raw rows; all presentation
// mapping and locale/timezone formatting stays client-side.
// ---------------------------------------------------------------------------

platformRouter.get("/v1/platform/dashboard/onboarding-info", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const workspaceId = await resolveWorkspaceIdForUser(supabase, user.id, readWorkspaceHint(c));
  let ownerName: string | null = null;
  if (workspaceId) {
    const { data: settings } = await supabase
      .from("workspace_settings")
      .select("owner_name")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    ownerName = settings?.owner_name ?? null;
  }
  return json({
    hasUser: true,
    onboardingCompleted: true,
    ownerName,
    resolved: true,
    sunset: true,
  });
});

platformRouter.get("/v1/platform/dashboard/overview", async (c) => {
  const { supabase, workspaceId } = await requirePlatformWorkspace(c);
  const url = new URL(c.req.url);
  const todayStartIso = z.string().min(1).parse(url.searchParams.get("today_start") ?? "");
  const db = supabase as any;
  const [vehiclesRes, pendingRes, activeRes, upcomingRes] = await Promise.all([
    db.from("vehicles").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "active"),
    db.from("service_records").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "in_progress"),
    db.from("service_records")
      .select("id,work_performed,metadata,customers(first_name,last_name),vehicles(year,make,model)")
      .eq("workspace_id", workspaceId)
      .eq("status", "in_progress")
      .limit(5),
    db.from("appointments")
      .select("id,status,starts_at,metadata,vehicles(year,make,model)")
      .eq("workspace_id", workspaceId)
      .neq("source", "fleet_work_order")
      .gte("starts_at", todayStartIso)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: true })
      .limit(20),
  ]);
  if (vehiclesRes.error) throw vehiclesRes.error;
  if (pendingRes.error) throw pendingRes.error;
  if (activeRes.error) throw activeRes.error;
  if (upcomingRes.error) throw upcomingRes.error;
  return json({
    vehiclesCount: vehiclesRes.count ?? 0,
    pendingCount: pendingRes.count ?? 0,
    activeRows: activeRes.data ?? [],
    upcomingRows: upcomingRes.data ?? [],
  });
});

platformRouter.get("/v1/platform/dashboard/reporting", async (c) => {
  const { supabase, workspaceId } = await requirePlatformWorkspace(c);
  const url = new URL(c.req.url);
  const { from, to, prev_from, prev_to } = z.object({
    from: z.string().datetime(),
    to: z.string().datetime(),
    prev_from: z.string().datetime(),
    prev_to: z.string().datetime(),
  }).parse({
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    prev_from: url.searchParams.get("prev_from"),
    prev_to: url.searchParams.get("prev_to"),
  });
  const db = supabase as any;
  const [paymentsRes, servicesRes, appointmentsRes, prevPaymentsRes] = await Promise.all([
    db.from("payments")
      .select("id,amount,created_at,status,metadata,customers(first_name,last_name,email)")
      .eq("workspace_id", workspaceId)
      .gte("created_at", from)
      .lte("created_at", to)
      .order("created_at", { ascending: true }),
    db.from("service_records")
      .select("id,status,work_performed,metadata,started_at,completed_at,created_at,total_amount,tax_amount,discount_amount,customers(first_name,last_name),vehicles(make,model,year)")
      .eq("workspace_id", workspaceId)
      .gte("created_at", from)
      .lte("created_at", to)
      .order("created_at", { ascending: true }),
    db.from("appointments")
      .select("id,status,starts_at,metadata")
      .eq("workspace_id", workspaceId)
      .neq("source", "fleet_work_order")
      .gte("starts_at", from)
      .lte("starts_at", to)
      .order("starts_at", { ascending: true }),
    db.from("payments")
      .select("id,amount,status,metadata")
      .eq("workspace_id", workspaceId)
      .gte("created_at", prev_from)
      .lte("created_at", prev_to),
  ]);
  if (paymentsRes.error) throw paymentsRes.error;
  if (servicesRes.error) throw servicesRes.error;
  if (appointmentsRes.error) throw appointmentsRes.error;
  if (prevPaymentsRes.error) throw prevPaymentsRes.error;
  return json({
    paymentRows: paymentsRes.data ?? [],
    serviceRows: servicesRes.data ?? [],
    appointmentRows: appointmentsRes.data ?? [],
    prevPaymentRows: prevPaymentsRes.data ?? [],
  });
});

platformRouter.get("/v1/platform/dashboard/cockpit-rows", async (c) => {
  const { supabase, workspaceId } = await requirePlatformWorkspace(c);
  const url = new URL(c.req.url);
  const bounds = z.object({
    today_start: z.string().datetime(),
    today_end: z.string().datetime(),
    yesterday_start: z.string().datetime(),
    yesterday_end: z.string().datetime(),
    week_start: z.string().datetime(),
    month_start: z.string().datetime(),
    year_start: z.string().datetime(),
    next7_end: z.string().datetime(),
    prev_month_start: z.string().datetime(),
    prev_month_mtd_end: z.string().datetime(),
  }).parse(Object.fromEntries(url.searchParams));
  const db = supabase as any;
  const [
    todayAppts, upcoming7, inProgress, completedToday, completedMonth, invoices,
  ] = await Promise.all([
    db.from("appointments").select("id,starts_at,status,metadata").eq("workspace_id", workspaceId)
      .gte("starts_at", bounds.today_start).lt("starts_at", bounds.today_end)
      .in("status", ["confirmed", "in_progress"]).order("starts_at", { ascending: true }),
    db.from("appointments").select("id,starts_at,status,metadata").eq("workspace_id", workspaceId)
      .gt("starts_at", bounds.today_end).lt("starts_at", bounds.next7_end)
      .eq("status", "confirmed").order("starts_at", { ascending: true }).limit(10),
    db.from("appointments").select("id,starts_at,customer_id,vehicle_id,metadata,customers(first_name,last_name),vehicles(year,make,model)")
      .eq("workspace_id", workspaceId).eq("status", "in_progress")
      .order("starts_at", { ascending: false }).limit(20),
    db.from("service_records").select("appointment_id").eq("workspace_id", workspaceId)
      .eq("status", "completed").gte("completed_at", bounds.today_start).lt("completed_at", bounds.today_end),
    db.from("service_records").select("id,total_amount,completed_at,metadata").eq("workspace_id", workspaceId)
      .eq("status", "completed").gte("completed_at", bounds.month_start)
      .order("completed_at", { ascending: true }),
    db.from("invoices").select("id,total,amount_paid,status").eq("workspace_id", workspaceId)
      .in("status", ["issued", "partially_paid", "past_due"]),
  ]);
  for (const result of [todayAppts, upcoming7, inProgress, completedToday, completedMonth, invoices]) {
    if (result.error) throw result.error;
  }
  return json({
    todayApptRows: todayAppts.data ?? [],
    upcoming7Rows: upcoming7.data ?? [],
    inProgressRows: inProgress.data ?? [],
    completedTodayRows: completedToday.data ?? [],
    completedMonthRows: completedMonth.data ?? [],
    invoiceRows: invoices.data ?? [],
  });
});

platformRouter.get("/v1/platform/command-palette/search", async (c) => {
  const { supabase, workspaceId } = await requirePlatformWorkspace(c);
  const url = new URL(c.req.url);
  const q = z.string().parse(url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return json({ customers: [], appointmentRows: [] });
  const db = supabase as any;
  const [customersRes, appointmentsRes] = await Promise.all([
    db.from("customers")
      .select("id,first_name,last_name,email,phone")
      .eq("workspace_id", workspaceId)
      .neq("status", "archived")
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(8),
    db.from("appointments")
      .select("id,status,starts_at,confirmation_code,metadata")
      .eq("workspace_id", workspaceId)
      .order("starts_at", { ascending: false })
      .limit(30),
  ]);
  if (customersRes.error) throw customersRes.error;
  if (appointmentsRes.error) throw appointmentsRes.error;
  return json({
    customers: (customersRes.data ?? []).map((customer: any) => ({
      id: customer.id,
      name: [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Customer",
      email: customer.email,
      phone: customer.phone,
    })),
    appointmentRows: appointmentsRes.data ?? [],
  });
});

// ---------------------------------------------------------------------------
// Inventory overview (migrated from inventory.query.ts `fetchInventoryOverview`).
// Replicates the original client-side query logic server-side against the
// user-scoped client (identical RLS semantics to the browser); the client
// module becomes a thin `apiClient` wrapper with byte-identical exports.
// Consumed by the dashboard `LowStockAlert` via `low-stock.query.ts`.
// ---------------------------------------------------------------------------

platformRouter.get("/v1/platform/inventory/overview", async (c) => {
  const { supabase, workspaceId } = await requirePlatformWorkspace(c);
  const db = supabase as any;
  const [itemsRes, locationsRes, stockRes, reservationsRes] = await Promise.all([
    db.from("inventory_items")
      .select("id,name,description,sku,unit,unit_cost,sell_price,category,low_stock_threshold,image_url,reorder_url,tire_size,tire_load_index,tire_season,tire_speed_rating,tire_position")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .order("name"),
    db.from("inventory_locations")
      .select("id,name,location_type")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .order("name"),
    db.from("inventory_stock")
      .select("inventory_item_id,location_id,quantity")
      .eq("workspace_id", workspaceId),
    db.from("inventory_reservations")
      .select("inventory_item_id,quantity,location_id,status")
      .eq("workspace_id", workspaceId)
      .eq("status", "reserved"),
  ]);
  for (const result of [itemsRes, locationsRes, stockRes, reservationsRes]) {
    if (result.error) throw result.error;
  }

  const locations = (locationsRes.data ?? []) as Array<{ id: string; name: string; location_type: string }>;
  const stock = (stockRes.data ?? []) as Array<{ inventory_item_id: string; location_id: string; quantity: number | string }>;
  const warehouseIds = new Set(locations.filter((l) => l.location_type === "warehouse").map((l) => l.id));
  const warehouseQty = new Map<string, number>();
  for (const row of stock) {
    if (warehouseIds.has(row.location_id)) {
      warehouseQty.set(row.inventory_item_id, (warehouseQty.get(row.inventory_item_id) ?? 0) + Number(row.quantity ?? 0));
    }
  }
  const items = ((itemsRes.data ?? []) as Array<{ id: string }>).map((item) => ({
    ...item,
    quantity: warehouseQty.get(item.id) ?? 0,
  }));
  const nonWarehouseLocations = locations.filter((l) => l.location_type !== "warehouse");
  const vans = nonWarehouseLocations.map((l) => ({ id: l.id, name: l.name }));
  const nonWarehouseIds = new Set(nonWarehouseLocations.map((l) => l.id));
  const vanInventory = stock
    .filter((row) => nonWarehouseIds.has(row.location_id))
    .map((row) => ({
      inventory_item_id: row.inventory_item_id,
      van_id: row.location_id,
      quantity: Number(row.quantity ?? 0),
    }));
  const reservations = ((reservationsRes.data ?? []) as Array<{ inventory_item_id: string; quantity: number | string; location_id: string | null; status: string }>).map((row) => ({
    inventory_item_id: row.inventory_item_id,
    quantity: Number(row.quantity ?? 0),
    source: row.location_id && nonWarehouseIds.has(row.location_id) ? "location" : "warehouse",
    van_id: row.location_id && nonWarehouseIds.has(row.location_id) ? row.location_id : null,
  }));
  return json({ items, vans, vanInventory, reservations });
});

// ---------------------------------------------------------------------------
// Reports (migrated from reports.query.ts, reports-canonical.query.ts,
// reports-funnel.query.ts, reports-tabs.query.ts). Endpoints return raw rows;
// all KPI math, grouping, and aggregation stays client-side.
// ---------------------------------------------------------------------------

const reportsRangeQuerySchema = z.object({
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  limit: z.coerce.number().int().min(1).max(5000).optional(),
});

platformRouter.get("/v1/platform/reports/payments", async (c) => {
  const { supabase, workspaceId } = await requirePlatformWorkspace(c);
  const { from_date, to_date } = reportsRangeQuerySchema.parse(Object.fromEntries(new URL(c.req.url).searchParams));
  const { data, error } = await (supabase as any).from("payments")
    .select("id,amount,created_at,status,provider,metadata,customers(first_name,last_name,email),invoices(id,status)")
    .eq("workspace_id", workspaceId)
    .gte("created_at", `${from_date}T00:00:00`)
    .lte("created_at", `${to_date}T23:59:59`)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return json(data ?? []);
});

platformRouter.get("/v1/platform/reports/services", async (c) => {
  const { supabase, workspaceId } = await requirePlatformWorkspace(c);
  const { from_date, to_date, limit } = reportsRangeQuerySchema.parse(Object.fromEntries(new URL(c.req.url).searchParams));
  let q = (supabase as any).from("service_records")
    .select("id,appointment_id,status,work_performed,metadata,started_at,completed_at,created_at,total_amount,tax_amount,discount_amount,customers(first_name,last_name),vehicles(make,model,year)")
    .eq("workspace_id", workspaceId)
    .gte("created_at", `${from_date}T00:00:00`)
    .lte("created_at", `${to_date}T23:59:59`)
    .order("created_at", { ascending: false });
  if (limit) q = q.limit(limit);
  const { data, error } = await q;
  if (error) throw error;
  return json(data ?? []);
});

platformRouter.get("/v1/platform/reports/appointments", async (c) => {
  const { supabase, workspaceId } = await requirePlatformWorkspace(c);
  const { from_date, to_date, limit } = reportsRangeQuerySchema.parse(Object.fromEntries(new URL(c.req.url).searchParams));
  let q = (supabase as any).from("appointments")
    .select("id,customer_id,assigned_user_id,status,starts_at,ends_at,source,metadata,updated_at,customers(first_name,last_name,postal_code),vehicles(make,model,year)")
    .eq("workspace_id", workspaceId)
    .neq("source", "fleet_work_order")
    .gte("starts_at", `${from_date}T00:00:00`)
    .lte("starts_at", `${to_date}T23:59:59`)
    .order("starts_at", { ascending: false });
  if (limit) q = q.limit(limit);
  const { data, error } = await q;
  if (error) throw error;
  return json(data ?? []);
});

platformRouter.get("/v1/platform/reports/customers", async (c) => {
  const { supabase, workspaceId } = await requirePlatformWorkspace(c);
  const limit = z.coerce.number().int().min(1).max(5000).default(200)
    .parse(new URL(c.req.url).searchParams.get("limit") ?? undefined);
  const { data, error } = await (supabase as any).from("customers")
    .select("id,first_name,last_name,email,phone,metadata,created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return json(data ?? []);
});

platformRouter.get("/v1/platform/reports/vehicles", async (c) => {
  const { supabase, workspaceId } = await requirePlatformWorkspace(c);
  const limit = z.coerce.number().int().min(1).max(5000).default(500)
    .parse(new URL(c.req.url).searchParams.get("limit") ?? undefined);
  const { data, error } = await (supabase as any).from("vehicles")
    .select("id,year,make,model,vin,license_plate,mileage,metadata,updated_at,customers(first_name,last_name),vehicle_service_specs(engine,oil_type)")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return json(data ?? []);
});

platformRouter.get("/v1/platform/reports/previous-period-payments", async (c) => {
  const { supabase, workspaceId } = await requirePlatformWorkspace(c);
  const { from_date, to_date } = reportsRangeQuerySchema.parse(Object.fromEntries(new URL(c.req.url).searchParams));
  const { data, error } = await (supabase as any).from("payments")
    .select("id,amount,status")
    .eq("workspace_id", workspaceId)
    .gte("created_at", `${from_date}T00:00:00`)
    .lte("created_at", `${to_date}T23:59:59`);
  if (error) throw error;
  return json(data ?? []);
});

platformRouter.get("/v1/platform/reports/ytd-payments", async (c) => {
  const { supabase, workspaceId } = await requirePlatformWorkspace(c);
  const ytd_from = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
    .parse(new URL(c.req.url).searchParams.get("ytd_from") ?? "");
  const { data, error } = await (supabase as any).from("payments")
    .select("amount,status")
    .eq("workspace_id", workspaceId)
    .gte("created_at", `${ytd_from}T00:00:00`);
  if (error) throw error;
  return json(data ?? []);
});

platformRouter.get("/v1/platform/reports/active-technicians", async (c) => {
  const { supabase, workspaceId } = await requirePlatformWorkspace(c);
  const { data, error } = await (supabase as any).from("workspace_members")
    .select("user_id,role,is_active,profiles(display_name)")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .eq("role", "technician");
  if (error) throw error;
  return json(data ?? []);
});

platformRouter.get("/v1/platform/reports/technician-appointments", async (c) => {
  const { supabase, workspaceId } = await requirePlatformWorkspace(c);
  const { from_date, to_date } = reportsRangeQuerySchema.parse(Object.fromEntries(new URL(c.req.url).searchParams));
  const { data, error } = await (supabase as any).from("appointments")
    .select("id,assigned_user_id,status,starts_at,ends_at,metadata")
    .eq("workspace_id", workspaceId)
    .neq("source", "fleet_work_order")
    .gte("starts_at", `${from_date}T00:00:00`)
    .lte("starts_at", `${to_date}T23:59:59`)
    .not("assigned_user_id", "is", null);
  if (error) throw error;
  return json(data ?? []);
});

platformRouter.get("/v1/platform/reports/canonical-rows", async (c) => {
  const { supabase, workspaceId } = await requirePlatformWorkspace(c);
  const bounds = z.object({
    from_iso: z.string().datetime(),
    to_iso: z.string().datetime(),
    prev_from_iso: z.string().datetime(),
    prev_to_iso: z.string().datetime(),
    ytd_from_iso: z.string().datetime(),
  }).parse(Object.fromEntries(new URL(c.req.url).searchParams));
  const db = supabase as any;
  const invoiceCols = "id,customer_id,status,subtotal,tax_total,total,amount_paid,issued_at,created_at,metadata";
  const [
    invoicesRes, openInvoicesRes, invoicesYtdRes, serviceRecordsRes,
    appointmentsRes, customersRes, vehiclesRes, invoiceLinesRes,
  ] = await Promise.all([
    db.from("invoices").select(invoiceCols).eq("workspace_id", workspaceId)
      .in("status", ["issued", "partially_paid", "paid", "past_due"])
      .gte("issued_at", bounds.from_iso).lte("issued_at", bounds.to_iso),
    db.from("invoices").select(invoiceCols).eq("workspace_id", workspaceId)
      .in("status", ["issued", "partially_paid", "past_due"])
      .lte("created_at", bounds.to_iso),
    db.from("invoices").select(invoiceCols).eq("workspace_id", workspaceId)
      .in("status", ["issued", "partially_paid", "paid", "past_due"])
      .gte("issued_at", bounds.ytd_from_iso),
    db.from("service_records")
      .select("id,customer_id,vehicle_id,status,started_at,completed_at,total_amount,metadata")
      .eq("workspace_id", workspaceId).eq("status", "completed")
      .gte("completed_at", bounds.from_iso).lte("completed_at", bounds.to_iso),
    db.from("appointments")
      .select("id,customer_id,vehicle_id,status,starts_at,metadata")
      .eq("workspace_id", workspaceId)
      .gte("starts_at", bounds.from_iso).lte("starts_at", bounds.to_iso),
    db.from("customers")
      .select("id,first_name,last_name,company_name,email,phone,postal_code,created_at,metadata")
      .eq("workspace_id", workspaceId),
    db.from("vehicles")
      .select("id,customer_id,vin,mileage,year,make,model,metadata")
      .eq("workspace_id", workspaceId),
    db.from("invoice_lines")
      .select("invoice_id,description,quantity,unit_price")
      .eq("workspace_id", workspaceId),
  ]);
  for (const result of [invoicesRes, openInvoicesRes, invoicesYtdRes, serviceRecordsRes, appointmentsRes, customersRes, vehiclesRes, invoiceLinesRes]) {
    if (result.error) throw result.error;
  }
  return json({
    invoiceRows: invoicesRes.data ?? [],
    openInvoiceRows: openInvoicesRes.data ?? [],
    invoiceYtdRows: invoicesYtdRes.data ?? [],
    serviceRecordRows: serviceRecordsRes.data ?? [],
    appointmentRows: appointmentsRes.data ?? [],
    customerRows: customersRes.data ?? [],
    vehicleRows: vehiclesRes.data ?? [],
    invoiceLineRows: invoiceLinesRes.data ?? [],
  });
});

platformRouter.get("/v1/platform/reports/audit-rows", async (c) => {
  const { supabase, workspaceId } = await requirePlatformWorkspace(c);
  const db = supabase as any;
  const [
    customersRes, vehiclesRes, appointmentsRes, serviceRecordsRes,
    invoicesRes, invoiceLinesRes, paymentsRes,
  ] = await Promise.all([
    db.from("customers")
      .select("id,first_name,last_name,company_name,email,phone,postal_code,created_at,metadata")
      .eq("workspace_id", workspaceId),
    db.from("vehicles")
      .select("id,customer_id,vin,mileage,year,make,model,metadata")
      .eq("workspace_id", workspaceId),
    db.from("appointments")
      .select("id,customer_id,vehicle_id,status,starts_at,metadata")
      .eq("workspace_id", workspaceId),
    db.from("service_records")
      .select("id,appointment_id,customer_id,vehicle_id,status,started_at,completed_at,work_performed,total_amount,metadata")
      .eq("workspace_id", workspaceId),
    db.from("invoices")
      .select("id,customer_id,vehicle_id,work_order_id,status,total,amount_paid,due_at,created_at,metadata")
      .eq("workspace_id", workspaceId),
    db.from("invoice_lines")
      .select("id,invoice_id,description,quantity,unit_price")
      .eq("workspace_id", workspaceId),
    db.from("payments")
      .select("id,invoice_id,customer_id,status,amount,paid_at,metadata")
      .eq("workspace_id", workspaceId),
  ]);
  for (const result of [customersRes, vehiclesRes, appointmentsRes, serviceRecordsRes, invoicesRes, invoiceLinesRes, paymentsRes]) {
    if (result.error) throw result.error;
  }
  return json({
    customerRows: customersRes.data ?? [],
    vehicleRows: vehiclesRes.data ?? [],
    appointmentRows: appointmentsRes.data ?? [],
    serviceRecordRows: serviceRecordsRes.data ?? [],
    invoiceRows: invoicesRes.data ?? [],
    invoiceLineRows: invoiceLinesRes.data ?? [],
    paymentRows: paymentsRes.data ?? [],
  });
});

platformRouter.get("/v1/platform/reports/booking-funnel", async (c) => {
  const { supabase } = await requireAuth(c);
  const url = new URL(c.req.url);
  const { from, to } = z.object({
    from: z.string().datetime(),
    to: z.string().datetime(),
  }).parse({ from: url.searchParams.get("from"), to: url.searchParams.get("to") });
  const { data, error } = await (supabase as any)
    .from("abandoned_bookings")
    .select("id, session_id, last_step, recovered, status, created_at")
    .gte("created_at", from)
    .lte("created_at", to);
  if (error) throw error;
  return json(data ?? []);
});

platformRouter.get("/v1/platform/reports/customer-analytics-rows", async (c) => {
  const { supabase, workspaceId } = await requirePlatformWorkspace(c);
  const db = supabase as any;
  const [customerResult, serviceResult] = await Promise.all([
    db.from("customers").select("id,first_name,last_name,company_name,email,created_at").eq("workspace_id", workspaceId),
    db.from("service_records").select("customer_id,total_amount,status,started_at,completed_at,created_at").eq("workspace_id", workspaceId),
  ]);
  if (customerResult.error) throw customerResult.error;
  if (serviceResult.error) throw serviceResult.error;
  return json({
    customerRows: customerResult.data ?? [],
    serviceRows: serviceResult.data ?? [],
  });
});

platformRouter.get("/v1/platform/reports/technicians", async (c) => {
  const { supabase, workspaceId } = await requirePlatformWorkspace(c);
  const db = supabase as any;
  const { data: members, error } = await db.from("workspace_members")
    .select("user_id,role,is_active").eq("workspace_id", workspaceId).eq("is_active", true);
  if (error) throw error;
  const techIds = (members ?? []).filter((member: any) => member.role === "technician").map((member: any) => member.user_id);
  if (!techIds.length) return json([]);
  const { data: profiles, error: profileError } = await db.from("profiles").select("id,display_name").in("id", techIds);
  if (profileError) throw profileError;
  const names = new Map((profiles ?? []).map((profile: any) => [profile.id, profile.display_name]));
  return json(techIds.map((id: string) => ({ id, name: String(names.get(id) || "Technician"), status: "active" })));
});

platformRouter.get("/v1/platform/reports/earliest-activity", async (c) => {
  const { supabase, workspaceId } = await requirePlatformWorkspace(c);
  const db = supabase as any;
  const [apptRes, serviceRes] = await Promise.all([
    db.from("appointments").select("starts_at").eq("workspace_id", workspaceId).order("starts_at", { ascending: true }).limit(1),
    db.from("service_records").select("created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: true }).limit(1),
  ]);
  if (apptRes.error) throw apptRes.error;
  if (serviceRes.error) throw serviceRes.error;
  return json({
    apptStartsAt: apptRes.data?.[0]?.starts_at ?? null,
    serviceCreatedAt: serviceRes.data?.[0]?.created_at ?? null,
  });
});

// ---------------------------------------------------------------------------
// Public booking support reads (migrated from public-booking.query.ts).
// The section-based /v1/public-booking/:slug reads already exist above; these
// cover the remaining direct table reads. Realtime subscriptions and the raw
// edge-function invoke stay client-side.
// ---------------------------------------------------------------------------

platformRouter.get("/v1/platform/public-booking/fee-settings", async (c) => {
  const url = new URL(c.req.url);
  const userId = z.string().uuid().parse(url.searchParams.get("user_id") ?? "");
  const admin = createSupabaseAdminClient();
  const { data, error } = await (admin as any)
    .from("business_profiles")
    .select("oil_price_per_quart, waste_oil_fee_enabled, waste_oil_fee, shop_fee_enabled, shop_fee_type, shop_fee_value, shop_fee_description, surcharge_enabled, surcharge_type, surcharge_value, surcharge_description, payment_provider")
    .eq("user_id", userId)
    .single();
  if (error) return json({ data: null, error: { message: error.message } });
  return json({ data, error: null });
});

platformRouter.get("/v1/platform/public-booking/subscription-plans", async (c) => {
  const url = new URL(c.req.url);
  const userId = z.string().uuid().parse(url.searchParams.get("user_id") ?? "");
  const admin = createSupabaseAdminClient();
  const { data, error } = await (admin as any)
    .from("subscription_plans")
    .select(
      "id, user_id, name, description, price, billing_cycle, features, included_services, max_services_per_cycle, is_active, display_order, tier, stripe_product_id, stripe_price_id, price_min, price_max, badge_label, badge_color, highlight, cta_label, created_at, updated_at",
    )
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("display_order", { ascending: true });
  if (error) return json({ data: null, error: { message: error.message } });
  return json({ data: data ?? [], error: null });
});

platformRouter.get("/v1/platform/public-booking/blocked-dates", async (c) => {
  const url = new URL(c.req.url);
  const userId = z.string().uuid().parse(url.searchParams.get("user_id") ?? "");
  const admin = createSupabaseAdminClient();
  const { data, error } = await (admin as any)
    .from("blocked_dates")
    .select("blocked_date")
    .eq("user_id", userId);
  if (error) return json({ data: null, error: { message: error.message } });
  return json({ data: data ?? [], error: null });
});

platformRouter.get("/v1/platform/public-booking/customer-account", async (c) => {
  const url = new URL(c.req.url);
  const userId = z.string().uuid().parse(url.searchParams.get("user_id") ?? "");
  const { supabase } = await requireAuth(c);
  const { data, error } = await (supabase as any)
    .from("customer_accounts")
    .select("full_name, phone")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return json({ data: null, error: { message: error.message } });
  return json({ data: data ?? null, error: null });
});

platformRouter.post("/v1/platform/public-booking/calculate-tax", async (c) => {
  const body = z.record(z.string(), z.unknown()).parse(await c.req.json());
  const result = await invokeEdgeFunction(c, "calculate-tax", { body });
  if (isEdgeError(result)) throw new ApiError(result.status >= 400 && result.status < 600 ? result.status : 502, result.detail || result.message, "tax_calculation_failed");
  return json({ data: result.data, error: null });
});

// ---------------------------------------------------------------------------
// Public booking writes (migrated from public-booking.command.ts,
// booking-submit.query.ts, booking-context.query.ts,
// booking-submit.command.ts consent path, public-business.query.ts).
//
// The public-booking RPCs themselves are proxied by the appointments domain
// (POST /v1/appointments/booking-rpc, /v1/appointments/edge/:function,
// /v1/appointments/booking-consent); these endpoints cover the remaining
// direct writes/reads with no appointments-domain equivalent.
// ---------------------------------------------------------------------------

platformRouter.post("/v1/platform/booking/track-abandoned", async (c) => {
  const data = z.record(z.string(), z.unknown()).parse(await c.req.json());
  const { sessionId, session_id, lastAttemptedAt, last_attempted_at, attemptCount, attempt_count, userId, user_id, ...rest } = data;
  const targetSessionId = String(session_id ?? sessionId ?? crypto.randomUUID());
  const targetUserId = String(user_id ?? userId ?? "anonymous");
  const admin = createSupabaseAdminClient() as any;
  const { data: row, error } = await admin
    .from("abandoned_bookings")
    .upsert(
      {
        session_id: targetSessionId,
        user_id: targetUserId,
        status: "pending",
        last_attempted_at: String(last_attempted_at ?? lastAttemptedAt ?? new Date().toISOString()),
        attempt_count: Number(attempt_count ?? attemptCount ?? 1),
        metadata: rest,
      },
      { onConflict: "session_id" },
    )
    .select("id")
    .single();
  if (error) throw error;
  // Fire-and-forget enqueue signal. Cron sweep remains the reliability backstop.
  void admin.rpc("notify_abandoned_booking", { row_id: row.id });
  return json(row);
});

platformRouter.post("/v1/platform/booking/record-consent", async (c) => {
  const { signature, ...body } = z.record(z.string(), z.unknown())
    .parse(await c.req.json()) as { signature?: unknown } & Record<string, unknown>;
  const anon = createSupabaseAnonServerClient();
  const { data, error } = await anon.functions.invoke("record-booking-consent", {
    body,
    headers: typeof signature === "string" && signature ? { "x-hmac-signature": signature } : {},
  });
  if (error) return json({ data: null, error: { message: error.message } });
  return json({ data: data ?? null, error: null });
});

platformRouter.get("/v1/platform/booking/van-assignment", async (c) => {
  const url = new URL(c.req.url);
  const vanId = z.string().uuid().parse(url.searchParams.get("van_id") ?? "");
  const admin = createSupabaseAdminClient() as any;
  const { data, error } = await admin
    .from("vans")
    .select("assigned_technician_id")
    .eq("id", vanId)
    .single();
  if (error) return json({ data: null, error: { message: error.message } });
  return json({ data: data ?? null, error: null });
});

platformRouter.get("/v1/platform/public-booking/business", async (c) => {
  const url = new URL(c.req.url);
  const slug = z.string().min(1).max(120).parse(url.searchParams.get("slug") ?? "");
  const admin = createSupabaseAdminClient() as any;
  const { data, error } = await admin.rpc("get_public_booking_profile_v2", {
    booking_slug_param: slug,
  });
  if (error || !data || data.length === 0) return json(null);
  const profile = data[0];
  return json({
    user_id: profile.user_id,
    business_name: profile.business_name || "",
    logo_url: profile.logo_url || null,
    phone: profile.phone || null,
    email: profile.email || null,
    address: null,
    currency: profile.currency || null,
    stripe_charges_enabled: profile.stripe_charges_enabled || false,
  });
});

const ASSESSMENT_PHOTO_BUCKET = "booking-assessment-photos";
const ASSESSMENT_PHOTO_ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const ASSESSMENT_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const ASSESSMENT_PHOTO_TTL_SECONDS = 60 * 60 * 24 * 7;

platformRouter.post("/v1/platform/booking/assessment-photo", async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  const businessUserId = z.string().min(1).parse(form.get("business_user_id") ?? "");
  const vehicleId = z.string().min(1).parse(form.get("vehicle_id") ?? "");
  if (!(file instanceof File)) throw new ApiError(400, "file is required", "invalid_file");
  if (!ASSESSMENT_PHOTO_ALLOWED.has(file.type)) throw new ApiError(400, "Use a JPG, PNG, or WebP image", "invalid_file_type");
  if (file.size > ASSESSMENT_PHOTO_MAX_BYTES) throw new ApiError(400, "Photo must be 5 MB or smaller", "file_too_large");
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${businessUserId}/${vehicleId}/${crypto.randomUUID()}.${extension}`;
  const storage = createSupabaseAnonServerClient().storage.from(ASSESSMENT_PHOTO_BUCKET);
  const { error } = await storage.upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  const { data, error: signError } = await storage.createSignedUrl(path, ASSESSMENT_PHOTO_TTL_SECONDS);
  if (signError || !data?.signedUrl) throw new Error(signError?.message ?? "Could not read uploaded photo");
  return json({ data: data.signedUrl });
});

// ---------------------------------------------------------------------------
// Provider sync edge proxies (migrated from provider-sync.query.ts,
// provider-sync.command.ts, provider-sync-manager.command.ts,
// sync-function-version.query.ts).
//
// These forward to the provider-sync-manager / sync-appointment-to-provider
// edge functions with the caller's session token, preserving query strings
// and JSON error bodies that supabase.functions.invoke would swallow.
// ---------------------------------------------------------------------------

async function proxyEdgeWithQuery(
  c: Context,
  functionName: string,
  query: URLSearchParams,
  method: "GET" | "POST",
  body?: unknown,
  opts: { allowAnonymous?: boolean } = {},
) {
  const url = `${supabaseFunctionsBaseUrl()}/${functionName}${query.toString() ? `?${query}` : ""}`;
  const headers: Record<string, string> = { apikey: supabasePublishableKey() };
  if (opts.allowAnonymous) {
    const res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new ApiError(res.status, `Version probe failed (${res.status})`, "edge_error");
    return json(data);
  }
  const { supabase } = await requireAuth(c);
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new ApiError(401, "Not authenticated", "not_authenticated");
  headers.Authorization = `Bearer ${session.access_token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = typeof data.error === "string" && data.error ? data.error : `Request failed (${res.status})`;
    throw new ApiError(res.status, message, "edge_error");
  }
  return json(data);
}

platformRouter.get("/v1/platform/provider-sync/summary", (c) =>
  proxyEdgeWithQuery(c, "provider-sync-manager", new URLSearchParams({ action: "summary" }), "GET"),
);

platformRouter.get("/v1/platform/provider-sync/records", (c) => {
  const url = new URL(c.req.url);
  const query = new URLSearchParams({ action: "list" });
  const status = url.searchParams.get("status");
  const limit = url.searchParams.get("limit");
  if (status) query.set("status", status);
  if (limit) query.set("limit", limit);
  return proxyEdgeWithQuery(c, "provider-sync-manager", query, "GET");
});

platformRouter.get("/v1/platform/provider-sync/logs", (c) => {
  const url = new URL(c.req.url);
  const query = new URLSearchParams({
    action: "logs",
    record_id: url.searchParams.get("record_id") ?? "",
  });
  return proxyEdgeWithQuery(c, "provider-sync-manager", query, "GET");
});

platformRouter.post("/v1/platform/provider-sync/manage", async (c) => {
  const body = z.record(z.string(), z.unknown()).parse(await c.req.json());
  return proxyEdgeWithQuery(c, "provider-sync-manager", new URLSearchParams(), "POST", body);
});

platformRouter.post("/v1/platform/provider-sync/request", async (c) => {
  const body = z.record(z.string(), z.unknown()).parse(await c.req.json());
  return proxyEdgeWithQuery(c, "sync-appointment-to-provider", new URLSearchParams(), "POST", body);
});

platformRouter.get("/v1/platform/provider-sync/function-version", (c) =>
  proxyEdgeWithQuery(c, "sync-appointment-to-provider", new URLSearchParams(), "GET", undefined, { allowAnonymous: true }),
);

// ---------------------------------------------------------------------------
// Provider directory reads (migrated from provider-directory.query.ts).
// Public marketplace surface: only businesses that explicitly opted in.
// ---------------------------------------------------------------------------

platformRouter.get("/v1/platform/provider-directory/search", async (c) => {
  const url = new URL(c.req.url);
  const rawSearch = (url.searchParams.get("search_text") ?? "").trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 25) || 25, 1), 100);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);
  const admin = createSupabaseAdminClient() as any;
  const { data, error } = await admin.rpc("search_public_providers", {
    search_text: rawSearch.length > 0 ? rawSearch : null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return json({ data: data ?? [], error: null });
});

platformRouter.get("/v1/platform/provider-directory/profile", async (c) => {
  const url = new URL(c.req.url);
  const slug = z.string().min(1).parse(url.searchParams.get("slug") ?? "");
  const admin = createSupabaseAdminClient() as any;
  const { data, error } = await admin.rpc("get_directory_provider_profile", {
    booking_slug_param: slug,
  });
  if (error) throw error;
  const rows = (data ?? []) as unknown[];
  return json({ data: rows[0] ?? null, error: null });
});

platformRouter.get("/v1/platform/provider-directory/services", async (c) => {
  const url = new URL(c.req.url);
  const ids = (url.searchParams.get("provider_ids") ?? "").split(",").filter(Boolean).slice(0, 200);
  if (!ids.length) return json({ data: [], error: null });
  const admin = createSupabaseAdminClient() as any;
  const { data, error } = await admin
    .from("service_catalog")
    .select("user_id, name, default_price")
    .eq("is_active", true)
    .in("user_id", ids)
    .limit(500);
  if (error) throw error;
  return json({ data: data ?? [], error: null });
});

// ---------------------------------------------------------------------------
// Provider snapshot rows (migrated from provider-snapshot.query.ts).
// Revenue reads reuse the billing canonical cash-receipts endpoint client-side;
// the remaining raw reads are batched here. Presentation math stays client-side.
// ---------------------------------------------------------------------------

platformRouter.get("/v1/platform/provider-snapshot/rows", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const url = new URL(c.req.url);
  const workspaceId = await resolveWorkspaceIdForUser(supabase, user.id, url.searchParams.get("selected_workspace_id"));
  const q = (name: string, fallback: string) => `${url.searchParams.get(name) ?? fallback}T00:00:00`;
  const admin = createSupabaseAdminClient() as any;
  const [completedRes, scheduledRes, upcomingRes, servicesRes, settingsRes] = await Promise.all([
    admin.from("service_records").select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId).eq("status", "completed").gte("completed_at", q("month_start", new Date().toISOString().slice(0, 10))),
    admin.from("appointments").select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId).gte("starts_at", q("month_start", new Date().toISOString().slice(0, 10)))
      .in("status", ["confirmed", "requested"]),
    admin.from("appointments").select("id,starts_at,status,metadata")
      .eq("workspace_id", workspaceId).gte("starts_at", q("today", new Date().toISOString().slice(0, 10)))
      .lte("starts_at", `${url.searchParams.get("next7") ?? new Date().toISOString().slice(0, 10)}T23:59:59`)
      .in("status", ["confirmed", "requested"]).order("starts_at", { ascending: true }).limit(25),
    admin.from("service_records").select("id,total_amount,completed_at,metadata")
      .eq("workspace_id", workspaceId).eq("status", "completed").gte("completed_at", q("month_start", new Date().toISOString().slice(0, 10))),
    admin.from("workspace_settings").select("operational_settings").eq("workspace_id", workspaceId).maybeSingle(),
  ]);
  for (const result of [completedRes, scheduledRes, upcomingRes, servicesRes, settingsRes]) {
    if (result.error) throw result.error;
  }
  return json({
    completedCount: completedRes.count ?? 0,
    scheduledCount: scheduledRes.count ?? 0,
    upcomingRows: upcomingRes.data ?? [],
    serviceRows: servicesRes.data ?? [],
    settingsRow: settingsRes.data ?? null,
  });
});

// ---------------------------------------------------------------------------
// Marketplace provider dashboard (migrated from marketplace-provider.query.ts
// and marketplace-provider.command.ts).
//
// User-scoped: every endpoint verifies the requested user_id matches the
// authenticated user, mirroring the original RLS-scoped client reads.
// Presentation normalization (listing shape, revenue math) stays client-side.
// ---------------------------------------------------------------------------

const MARKETPLACE_LISTING_COLUMNS = [
  "business_name", "logo_url", "cover_image_url", "marketplace_description",
  "phone", "email", "website_url", "booking_slug", "service_address", "city",
  "state", "postal_code", "service_radius_miles", "marketplace_service_area_zips",
  "marketplace_opt_in", "marketplace_accept_new_customers", "marketplace_allow_same_day",
  "marketplace_auto_accept", "marketplace_max_jobs_per_day", "require_approval",
  "min_lead_time_hours", "max_advance_days", "working_days", "opening_time", "closing_time",
].join(",");

const MARKETPLACE_FUNNEL_EVENTS = {
  impressions: "marketplace_listing_impression",
  views: "marketplace_profile_view",
  bookingClicks: "marketplace_booking_click",
  quoteClicks: "marketplace_quote_click",
} as const;

async function requireSelfUser(c: Context, userId: string): Promise<string> {
  const auth = await requireAuth(c);
  const uid = (await auth.supabase.auth.getUser()).data.user?.id ?? null;
  const requested = z.string().min(1).parse(userId);
  if (!uid || requested !== uid) throw new ApiError(403, "Not authorized for this provider", "forbidden");
  return requested;
}

platformRouter.get("/v1/platform/marketplace/listing", async (c) => {
  const url = new URL(c.req.url);
  const userId = await requireSelfUser(c, url.searchParams.get("user_id") ?? "");
  const admin = createSupabaseAdminClient() as any;
  const { data, error } = await admin
    .from("business_profiles")
    .select(MARKETPLACE_LISTING_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return json({ data: data ?? null });
});

platformRouter.get("/v1/platform/marketplace/metrics", async (c) => {
  const url = new URL(c.req.url);
  const userId = await requireSelfUser(c, url.searchParams.get("user_id") ?? "");
  const since = url.searchParams.get("since");
  const admin = createSupabaseAdminClient() as any;
  const countEvent = (eventName: string) => {
    let q = admin.from("analytics_events").select("id", { count: "exact", head: true })
      .eq("tenant_id", userId).eq("event_name", eventName);
    if (since) q = q.gte("created_at", since);
    return q;
  };
  let apptQuery = admin.from("appointments").select("status, estimated_cost, created_at")
    .eq("user_id", userId).eq("source", "provider_directory");
  if (since) apptQuery = apptQuery.gte("created_at", since);
  const [impressionsRes, viewsRes, bookingClicksRes, quoteClicksRes, apptRes] = await Promise.all([
    countEvent(MARKETPLACE_FUNNEL_EVENTS.impressions),
    countEvent(MARKETPLACE_FUNNEL_EVENTS.views),
    countEvent(MARKETPLACE_FUNNEL_EVENTS.bookingClicks),
    countEvent(MARKETPLACE_FUNNEL_EVENTS.quoteClicks),
    apptQuery,
  ]);
  for (const result of [impressionsRes, viewsRes, bookingClicksRes, quoteClicksRes, apptRes]) {
    if (result.error) throw result.error;
  }
  return json({
    impressions: impressionsRes.count ?? 0,
    views: viewsRes.count ?? 0,
    bookingClicks: bookingClicksRes.count ?? 0,
    quoteClicks: quoteClicksRes.count ?? 0,
    appointments: (apptRes.data ?? []) as Array<{ status: string | null; estimated_cost: number | null }>,
  });
});

platformRouter.get("/v1/platform/marketplace/leads", async (c) => {
  const url = new URL(c.req.url);
  const userId = await requireSelfUser(c, url.searchParams.get("user_id") ?? "");
  const admin = createSupabaseAdminClient() as any;
  const { data, error } = await admin
    .from("appointments")
    .select("id, title, status, scheduled_date, scheduled_time, guest_name, guest_email, guest_phone, estimated_cost, customers(name), vehicles(year, make, model)")
    .eq("user_id", userId)
    .eq("source", "provider_directory")
    .order("scheduled_date", { ascending: true })
    .limit(100);
  if (error) throw error;
  return json({ data: data ?? [] });
});

platformRouter.get("/v1/platform/marketplace/services", async (c) => {
  const url = new URL(c.req.url);
  const userId = await requireSelfUser(c, url.searchParams.get("user_id") ?? "");
  const admin = createSupabaseAdminClient() as any;
  const { data, error } = await admin
    .from("service_catalog")
    .select("id, name, description, default_price, estimated_duration, is_active")
    .eq("user_id", userId)
    .order("name", { ascending: true });
  if (error) throw error;
  return json({ data: data ?? [] });
});

platformRouter.get("/v1/platform/marketplace/reviews", async (c) => {
  const url = new URL(c.req.url);
  const userId = await requireSelfUser(c, url.searchParams.get("user_id") ?? "");
  const admin = createSupabaseAdminClient() as any;
  const { data, error } = await admin
    .from("testimonials")
    .select("id, customer_name, content, rating, created_at, provider_reply, provider_replied_at, status")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return json({ data: data ?? [] });
});

platformRouter.patch("/v1/platform/marketplace/listing", async (c) => {
  const body = z.object({
    user_id: z.string().min(1),
    updates: z.record(z.string(), z.unknown()),
  }).parse(await c.req.json());
  const userId = await requireSelfUser(c, body.user_id);
  const admin = createSupabaseAdminClient() as any;
  const { error } = await admin.from("business_profiles").update(body.updates).eq("user_id", userId);
  if (error) throw error;
  return json({ data: { ok: true } });
});

platformRouter.patch("/v1/platform/marketplace/review-reply", async (c) => {
  const auth = await requireAuth(c);
  const { review_id, reply } = z.object({
    review_id: z.string().uuid(),
    reply: z.string().min(1),
  }).parse(await c.req.json());
  const uid = (await auth.supabase.auth.getUser()).data.user?.id ?? null;
  const admin = createSupabaseAdminClient() as any;
  const { data: review, error: lookupError } = await admin
    .from("testimonials").select("user_id").eq("id", review_id).single();
  if (lookupError || !review || review.user_id !== uid) throw new ApiError(403, "Not authorized for this review", "forbidden");
  const { error } = await admin
    .from("testimonials")
    .update({ provider_reply: reply, provider_replied_at: new Date().toISOString() })
    .eq("id", review_id);
  if (error) throw error;
  return json({ data: { ok: true } });
});

platformRouter.patch("/v1/platform/marketplace/lead-status", async (c) => {
  const auth = await requireAuth(c);
  const { appointment_id, status } = z.object({
    appointment_id: z.string().uuid(),
    status: z.string().min(1),
  }).parse(await c.req.json());
  const uid = (await auth.supabase.auth.getUser()).data.user?.id ?? null;
  const admin = createSupabaseAdminClient() as any;
  const { data: appt, error: lookupError } = await admin
    .from("appointments").select("user_id").eq("id", appointment_id).single();
  if (lookupError || !appt || appt.user_id !== uid) throw new ApiError(403, "Not authorized for this lead", "forbidden");
  const { error } = await admin.from("appointments").update({ status }).eq("id", appointment_id);
  if (error) throw error;
  return json({ data: { ok: true } });
});

// ---------------------------------------------------------------------------
// Service packages (migrated from packages.command.ts).
// Canonical workspace-scoped RPCs and CRUD on service_packages.
// ---------------------------------------------------------------------------

const packageUpsertSchema = z.object({
  selected_workspace_id: z.string().min(1),
  package_id: z.string().uuid().optional(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  package_price: z.number(),
  discount_type: z.string(),
  discount_value: z.number(),
  is_active: z.boolean(),
  estimated_duration: z.number().nullable().optional(),
  items: z.array(z.object({
    service_catalog_id: z.string().uuid(),
    quantity: z.number().int().positive(),
    override_price: z.number().nullable().optional(),
  })),
});

platformRouter.post("/v1/platform/service-packages/upsert", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const body = packageUpsertSchema.parse(await c.req.json());
  const workspaceId = await resolveWorkspaceIdForUser(supabase, user.id, body.selected_workspace_id);
  const admin = createSupabaseAdminClient() as any;
  const { data, error } = await admin.rpc("upsert_service_package", {
    p_workspace_id: workspaceId,
    ...(body.package_id ? { p_package_id: body.package_id } : {}),
    p_name: body.name,
    p_description: body.description ?? null,
    p_package_price: body.package_price,
    p_discount_type: body.discount_type,
    p_discount_value: body.discount_value,
    p_is_active: body.is_active,
    p_estimated_duration: body.estimated_duration ?? null,
    p_items: body.items.map((item) => ({
      service_catalog_id: item.service_catalog_id,
      quantity: item.quantity,
      override_price: item.override_price ?? null,
    })),
  });
  if (error) throw error;
  return json({ data: String(data) });
});

platformRouter.delete("/v1/platform/service-packages/:id", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const url = new URL(c.req.url);
  const workspaceId = await resolveWorkspaceIdForUser(supabase, user.id, url.searchParams.get("selected_workspace_id"));
  const admin = createSupabaseAdminClient() as any;
  const { error } = await admin.from("service_packages").delete().eq("workspace_id", workspaceId).eq("id", c.req.param("id"));
  if (error) throw error;
  return json({ data: { ok: true } });
});

platformRouter.patch("/v1/platform/service-packages/:id/toggle", async (c) => {
  const { selected_workspace_id, is_active } = z.object({
    selected_workspace_id: z.string().min(1),
    is_active: z.boolean(),
  }).parse(await c.req.json());
  const { supabase, user } = await requireAuth(c);
  const workspaceId = await resolveWorkspaceIdForUser(supabase, user.id, selected_workspace_id);
  const admin = createSupabaseAdminClient() as any;
  const { error } = await admin
    .from("service_packages")
    .update({ is_active, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("id", c.req.param("id"));
  if (error) throw error;
  return json({ data: { ok: true } });
});

platformRouter.post("/v1/platform/service-packages/load-templates", async (c) => {
  const { selected_workspace_id } = z.object({ selected_workspace_id: z.string().min(1) }).parse(await c.req.json());
  const { supabase, user } = await requireAuth(c);
  const workspaceId = await resolveWorkspaceIdForUser(supabase, user.id, selected_workspace_id);
  const admin = createSupabaseAdminClient() as any;
  const { data, error } = await admin.rpc("populate_workspace_service_packages", { p_workspace_id: workspaceId });
  if (error) throw error;
  return json({ data: Number(data ?? 0) });
});

// ---------------------------------------------------------------------------
// Service playbooks (migrated from playbooks.command.ts and
// playbook-seed.command.ts). User-scoped like the marketplace dashboard.
// ---------------------------------------------------------------------------

async function requirePlaybookUser(c: Context, userId?: string | null): Promise<string> {
  const auth = await requireAuth(c);
  const uid = (await auth.supabase.auth.getUser()).data.user?.id ?? null;
  if (!uid) throw new ApiError(401, "Not authenticated", "not_authenticated");
  if (userId && userId !== uid) throw new ApiError(403, "Not authorized for this provider", "forbidden");
  return uid;
}

platformRouter.get("/v1/platform/playbooks", async (c) => {
  const url = new URL(c.req.url);
  const userId = await requirePlaybookUser(c, url.searchParams.get("user_id"));
  const admin = createSupabaseAdminClient() as any;
  const { data, error } = await admin
    .from("service_playbooks")
    .select("*, service_catalog(id, name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return json({ data: data ?? [], error: null });
});

platformRouter.post("/v1/platform/playbooks", async (c) => {
  const body = z.object({
    user_id: z.string().min(1).optional(),
    row: z.record(z.string(), z.unknown()),
  }).parse(await c.req.json());
  const userId = await requirePlaybookUser(c, body.user_id);
  const admin = createSupabaseAdminClient() as any;
  const { data, error } = await admin
    .from("service_playbooks")
    .insert({ ...body.row, user_id: userId })
    .select("id")
    .single();
  if (error) throw new Error(`Failed to create playbook: ${error.message}`);
  return json({ data: data.id });
});

platformRouter.patch("/v1/platform/playbooks/:id", async (c) => {
  const body = z.object({
    user_id: z.string().min(1).optional(),
    updates: z.record(z.string(), z.unknown()),
  }).parse(await c.req.json());
  const userId = await requirePlaybookUser(c, body.user_id);
  const admin = createSupabaseAdminClient() as any;
  const { error } = await admin.from("service_playbooks").update(body.updates).eq("id", c.req.param("id")).eq("user_id", userId);
  if (error) throw new Error(`Failed to update playbook: ${error.message}`);
  return json({ data: { ok: true } });
});

platformRouter.delete("/v1/platform/playbooks/:id", async (c) => {
  const url = new URL(c.req.url);
  const userId = await requirePlaybookUser(c, url.searchParams.get("user_id"));
  const admin = createSupabaseAdminClient() as any;
  const { error } = await admin.from("service_playbooks").delete().eq("id", c.req.param("id")).eq("user_id", userId);
  if (error) throw new Error(`Failed to delete playbook: ${error.message}`);
  return json({ data: { ok: true } });
});

platformRouter.post("/v1/platform/playbooks/seed", async (c) => {
  const { user_id } = z.object({ user_id: z.string().min(1).optional() }).parse(await c.req.json());
  const userId = await requirePlaybookUser(c, user_id ?? null);
  const admin = createSupabaseAdminClient() as any;

  const { data: templates } = await admin
    .from("service_playbook_templates")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (!templates?.length) return json({ data: 0 });

  const { data: catalogItems } = await admin
    .from("service_catalog")
    .select("id, name, category")
    .eq("user_id", userId)
    .eq("is_active", true);
  if (!catalogItems?.length) return json({ data: 0 });

  const { data: existing } = await admin
    .from("service_playbooks")
    .select("name, service_catalog_id")
    .eq("user_id", userId);
  const existingSet = new Set((existing ?? []).map((p: { name: string; service_catalog_id: string | null }) => `${p.name}::${p.service_catalog_id}`));

  const categoryMap: Record<string, string> = {
    oil_service: "oil",
    tire_service: "tire",
    battery_service: "battery",
    brake_service: "brake",
    inspection: "inspection",
  };

  const toInsert: Array<Record<string, unknown>> = [];
  for (const template of templates as Array<{ service_category: string; name: string; description: string | null; steps: unknown }>) {
    const keyword = categoryMap[template.service_category] ?? template.service_category;
    const matches = (catalogItems as Array<{ id: string; name: string | null; category: string | null }>).filter(
      (item) => item.category?.toLowerCase().includes(keyword) || item.name?.toLowerCase().includes(keyword),
    );
    const keys = matches.length === 0 ? [`${template.name}::null`] : matches.map((m) => `${template.name}::${m.id}`);
    const catalogIds = matches.length === 0 ? [null] : matches.map((m) => m.id);
    keys.forEach((key, idx) => {
      if (existingSet.has(key)) return;
      existingSet.add(key);
      toInsert.push({
        user_id: userId,
        service_catalog_id: catalogIds[idx],
        name: template.name,
        description: template.description,
        steps: template.steps,
        is_active: true,
      });
    });
  }

  if (toInsert.length > 0) {
    const { error } = await admin.from("service_playbooks").insert(toInsert);
    if (error) throw new Error(`Failed to seed playbooks: ${error.message}`);
  }
  return json({ data: toInsert.length });
});

// ---------------------------------------------------------------------------
// Team context (migrated from team.query.ts and team-join.query.ts).
// Auth operations (sign up / sign in / get session) stay client-side.
// ---------------------------------------------------------------------------

platformRouter.get("/v1/platform/team/data", async (c) => {
  const auth = await requireAuth(c);
  const uid = (await auth.supabase.auth.getUser()).data.user?.id ?? null;
  if (!uid) return json(null);
  const admin = createSupabaseAdminClient() as any;

  const { data: membership } = await admin
    .from("team_members")
    .select("role, teams!inner(id, name, user_id)")
    .eq("user_id", uid)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membership?.teams) {
    const ownerId = membership.teams.user_id as string;
    const { data: bp } = await admin
      .from("business_profiles")
      .select("booking_slug")
      .eq("user_id", ownerId)
      .single();
    return json({
      team: {
        id: membership.teams.id as string,
        name: membership.teams.name as string | null,
        booking_slug: (bp?.booking_slug as string) ?? null,
        owner_id: ownerId,
      },
      role: membership.role as string,
    });
  }

  // Fallback for legacy single-tenant records that predate teams/team_members linkage.
  const { data: profile } = await admin
    .from("business_profiles")
    .select("business_name, booking_slug")
    .eq("user_id", uid)
    .single();

  return json({
    team: {
      id: uid,
      name: (profile?.business_name as string) ?? null,
      booking_slug: (profile?.booking_slug as string) ?? null,
      owner_id: uid,
    },
    role: "owner",
  });
});

platformRouter.get("/v1/platform/team/invitation", async (c) => {
  const url = new URL(c.req.url);
  const token = z.string().min(1).parse(url.searchParams.get("token") ?? "");
  // Anonymous-context read mirroring the logged-out browser client.
  const anon = createSupabaseAnonServerClient() as any;
  const { data, error } = await anon.rpc("get_team_invitation", { p_token: token });
  return json({ data: data ?? null, error: error ? { message: error.message } : null });
});

platformRouter.post("/v1/platform/team/accept-invitation", async (c) => {
  // The RPC reads auth.uid() internally, so it must run with the caller's
  // session — mirroring the authenticated browser client.
  const { supabase } = await requireAuth(c);
  const { token } = z.object({ token: z.string().min(1) }).parse(await c.req.json());
  const { data, error } = await (supabase as any).rpc("accept_team_invitation", { p_invitation_token: token });
  return json({ data: data ?? null, error: error ? { message: error.message } : null });
});

// ---------------------------------------------------------------------------
// Misc edge + storage + user-scoped proxies (migrated from
// location-service.command.ts, logo-upload.command.ts,
// service-images.command.ts, ai-session.query.ts, link-health.query.ts,
// posthog-identity.query.ts, weather-guard.query.ts,
// google-calendar.query.ts, google-calendar.command.ts,
// auth.command.ts security-event RPCs).
// ---------------------------------------------------------------------------

platformRouter.post("/v1/platform/location-service", async (c) => {
  const body = z.record(z.string(), z.unknown()).parse(await c.req.json());
  const result = await invokeEdgeFunction(c, "location-service", { body });
  if (isEdgeError(result)) throw new ApiError(result.status || 502, result.detail || result.message, "location_service_unavailable");
  return json({ data: result.data });
});

const LOGO_BUCKET = "logos";
const LOGO_ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/svg+xml", "image/gif"]);

platformRouter.post("/v1/platform/logo-upload", async (c) => {
  const auth = await requireAuth(c);
  const uid = (await auth.supabase.auth.getUser()).data.user?.id;
  if (!uid) throw new ApiError(401, "Not authenticated", "not_authenticated");
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "file is required", "invalid_file");
  if (!LOGO_ALLOWED.has(file.type)) throw new ApiError(400, "Unsupported image type", "invalid_file_type");
  const fileExt = file.name.split(".").pop() || "png";
  const filePath = `${uid}/logo.${fileExt}`;
  const storage = createSupabaseAdminClient().storage.from(LOGO_BUCKET);
  const { error: uploadError } = await storage.upload(filePath, file, { upsert: true });
  if (uploadError) throw new Error(uploadError.message);
  const { data: urlData } = storage.getPublicUrl(filePath);
  return json({ data: urlData.publicUrl });
});

const SERVICE_IMAGES_BUCKET = "service-images";

platformRouter.post("/v1/platform/service-images/upload-url", async (c) => {
  const auth = await requireAuth(c);
  const uid = (await auth.supabase.auth.getUser()).data.user?.id;
  if (!uid) throw new ApiError(401, "Not authenticated", "not_authenticated");
  const { path } = z.object({ path: z.string().min(1).max(500) }).parse(await c.req.json());
  const storage = createSupabaseAdminClient().storage.from(SERVICE_IMAGES_BUCKET);
  const { data, error } = await storage.createSignedUploadUrl(path);
  if (error) throw new Error(error.message);
  const { data: { publicUrl } } = storage.getPublicUrl(path);
  return json({ data: { signedUrl: data?.signedUrl ?? null, publicUrl }, error: null });
});

platformRouter.get("/v1/platform/service-images", async (c) => {
  const auth = await requireAuth(c);
  const uid = (await auth.supabase.auth.getUser()).data.user?.id ?? null;
  const url = new URL(c.req.url);
  const serviceId = z.string().min(1).parse(url.searchParams.get("service_id") ?? "");
  const admin = createSupabaseAdminClient() as any;
  const { data, error } = await admin
    .from("service_images")
    .select("*")
    .eq("service_id", serviceId)
    .order("sort_order");
  if (error) throw error;
  return json({ images: (data ?? []) as unknown[], userId: uid });
});

platformRouter.post("/v1/platform/service-images", async (c) => {
  const auth = await requireAuth(c);
  const uid = (await auth.supabase.auth.getUser()).data.user?.id;
  if (!uid) throw new ApiError(401, "Not authenticated", "not_authenticated");
  const form = await c.req.formData();
  const file = form.get("file");
  const serviceId = z.string().min(1).parse(form.get("service_id") ?? "");
  if (!(file instanceof File)) throw new ApiError(400, "file is required", "invalid_file");
  const fileExt = file.name.split(".").pop() || "jpg";
  const fileName = `${uid}/${serviceId}/${Date.now()}.${fileExt}`;
  const storage = createSupabaseAdminClient().storage.from(SERVICE_IMAGES_BUCKET);
  const { error: uploadError } = await storage.upload(fileName, file);
  if (uploadError) throw new Error(uploadError.message);
  const { data: { publicUrl } } = storage.getPublicUrl(fileName);
  const admin = createSupabaseAdminClient() as any;
  const { error: dbError } = await admin.from("service_images").insert({
    user_id: uid,
    service_id: serviceId,
    image_url: publicUrl,
    caption: typeof form.get("caption") === "string" ? form.get("caption") : null,
    image_type: typeof form.get("image_type") === "string" ? form.get("image_type") : "photo",
    sort_order: Number(form.get("sort_order") ?? 0) || 0,
  });
  if (dbError) throw new Error(dbError.message);
  return json({ data: { ok: true } });
});

platformRouter.delete("/v1/platform/service-images/:id", async (c) => {
  const url = new URL(c.req.url);
  const imageUrl = url.searchParams.get("image_url") ?? "";
  const admin = createSupabaseAdminClient() as any;
  const urlParts = imageUrl.split("/service-images/");
  if (urlParts[1]) {
    await admin.storage.from(SERVICE_IMAGES_BUCKET).remove([urlParts[1]]);
  }
  const { error } = await admin.from("service_images").delete().eq("id", c.req.param("id"));
  if (error) throw error;
  return json({ data: { ok: true } });
});

platformRouter.post("/v1/platform/ai/transcribe", async (c) => {
  const body = z.object({ audio: z.string().min(1), mimeType: z.string().min(1) }).parse(await c.req.json());
  const result = await invokeEdgeFunction(c, "transcribe-audio", { body });
  if (isEdgeError(result)) throw new ApiError(result.status || 502, result.detail || result.message, "transcribe_failed");
  return json(result.data ?? {});
});

platformRouter.get("/v1/platform/ai/agents", async (c) => {
  const anon = createSupabaseAnonServerClient() as any;
  const { data, error } = await anon
    .from("ai_agents")
    .select("slug,name,role,avatar,color,display_order")
    .eq("is_active", true)
    .order("display_order");
  if (error) throw error;
  return json(data ?? []);
});

platformRouter.get("/v1/platform/link-health", async (c) => {
  const { supabase } = await requireAuth(c);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new ApiError(401, "Not authenticated", "not_authenticated");
  const { data, error } = await (supabase as any)
    .from("business_profiles")
    .select("booking_slug, google_review_url, yelp_review_url, website_url")
    .eq("user_id", user.id)
    .maybeSingle();
  return json({ data: data ?? null, error: error ?? null });
});

platformRouter.get("/v1/platform/posthog-organization", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const url = new URL(c.req.url);
  const organizationId = z.string().uuid().parse(url.searchParams.get("organization_id") ?? "");
  if (organizationId !== user.id) throw new ApiError(403, "Organization analytics access denied", "forbidden");

  const canonical = await loadCanonicalOnboardingProfile(supabase, user.id);
  if (!canonical.workspace) return json(null);
  const operational = readOperationalObject(canonical.settings?.operational_settings);
  return json({
    business_name: canonical.workspace.name,
    created_at: canonical.workspace.created_at ?? null,
    onboarding_completed: Boolean(canonical.profile?.onboarding_completed),
    marketplace_opt_in: canonical.settings?.marketplace_opt_in ?? false,
    stripe_onboarding_complete: operational.stripe_onboarding_complete === true,
    stripe_charges_enabled: operational.stripe_charges_enabled === true,
    sms_transactional_enabled: operational.sms_transactional_enabled === true,
    sms_marketing_enabled: operational.sms_marketing_enabled === true,
    marketing_email_enabled: operational.marketing_email_enabled === true,
  });
});

// Weather guard (realtime subscriptions stay client-side; see weather-guard.query.ts).

platformRouter.get("/v1/platform/weather-guard/shop-context", async (c) => {
  const { supabase } = await requireAuth(c);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json(null);
  const { data, error } = await (supabase as any)
    .from("business_profiles")
    .select("service_address, service_coordinates, weather_guard_enabled, weather_guard_settings")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data) return json(null);
  const coords = (data.service_coordinates ?? null) as { lat?: number; lng?: number } | null;
  return json({
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    address: data.service_address ?? null,
    weatherGuardEnabled: data.weather_guard_enabled ?? false,
    settings: data.weather_guard_settings ?? null,
  });
});

platformRouter.post("/v1/platform/weather-guard/seed-rules", async (c) => {
  const { supabase } = await requireAuth(c);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ data: { ok: false } });
  const { error } = await (supabase as any).rpc("seed_default_dispatch_rules", { _user_id: user.id });
  if (error) throw error;
  return json({ data: { ok: true } });
});

platformRouter.get("/v1/platform/weather-guard/dispatch-rules", async (c) => {
  const { supabase } = await requireAuth(c);
  const { data, error } = await (supabase as any)
    .from("dispatch_rules")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return json(data ?? []);
});

platformRouter.patch("/v1/platform/weather-guard/dispatch-rules/:id", async (c) => {
  const { supabase } = await requireAuth(c);
  const patch = z.record(z.string(), z.unknown()).parse(await c.req.json());
  const { error } = await (supabase as any).from("dispatch_rules").update(patch).eq("id", c.req.param("id"));
  if (error) throw error;
  return json({ data: { ok: true } });
});

platformRouter.get("/v1/platform/weather-guard/at-risk", async (c) => {
  const { supabase } = await requireAuth(c);
  const url = new URL(c.req.url);
  const today = url.searchParams.get("today") ?? new Date().toISOString().slice(0, 10);
  const horizon = url.searchParams.get("horizon") ?? today;
  const { data, error } = await (supabase as any)
    .from("appointments")
    .select("id, title, scheduled_date, scheduled_time, duration_minutes, status, location_address, guest_name, weather_risk_score, weather_decision, weather_evaluated_at")
    .gte("scheduled_date", today)
    .lte("scheduled_date", horizon)
    .is("deleted_at", null)
    .order("scheduled_date", { ascending: true })
    .order("scheduled_time", { ascending: true });
  if (error) throw error;
  return json(data ?? []);
});

platformRouter.get("/v1/platform/weather-guard/risk-logs", async (c) => {
  const { supabase } = await requireAuth(c);
  const url = new URL(c.req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 20) || 20, 1), 200);
  const { data, error } = await (supabase as any)
    .from("weather_risk_logs")
    .select("*")
    .order("evaluated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return json(data ?? []);
});

platformRouter.post("/v1/platform/weather-guard/evaluate", async (c) => {
  const { appointmentId } = z.object({ appointmentId: z.string().min(1) }).parse(await c.req.json());
  const result = await invokeEdgeFunction(c, "weather-guard-evaluate", { body: { appointmentId } });
  if (isEdgeError(result)) throw new ApiError(result.status || 502, result.detail || result.message, "weather_evaluate_failed");
  return json(result.data ?? null);
});

platformRouter.post("/v1/platform/weather-guard/action", async (c) => {
  const body = z.object({
    appointmentId: z.string().min(1),
    decision: z.string().min(1),
    reason: z.string(),
  }).parse(await c.req.json());
  const result = await invokeEdgeFunction(c, "weather-guard-action", { body });
  if (isEdgeError(result)) throw new ApiError(result.status || 502, result.detail || result.message, "weather_action_failed");
  return json(result.data ?? null);
});

platformRouter.post("/v1/platform/weather-guard/check-slot", async (c) => {
  const body = z.record(z.string(), z.unknown()).parse(await c.req.json());
  const result = await invokeEdgeFunction(c, "weather-guard-check-slot", { body });
  if (isEdgeError(result)) throw new ApiError(result.status || 502, result.detail || result.message, "weather_check_failed");
  return json(result.data ?? null);
});

// Google Calendar sync.

platformRouter.get("/v1/platform/google-calendar/status", async (c) => {
  const result = await invokeEdgeFunction(c, "google-calendar-sync", { body: { mode: "status" } });
  if (isEdgeError(result)) throw new ApiError(result.status || 502, result.detail || result.message, "google_calendar_failed");
  return json(result.data ?? null);
});

platformRouter.post("/v1/platform/google-calendar/invoke", async (c) => {
  const { body } = z.object({ body: z.record(z.string(), z.unknown()) }).parse(await c.req.json());
  const result = await invokeEdgeFunction(c, "google-calendar-sync", { body });
  if (isEdgeError(result)) {
    // Surface the clean message from the edge JSON body when available.
    let message = result.detail || result.message;
    try {
      const parsed = JSON.parse(result.detail || "") as { error?: unknown };
      if (typeof parsed.error === "string" && parsed.error) message = parsed.error;
    } catch { /* keep fallback */ }
    throw new ApiError(result.status || 502, message, "google_calendar_error");
  }
  const data = result.data as { error?: unknown } | null;
  if (data && typeof data.error === "string" && data.error) {
    throw new ApiError(502, data.error, "google_calendar_error");
  }
  return json({ data });
});

// ---------------------------------------------------------------------------
// Whitelisted edge-function proxy — POST /v1/platform/edge/:functionName
//
// Several UI surfaces invoke Supabase edge functions directly. All browser
// traffic must flow through the Hono API, so this endpoint proxies a
// whitelisted set of edge functions with the caller's auth session. The
// whitelist is deliberately narrow; add names here only after reviewing the
// function's auth model.
// ---------------------------------------------------------------------------

const EDGE_PROXY_WHITELIST = new Set([
  "gdpr-data-export",
  "gdpr-account-deletion",
  "ai-assistant",
  "google-insights",
  "transcribe-audio",
  "training-progress",
  "complete-training-module",
]);

platformRouter.post("/v1/platform/edge/:functionName", async (c) => {
  const functionName = c.req.param("functionName");
  if (!EDGE_PROXY_WHITELIST.has(functionName)) {
    throw new ApiError(404, `Edge function "${functionName}" is not available through the API`, "edge_function_not_found");
  }
  const raw = await c.req.json().catch(() => ({}));
  const body = (raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>).body : undefined) ?? raw;

  // The AI assistant streams Server-Sent Events; pipe the edge function's
  // stream straight through instead of buffering it as JSON.
  if (functionName === "ai-assistant") {
    const { supabase } = await requireAuth(c);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new ApiError(401, "Not authenticated", "unauthorized");
    const upstream = await fetch(`${supabaseFunctionsBaseUrl()}/ai-assistant`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
        "apikey": supabasePublishableKey(),
      },
      body: JSON.stringify(body ?? {}),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") ?? "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  }

  const result = await invokeEdgeFunction(c, functionName, { body });
  if (isEdgeError(result)) {
    throw new ApiError(result.status || 502, result.detail || result.message, "edge_function_failed");
  }
  return json({ data: result.data ?? null });
});

// Auth security events (fire-and-forget audit RPCs from auth.command.ts).

platformRouter.post("/v1/platform/auth/security-event", async (c) => {
  const { user } = await requireAuth(c);
  const { event_type } = z.object({ event_type: z.string().min(1).max(80) }).parse(await c.req.json());
  const admin = createSupabaseAdminClient();
  const workspaceId = await resolveWorkspaceIdForUser(admin as any, user.id);
  const { error } = await (admin as any).from("audit_events").insert({
    workspace_id: workspaceId,
    actor_user_id: user.id,
    action: `auth.${event_type}`,
    entity_type: "auth_session",
    entity_id: null,
    metadata: { source: "platform_auth_security_event" },
  });
  if (error) throw error;
  return json({ data: { ok: true, verified: true } });
});
