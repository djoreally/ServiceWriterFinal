/**
 * Appointments domain router (Phase 1 Hono migration).
 *
 * Migrated from:
 * - app/api/v1/appointments/route.ts (GET, POST)
 * - app/api/v1/appointments/[id]/route.ts (GET, PATCH, DELETE)
 * - app/api/v1/appointments/[id]/complete/route.ts (POST)
 * - app/api/v1/appointments/[id]/confirmation/route.ts (POST)
 * - app/api/v1/appointments/[id]/start/route.ts (POST)
 * - app/api/v1/appointments/[id]/technician-status/route.ts (POST)
 * - app/api/v1/appointment-items/route.ts (GET, PUT)
 * - app/api/v1/dispatch-events/route.ts (GET, POST)
 * - app/api/v1/dispatch/assign/route.ts (POST)
 * - app/api/v1/workforce-identity/route.ts (GET, POST)
 *
 * Paths are registered RELATIVE to /api (basePath in app.ts handles the
 * prefix). Handler bodies are verbatim copies of the Next.js originals; only
 * signatures/wrapping changed, and the per-handler try/catch + errorResponse
 * wrapper was removed (app-level onError handles thrown errors).
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { ApiError, json, paginationSchema } from "@/server/api";
import { requireAuth, requireWorkspaceAuth } from "@/server/hono/middleware/auth";
import { dispatchAppointmentLifecycle } from "@/server/messaging/appointment-events";
import { dispatchLifecycleEvent, LIFECYCLE_EVENT_KEYS } from "@/server/messaging/lifecycle-events";
import { zonedDateTimeParts, zonedLocalDateTimeToUtc } from "@/server/scheduling/timezone";
import { syncCanonicalInvoiceToStripe } from "@/server/payments/stripe-invoice-sync";
import { technicianJobUrl } from "@/server/messaging/lifecycle-action-urls";
import { createSupabaseAdminClient, createSupabaseBrowserClient, createSupabaseRequestClient } from "@/lib/supabase";
import { z } from "zod";

export const appointmentsRouter = new Hono();

// ---------------------------------------------------------------------------
// POST /v1/appointments + GET /v1/appointments
// ---------------------------------------------------------------------------

// Booking input schema + shared booking core live in
// src/server/appointments/book-appointment.ts (the ONE booking path —
// the Hono route and the Shop Agent both call bookAppointmentCore).
import { appointmentBookingSchema, bookAppointmentCore, isArchivedVehicle } from "@/server/appointments/book-appointment";

appointmentsRouter.get("/v1/appointments", async (c: Context) => {
  const url = new URL(c.req.url), workspaceId = url.searchParams.get("workspace_id");
  if (!workspaceId) throw new Error("workspace_id is required");
  const { supabase } = await requireWorkspaceAuth(c, workspaceId);
  const { limit, offset } = paginationSchema.parse(Object.fromEntries(url.searchParams));
  const { data, error } = await supabase.from("appointments").select("*,customers(id,first_name,last_name,email,phone),vehicles(id,customer_id,year,make,model,vin,license_plate,plate_region,color,mileage,notes),locations(id,name)").eq("workspace_id", workspaceId).order("starts_at").range(offset, offset + limit - 1);
  if (error) throw error;
  return json({ data: data ?? [], pagination: { limit, offset } });
});

appointmentsRouter.post("/v1/appointments", async (c: Context) => {
  const body = appointmentBookingSchema.parse(await c.req.json());
  const { supabase, user } = await requireWorkspaceAuth(c, body.workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist", "dispatcher"]);
  // One booking path: validation + availability checks + insert all live in
  // bookAppointmentCore. Auth (membership + role list) stays on the route.
  const result = await bookAppointmentCore(supabase, body, { createdBy: user.id });
  if ("error" in result) return result.error;
  return json({ data: result.data }, { status: 201 });
});

// ---------------------------------------------------------------------------
// Phase 2 — appointments-domain migration endpoints (single-segment reads).
// Registered BEFORE /v1/appointments/:id so Hono matches them first.
// The workspace is always resolved server-side from the auth token; the
// client may pass selected_workspace_id only as a disambiguation hint.
// ---------------------------------------------------------------------------

/** Resolve the caller's workspace server-side; never trust a client id for authz. */
async function resolveCallerWorkspaceId(supabase: any, userId: string, selectedWorkspaceId?: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("workspace_id", { ascending: true });
  if (error) throw error;
  const ids = ((data ?? []) as Array<{ workspace_id: string }>).map((row) => row.workspace_id);
  if (selectedWorkspaceId && ids.includes(selectedWorkspaceId)) return selectedWorkspaceId;
  return ids[0] ?? null;
}

async function requireCallerWorkspace(c: Context, selectedWorkspaceId?: string) {
  const { supabase, user } = await requireAuth(c);
  const workspaceId = await resolveCallerWorkspaceId(supabase, user.id, selectedWorkspaceId);
  if (!workspaceId) throw new ApiError(400, "No active workspace", "no_workspace");
  return { supabase, user, workspaceId };
}

const STAFF_ROLES = ["owner", "admin", "manager", "dispatcher", "service_advisor", "receptionist", "fleet_manager"];

async function requireStaffWorkspace(c: Context, selectedWorkspaceId?: string) {
  const { supabase, user, workspaceId } = await requireCallerWorkspace(c, selectedWorkspaceId);
  const { data, error } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!STAFF_ROLES.includes(String((data as { role?: string } | null)?.role ?? ""))) {
    throw new ApiError(403, "Insufficient permissions", "forbidden");
  }
  return { supabase, user, workspaceId };
}

/**
 * Invoke a Supabase edge function server-side with the caller's identity.
 * Mirrors the platform.ts proxy helper so client modules that previously
 * called `supabase.functions.invoke(...)` can POST here instead.
 */
async function invokeDomainEdgeFunction(c: Context, functionName: string, body: unknown) {
  const { supabase } = await requireAuth(c);
  const { data, error } = await supabase.functions.invoke(functionName, { body });
  if (error) {
    const status = typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 502;
    let detail = "";
    const context = (error as { context?: unknown }).context;
    if (context && typeof (context as { text?: unknown }).text === "function") {
      try { detail = await (context as Response).text(); } catch { detail = ""; }
    }
    throw new ApiError(status, detail || error.message || "Edge function failed", "edge_function_failed");
  }
  return data ?? null;
}

function selectedWorkspaceHint(url: URL): string | undefined {
  return url.searchParams.get("selected_workspace_id") ?? undefined;
}

/**
 * Phase-2 flexible workspace resolution for Phase-1 endpoints whose bodies
 * once carried an explicit workspace_id. The explicit id is now treated only
 * as a disambiguation hint: the workspace is resolved server-side from the
 * auth token, and membership + role are re-verified by requireWorkspaceAuth.
 * Legacy clients keep working; new clients omit workspace_id entirely.
 */
async function requireWorkspaceFromBody(
  c: Context,
  body: { workspace_id?: unknown; selected_workspace_id?: unknown },
  roles?: string[],
) {
  const hint = typeof body.workspace_id === "string" && body.workspace_id.length > 0
    ? body.workspace_id
    : typeof body.selected_workspace_id === "string" && body.selected_workspace_id.length > 0
      ? body.selected_workspace_id
      : undefined;
  const { workspaceId } = await requireCallerWorkspace(c, hint);
  const auth = await requireWorkspaceAuth(c, workspaceId, roles);
  return { ...auth, workspace_id: workspaceId };
}

// GET /v1/appointments/service-catalog — active catalog for the booking/scheduling UI.
appointmentsRouter.get("/v1/appointments/service-catalog", async (c: Context) => {
  const { supabase, workspaceId } = await requireCallerWorkspace(c, selectedWorkspaceHint(new URL(c.req.url)));
  const { data, error } = await (supabase as any)
    .from("service_catalog")
    .select("id,name,description,labor_price,estimated_minutes,category,is_active,metadata")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return json({ data: data ?? [] });
});

// GET /v1/appointments/scheduling-settings — full workspace_settings row for scheduling.
appointmentsRouter.get("/v1/appointments/scheduling-settings", async (c: Context) => {
  const { supabase, workspaceId } = await requireCallerWorkspace(c, selectedWorkspaceHint(new URL(c.req.url)));
  const { data, error } = await supabase
    .from("workspace_settings")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  return json({ settings: data ?? null });
});

// GET /v1/appointments/service-lines — appointment_services rows (price/quantity/vehicle)
// for the workspace's appointments. appointment_services has no workspace_id
// column, so scoping goes through the appointments table.
appointmentsRouter.get("/v1/appointments/service-lines", async (c: Context) => {
  const { supabase, workspaceId } = await requireCallerWorkspace(c, selectedWorkspaceHint(new URL(c.req.url)));
  const db = supabase as any;
  const { data: appointmentRows, error: idsError } = await db
    .from("appointments")
    .select("id")
    .eq("workspace_id", workspaceId);
  if (idsError) throw idsError;
  const ids = ((appointmentRows ?? []) as Array<{ id: string }>).map((row) => row.id);
  const { data, error } = ids.length
    ? await db.from("appointment_services").select("appointment_id,vehicle_id,price,quantity").in("appointment_id", ids)
    : { data: [], error: null };
  if (error) throw error;
  return json({ data: data ?? [] });
});

// GET /v1/appointments/day-appointments — raw appointments for one workspace-local
// day plus the workspace timezone; the client keeps the BookedSlot mapping logic.
// GET /v1/appointments/dispatchable — unfinished appointments for the dispatch monitor dropdown.
appointmentsRouter.get("/v1/appointments/dispatchable", async (c: Context) => {
  const url = new URL(c.req.url);
  const { supabase, workspaceId } = await requireCallerWorkspace(c, selectedWorkspaceHint(url));
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));
  const { data, error } = await (supabase as any)
    .from("appointments")
    .select("id,status,starts_at,ends_at,metadata")
    .eq("workspace_id", workspaceId)
    .not("status", "in", '("completed","cancelled")')
    .order("starts_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return json({ data: data ?? [] });
});

appointmentsRouter.get("/v1/appointments/day-appointments", async (c: Context) => {
  const url = new URL(c.req.url);
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(url.searchParams.get("date"));
  const { supabase, workspaceId } = await requireCallerWorkspace(c, selectedWorkspaceHint(url));
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("timezone")
    .eq("id", workspaceId)
    .maybeSingle();
  if (workspaceError) throw workspaceError;
  const timezone = (workspace as { timezone?: string } | null)?.timezone || "UTC";
  const start = zonedLocalDateTimeToUtc(date, "00:00:00", timezone);
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const end = zonedLocalDateTimeToUtc(next.toISOString().slice(0, 10), "00:00:00", timezone);
  const { data, error } = await supabase
    .from("appointments")
    .select("id,starts_at,ends_at,status")
    .eq("workspace_id", workspaceId)
    .not("status", "in", '("cancelled","no_show")')
    .lt("starts_at", end.toISOString())
    .gt("ends_at", start.toISOString())
    .order("starts_at", { ascending: true });
  if (error) throw error;
  return json({ timezone, appointments: data ?? [] });
});

// GET /v1/appointments/availability-page — scheduling settings + blackout dates + intake questions.
appointmentsRouter.get("/v1/appointments/availability-page", async (c: Context) => {
  const { supabase, workspaceId } = await requireCallerWorkspace(c, selectedWorkspaceHint(new URL(c.req.url)));
  const db = supabase as any;
  const [settingsResult, workspaceResult, blockedResult, questionsResult] = await Promise.all([
    supabase
      .from("workspace_settings")
      .select("day_hours, buffer_time_before, buffer_time_after, min_lead_time_hours, max_advance_days, allow_multi_day_bookings, slot_duration_minutes, require_approval, cancellation_window_hours, allow_cancellation, allow_rescheduling, reschedule_window_hours, terms_and_conditions, require_terms_acceptance")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    supabase.from("workspaces").select("timezone").eq("id", workspaceId).maybeSingle(),
    db.from("workspace_blackout_dates").select("id, blocked_date, reason").eq("workspace_id", workspaceId).order("blocked_date", { ascending: true }),
    db.from("workspace_intake_questions").select("id, question_text, question_type, options, is_required, sort_order, is_active").eq("workspace_id", workspaceId).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
  ]);
  if (settingsResult.error) throw settingsResult.error;
  if (workspaceResult.error) throw workspaceResult.error;
  if (blockedResult.error) throw blockedResult.error;
  if (questionsResult.error) throw questionsResult.error;
  const profile = settingsResult.data
    ? { ...settingsResult.data, timezone: (workspaceResult.data as { timezone?: string } | null)?.timezone ?? "UTC" }
    : null;
  return json({ profile, blocked: blockedResult.data ?? [], questions: questionsResult.data ?? [] });
});

// ---------------------------------------------------------------------------
// GET/PATCH/DELETE /v1/appointments/:id
// ---------------------------------------------------------------------------

const patchSchema = z.object({
  workspace_id: z.string().uuid(), customer_id: z.string().uuid().nullable().optional(), vehicle_id: z.string().uuid().nullable().optional(), location_id: z.string().uuid().nullable().optional(), assigned_user_id: z.string().uuid().nullable().optional(), starts_at: z.string().datetime().optional(), ends_at: z.string().datetime().optional(), scheduled_date: z.string().date().optional(), scheduled_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(), duration_minutes: z.number().int().min(5).max(1440).optional(), status: z.string().trim().max(40).optional(), source: z.string().trim().max(40).optional(), notes: z.string().max(5000).nullable().optional(), title: z.string().trim().min(1).max(200).optional(), description: z.string().max(5000).nullable().optional(), guest_name: z.string().max(200).nullable().optional(), guest_email: z.string().email().max(320).nullable().optional(), guest_phone: z.string().max(40).nullable().optional(), service_catalog_id: z.string().uuid().nullable().optional(), estimated_cost: z.number().nonnegative().nullable().optional(), tax_amount: z.number().nonnegative().nullable().optional(), location_address: z.string().max(500).nullable().optional(), customer_city: z.string().max(120).nullable().optional(), customer_state: z.string().max(120).nullable().optional(), customer_postal_code: z.string().max(24).nullable().optional(), override_availability: z.boolean().optional(),
}).refine((value) => Object.keys(value).some((key) => key !== "workspace_id"), { message: "At least one appointment field is required" });

const compatibilityKeys = ["title", "description", "guest_name", "guest_email", "guest_phone", "service_catalog_id", "estimated_cost", "tax_amount", "location_address", "customer_city", "customer_state", "customer_postal_code"] as const;

function pad(value: number) { return String(value).padStart(2, "0"); }
function hasOwn(value: object, key: string) { return Object.prototype.hasOwnProperty.call(value, key); }

async function validatePatchReferences(supabase: any, workspaceId: string, body: z.infer<typeof patchSchema>, current: { customer_id: string | null; vehicle_id: string | null; location_id: string | null }) {
  const targetCustomer = hasOwn(body, "customer_id") ? body.customer_id ?? null : current.customer_id;
  const targetVehicle = hasOwn(body, "vehicle_id") ? body.vehicle_id ?? null : current.vehicle_id;
  const targetLocation = hasOwn(body, "location_id") ? body.location_id ?? null : current.location_id;
  if (targetCustomer) { const { data, error } = await supabase.from("customers").select("id,status").eq("workspace_id", workspaceId).eq("id", targetCustomer).maybeSingle(); if (error) throw error; if (!data || data.status === "archived") return json({ error: { code: "invalid_customer", message: "The selected customer is not available in this workspace." } }, { status: 400 }); }
  if (targetVehicle) { if (!targetCustomer) return json({ error: { code: "invalid_vehicle", message: "A vehicle cannot be assigned without a customer." } }, { status: 400 }); const { data, error } = await supabase.from("vehicles").select("id,customer_id,metadata").eq("workspace_id", workspaceId).eq("id", targetVehicle).maybeSingle(); if (error) throw error; if (!data || isArchivedVehicle(data.metadata) || data.customer_id !== targetCustomer) return json({ error: { code: "invalid_vehicle", message: "The selected vehicle does not belong to this customer in this workspace." } }, { status: 400 }); }
  if (targetLocation) { const { data, error } = await supabase.from("locations").select("id").eq("workspace_id", workspaceId).eq("id", targetLocation).maybeSingle(); if (error) throw error; if (!data) return json({ error: { code: "invalid_location", message: "The selected location is not available in this workspace." } }, { status: 400 }); }
  if (hasOwn(body, "service_catalog_id") && body.service_catalog_id) { const { data, error } = await supabase.from("service_catalog").select("id").eq("workspace_id", workspaceId).eq("id", body.service_catalog_id).eq("is_active", true).maybeSingle(); if (error) throw error; if (!data) return json({ error: { code: "invalid_service", message: "The selected service is not active in this workspace." } }, { status: 400 }); }
  return null;
}

appointmentsRouter.get("/v1/appointments/:id", async (c: Context) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const url = new URL(c.req.url);
  const explicitWorkspaceId = url.searchParams.get("workspace_id");
  let workspaceId: string;
  let supabase: any;
  if (explicitWorkspaceId) {
    workspaceId = z.string().uuid().parse(explicitWorkspaceId);
    ({ supabase } = await requireWorkspaceAuth(c, workspaceId));
  } else {
    ({ supabase, workspaceId } = await requireCallerWorkspace(c, selectedWorkspaceHint(url)));
  }
  const { data, error } = await supabase.from("appointments").select("*,customers(id,first_name,last_name,company_name,email,phone,address_line1,address_line2,city,region,postal_code,notes),vehicles(id,customer_id,year,make,model,vin,license_plate,plate_region,color,mileage,notes)").eq("workspace_id", workspaceId).eq("id", id).single();
  if (error) throw error;
  return json({ data });
});

appointmentsRouter.patch("/v1/appointments/:id", async (c: Context) => {
  const id = z.string().uuid().parse(c.req.param("id")), body = patchSchema.parse(await c.req.json()), { workspace_id } = body;
  const { supabase } = await requireWorkspaceAuth(c, workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist", "dispatcher"]);
  const [{ data: current, error: currentError }, { data: workspace, error: workspaceError }] = await Promise.all([supabase.from("appointments").select("id,workspace_id,customer_id,vehicle_id,location_id,starts_at,ends_at,status,assigned_user_id,metadata").eq("id", id).eq("workspace_id", workspace_id).single(), supabase.from("workspaces").select("name,timezone").eq("id", workspace_id).single()]);
  if (currentError || !current) throw currentError ?? new Error("Appointment was not found in this workspace.");
  if (workspaceError || !workspace) throw workspaceError ?? new Error("Workspace was not found.");
  const workspaceTimezone = workspace.timezone || "UTC";
  const referenceError = await validatePatchReferences(supabase, workspace_id, body, current);
  if (referenceError) return referenceError;
  const assigned = hasOwn(body, "assigned_user_id") ? body.assigned_user_id ?? null : current.assigned_user_id;
  if (assigned) { const { data, error } = await supabase.from("workspace_members").select("user_id").eq("workspace_id", workspace_id).eq("user_id", assigned).eq("is_active", true).maybeSingle(); if (error) throw error; if (!data) return json({ error: { code: "invalid_assignment", message: "The assigned user is not an active member of this workspace." } }, { status: 400 }); }
  let startsAt = body.starts_at ?? current.starts_at, endsAt = body.ends_at ?? current.ends_at;
  if (body.scheduled_date || body.scheduled_time || body.duration_minutes) { const parts = zonedDateTimeParts(new Date(current.starts_at), workspaceTimezone), date = `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`, time = `${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`, local = zonedLocalDateTimeToUtc(body.scheduled_date ?? date, body.scheduled_time ?? time, workspaceTimezone); startsAt = local.toISOString(); const duration = body.duration_minutes ?? Math.max(5, Math.round((Date.parse(current.ends_at) - Date.parse(current.starts_at)) / 60000)); endsAt = new Date(local.getTime() + duration * 60000).toISOString(); } else if (body.starts_at && !body.ends_at) { const duration = Math.max(300000, Date.parse(current.ends_at) - Date.parse(current.starts_at)); endsAt = new Date(Date.parse(body.starts_at) + duration).toISOString(); }
  if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error("ends_at must be after starts_at");
  if ((startsAt !== current.starts_at || endsAt !== current.ends_at) && body.override_availability !== true) { const { data: conflicts, error } = await supabase.from("appointments").select("id").eq("workspace_id", workspace_id).neq("id", id).not("status", "in", '("cancelled","no_show")').lt("starts_at", endsAt).gt("ends_at", startsAt).limit(1); if (error) throw error; if (conflicts?.length) return json({ error: { code: "schedule_conflict", message: "The requested time overlaps an existing appointment." } }, { status: 409 }); }
  const existing = current.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata) ? current.metadata as Record<string, unknown> : {};
  const metadata = { ...existing };
  for (const key of compatibilityKeys) if (hasOwn(body, key)) metadata[key] = body[key] ?? null;
  if (hasOwn(body, "override_availability")) metadata.override_availability = body.override_availability === true;
  if (hasOwn(body, "status") && body.status === "in_progress" && current.status !== "in_progress" && !metadata.actual_start_time) metadata.actual_start_time = new Date().toISOString();
  const canonicalPatch: Record<string, unknown> = { starts_at: startsAt, ends_at: endsAt, metadata, updated_at: new Date().toISOString() };
  for (const key of ["customer_id", "vehicle_id", "location_id", "assigned_user_id", "status", "source", "notes"] as const) if (hasOwn(body, key)) canonicalPatch[key] = body[key] ?? null;
  const { data, error } = await supabase.from("appointments").update(canonicalPatch as any).eq("id", id).eq("workspace_id", workspace_id).select("id,workspace_id,customer_id,starts_at,ends_at,status,assigned_user_id,notes,metadata,updated_at,customers(id,first_name,last_name,email),vehicles(id,year,make,model)").single();
  if (error) throw error;
  try {
    const updated = data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata) ? data.metadata as Record<string, unknown> : {};
    const customerUrl = typeof updated.manage_url === "string" && /^https?:\/\//i.test(updated.manage_url) ? updated.manage_url : new URL("/my-bookings", c.req.url).toString();
    const changed = Object.keys(body).filter(k => k !== "workspace_id" && k !== "override_availability");
    const eventKey = data.status === "cancelled" && current.status !== "cancelled" ? LIFECYCLE_EVENT_KEYS.appointmentCancelled : data.starts_at !== current.starts_at || data.ends_at !== current.ends_at ? LIFECYCLE_EVENT_KEYS.appointmentRescheduled : LIFECYCLE_EVENT_KEYS.bookingDetailsChanged;
    await dispatchAppointmentLifecycle({ eventKey, eventId: `${id}:${eventKey}:${data.updated_at}`, appointment: data, workspaceName: workspace.name ?? "Service Writer", workspaceTimezone, actionUrl: customerUrl, changedFields: changed });
  } catch (e) { console.error("[Lifecycle] appointment update email enqueue failed", e); }
  return json({ data });
});

appointmentsRouter.delete("/v1/appointments/:id", async (c: Context) => {
  const id = z.string().uuid().parse(c.req.param("id")), workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id"));
  const { supabase } = await requireWorkspaceAuth(c, workspaceId, ["owner", "admin", "manager", "service_advisor", "receptionist", "dispatcher"]);
  const { data, error } = await supabase.from("appointments").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", workspaceId).select("id,workspace_id,customer_id,starts_at,ends_at,status,notes,metadata,updated_at,customers(id,first_name,last_name,email),vehicles(id,year,make,model)").single();
  if (error) throw error;
  try {
    const { data: workspace } = await supabase.from("workspaces").select("name,timezone").eq("id", workspaceId).single();
    const metadata = data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata) ? data.metadata as Record<string, unknown> : {};
    const url = typeof metadata.manage_url === "string" && /^https?:\/\//i.test(metadata.manage_url) ? metadata.manage_url : new URL("/my-bookings", c.req.url).toString();
    await dispatchAppointmentLifecycle({ eventKey: LIFECYCLE_EVENT_KEYS.appointmentCancelled, eventId: `${id}:cancelled:${data.updated_at}`, appointment: data, workspaceName: workspace?.name ?? "Service Writer", workspaceTimezone: workspace?.timezone ?? "UTC", actionUrl: url });
  } catch (e) { console.error("[Lifecycle] appointment cancellation email enqueue failed", e); }
  return json({ data });
});

// ---------------------------------------------------------------------------
// POST /v1/appointments/:id/complete
// ---------------------------------------------------------------------------

const completeSchema = z.object({
  workspace_id: z.string().uuid().optional(),
  selected_workspace_id: z.string().uuid().optional(),
});

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function billingAllowsPayments(billing: unknown): boolean { const row = object(billing); return row.payments_addon_active === true && (row.subscription_status === "active" || row.subscription_status === "trialing"); }
function one<T>(value: T | T[] | null | undefined): T | null { return Array.isArray(value) ? value[0] ?? null : value ?? null; }

appointmentsRouter.post("/v1/appointments/:id/complete", async (c: Context) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const body = completeSchema.parse(await c.req.json());
  const { supabase, user, membership, workspace_id } = await requireWorkspaceFromBody(c, body, ["owner", "admin", "manager", "service_advisor", "receptionist", "dispatcher", "technician"]);
  const db = supabase as any;
  if (membership.role === "technician") { const { data: current, error: currentError } = await db.from("appointments").select("assigned_user_id,status").eq("workspace_id", workspace_id).eq("id", id).maybeSingle(); if (currentError) throw currentError; if (!current) throw new ApiError(404, "Appointment not found.", "not_found"); if (current.assigned_user_id !== user.id) throw new ApiError(403, "This appointment is not assigned to you.", "forbidden"); }
  const { data: closeout, error } = await db.rpc("complete_appointment_closeout_v1", { p_workspace_id: workspace_id, p_appointment_id: id });
  if (error) throw error;
  if (membership.role === "technician") { const { error: presenceError } = await db.rpc("set_technician_presence_v1", { p_workspace_id: workspace_id, p_status: "available", p_appointment_id: null, p_location: null }); if (presenceError) throw presenceError; }
  const closeoutData = object(closeout);
  const serviceRecordId = String(closeoutData.service_record_id ?? "");
  const invoiceId = String(closeoutData.invoice_id ?? "");
  const paymentId = String(closeoutData.payment_id ?? "");
  let stripeSync: Record<string, unknown> = { status: "skipped", reason: "payments_addon_inactive" };
  let actionUrl = new URL("/my-bookings", c.req.url).toString();
  const { data: billing, error: billingError } = await db.from("workspace_billing").select("payments_addon_active,subscription_status").eq("workspace_id", workspace_id).maybeSingle();
  if (billingError) throw billingError;
  if (invoiceId && paymentId && billingAllowsPayments(billing)) {
    try {
      const synced = await syncCanonicalInvoiceToStripe({ supabase, workspaceId: workspace_id, appointmentId: id, invoiceId, paymentId });
      stripeSync = synced as unknown as Record<string, unknown>;
      if (synced.hostedInvoiceUrl) actionUrl = synced.hostedInvoiceUrl;
    } catch (stripeError) {
      const message = stripeError instanceof Error ? stripeError.message : "Stripe synchronization failed";
      stripeSync = { status: "failed", provider: "stripe", error: message };
      console.error("[Closeout] Stripe invoice sync failed", { appointmentId: id, invoiceId, paymentId, message });
      const [{ data: invoice }, { data: payment }] = await Promise.all([db.from("invoices").select("metadata").eq("workspace_id", workspace_id).eq("id", invoiceId).maybeSingle(), db.from("payments").select("metadata").eq("workspace_id", workspace_id).eq("id", paymentId).maybeSingle()]);
      const failedAt = new Date().toISOString();
      await Promise.all([db.from("invoices").update({ metadata: { ...object(invoice?.metadata), stripe_sync_status: "failed", stripe_sync_error: message, stripe_sync_failed_at: failedAt } }).eq("workspace_id", workspace_id).eq("id", invoiceId), db.from("payments").update({ metadata: { ...object(payment?.metadata), stripe_sync_status: "failed", stripe_sync_error: message, stripe_sync_failed_at: failedAt } }).eq("workspace_id", workspace_id).eq("id", paymentId)]);
    }
  }

  let completionEmail: Record<string, unknown> = { status: "skipped" };
  let completionSummary: Record<string, unknown> = { status: "skipped" };
  let supportFollowUp: Record<string, unknown> = { status: "skipped" };
  try {
    const [{ data: appointment }, { data: workspace }, { data: serviceRecord }] = await Promise.all([
      db.from("appointments").select("id,workspace_id,customer_id,starts_at,ends_at,status,notes,metadata,updated_at,customers(id,first_name,last_name,email),vehicles(id,year,make,model)").eq("workspace_id", workspace_id).eq("id", id).single(),
      db.from("workspaces").select("name,timezone").eq("id", workspace_id).single(),
      serviceRecordId ? db.from("service_records").select("id,work_performed,mileage_at_service,status").eq("workspace_id", workspace_id).eq("id", serviceRecordId).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    if (appointment) {
      const queued = await dispatchAppointmentLifecycle({ eventKey: LIFECYCLE_EVENT_KEYS.serviceCompleted, eventId: `${id}:completed:${serviceRecordId}`, appointment, workspaceName: workspace?.name ?? "Service Writer", workspaceTimezone: workspace?.timezone ?? "UTC", actionUrl });
      completionEmail = queued ? { status: "queued", action_url: actionUrl } : { status: "skipped", reason: "customer_email_missing" };
      const customer = one<any>(appointment.customers);
      const vehicle = one<any>(appointment.vehicles);
      const recipientEmail = customer?.email ?? null;
      if (recipientEmail) {
        const customerName = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || "Customer";
        const vehicleDescription = [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(" ") || "Vehicle on file";
        const confirmationCode = String((appointment.metadata as any)?.confirmation_code || id.replace(/-/g, "").slice(0, 8).toUpperCase());
        const baseVariables = { "business.name": workspace?.name ?? "Service Writer", "business.timezone": workspace?.timezone ?? "UTC", "customer.first_name": customerName.split(/\s+/)[0], "customer.full_name": customerName, "appointment.confirmation_code": confirmationCode, "vehicle.description": vehicleDescription, "service.work_performed": serviceRecord?.work_performed || "Completed service", "service.mileage": serviceRecord?.mileage_at_service != null ? String(serviceRecord.mileage_at_service) : "Recorded on service record", "email.primary_action_url": actionUrl };
        const summary = await dispatchLifecycleEvent({ templateKey: LIFECYCLE_EVENT_KEYS.serviceCompletionSummary, eventId: `${id}:completion-summary:${serviceRecordId}`, entityType: "service_record", entityId: serviceRecordId || id, workspaceId: workspace_id, customerId: appointment.customer_id, recipientEmail, recipientRole: "customer", variables: baseVariables, metadata: { appointmentId: id, serviceRecordId, invoiceId, paymentId } });
        completionSummary = { status: summary.status };
        const supportUrl = new URL("/support", c.req.url).toString();
        const support = await dispatchLifecycleEvent({ templateKey: LIFECYCLE_EVENT_KEYS.supportFollowUp, eventId: `${id}:support-follow-up:${serviceRecordId}`, entityType: "service_record", entityId: serviceRecordId || id, workspaceId: workspace_id, customerId: appointment.customer_id, recipientEmail, recipientRole: "customer", variables: { ...baseVariables, "email.primary_action_url": supportUrl }, metadata: { appointmentId: id, serviceRecordId, purpose: "post_service_support" } });
        supportFollowUp = { status: support.status, action_url: supportUrl };
      }
    }
  } catch (dispatchError) {
    const message = dispatchError instanceof Error ? dispatchError.message : "Post-service email enqueue failed";
    completionEmail = completionEmail.status === "queued" ? completionEmail : { status: "failed", error: message };
    console.error("[Lifecycle] post-service email enqueue failed", dispatchError);
  }
  return json({ data: { ...closeoutData, stripe_sync: stripeSync, completion_email: completionEmail, completion_summary: completionSummary, support_follow_up: supportFollowUp } });
});

// ---------------------------------------------------------------------------
// POST /v1/appointments/:id/confirmation
// ---------------------------------------------------------------------------

const confirmationSchema = z.object({
  workspace_id: z.string().uuid().optional(),
  selected_workspace_id: z.string().uuid().optional(),
});

/** Explicit staff-triggered customer confirmation email. */
appointmentsRouter.post("/v1/appointments/:id/confirmation", async (c: Context) => {
  const appointmentId = z.string().uuid().parse(c.req.param("id"));
  const body = confirmationSchema.parse(await c.req.json());
  const { supabase, workspace_id } = await requireWorkspaceFromBody(c, body, ["owner", "admin", "manager", "service_advisor", "receptionist", "dispatcher"]);

  const [{ data: appointment, error }, { data: workspace }, { data: items, error: itemsError }, { data: invoices, error: invoiceError }] = await Promise.all([
    supabase
      .from("appointments")
      .select("id,workspace_id,customer_id,starts_at,ends_at,status,notes,metadata,updated_at,customers(id,first_name,last_name,email),vehicles(id,year,make,model)")
      .eq("workspace_id", workspace_id)
      .eq("id", appointmentId)
      .single(),
    supabase.from("workspaces").select("name,timezone").eq("id", workspace_id).single(),
    supabase
      .from("appointment_items")
      .select("description,quantity,unit_price,sort_order,created_at")
      .eq("workspace_id", workspace_id)
      .eq("appointment_id", appointmentId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("invoices")
      .select("id,invoice_number,total,status,amount_paid")
      .eq("workspace_id", workspace_id)
      .contains("metadata", { appointment_id: appointmentId })
      .limit(1),
  ]);
  if (error || !appointment) throw error ?? new Error("Appointment not found.");
  if (itemsError) throw itemsError;
  if (invoiceError) throw invoiceError;

  const invoice = invoices?.[0];
  const serviceSummary = (items ?? [])
    .map((item) => {
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const price = Number(item.unit_price) || 0;
      const lineTotal = (price * quantity).toLocaleString("en-US", { style: "currency", currency: "USD" });
      return `${item.description}${quantity > 1 ? ` × ${quantity}` : ""} — ${lineTotal}`;
    })
    .join("; ");

  const existingMetadata = appointment.metadata && typeof appointment.metadata === "object" && !Array.isArray(appointment.metadata)
    ? appointment.metadata as Record<string, unknown>
    : {};
  const enrichedAppointment = {
    ...appointment,
    metadata: {
      ...existingMetadata,
      ...(serviceSummary ? { title: serviceSummary } : {}),
      ...(invoice ? {
        estimated_cost: Number(invoice.total),
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        invoice_status: invoice.status,
        amount_paid: Number(invoice.amount_paid),
      } : {}),
    },
  };

  const result = await dispatchAppointmentLifecycle({
    eventKey: LIFECYCLE_EVENT_KEYS.bookingCreated,
    eventId: `${appointmentId}:staff-confirmation:${appointment.updated_at ?? appointment.starts_at}`,
    appointment: enrichedAppointment,
    workspaceName: workspace?.name ?? "Service Writer",
    workspaceTimezone: workspace?.timezone ?? "UTC",
    actionUrl: new URL("/my-bookings", c.req.url).toString(),
  });

  if (!result) return json({ error: { code: "missing_recipient", message: "The appointment has no customer email address." } }, { status: 422 });
  return json({ data: { status: result.status, invoice_id: invoice?.id ?? null, invoice_number: invoice?.invoice_number ?? null } });
});

// ---------------------------------------------------------------------------
// POST /v1/appointments/:id/start
// ---------------------------------------------------------------------------

const startSchema = z.object({
  workspace_id: z.string().uuid().optional(),
  selected_workspace_id: z.string().uuid().optional(),
});

appointmentsRouter.post("/v1/appointments/:id/start", async (c: Context) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const body = startSchema.parse(await c.req.json());
  const { supabase, user, membership, workspace_id } = await requireWorkspaceFromBody(c, body, ["owner", "admin", "manager", "service_advisor", "receptionist", "dispatcher", "technician"]);
  const db = supabase as any;

  const { data: current, error: readError } = await db
    .from("appointments")
    .select("id,status,assigned_user_id,metadata,customer_id,vehicle_id")
    .eq("workspace_id", workspace_id)
    .eq("id", id)
    .maybeSingle();
  if (readError) throw readError;
  if (!current) return json({ error: { code: "not_found", message: "Appointment not found in this workspace." } }, { status: 404 });
  if (membership.role === "technician" && current.assigned_user_id !== user.id) {
    throw new ApiError(403, "This appointment is not assigned to you.", "forbidden");
  }
  if (current.status === "in_progress") return json({ data: { id, status: current.status, already_started: true } });
  if (["completed", "cancelled", "no_show"].includes(current.status)) {
    return json({ error: { code: "invalid_status", message: "This appointment can no longer be started." } }, { status: 409 });
  }

  if (!current.customer_id || !current.vehicle_id) return json({ error: { code: "missing_job_context", message: "Start Job requires customer and vehicle context." } }, { status: 409 });

  const metadata = current.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
    ? current.metadata as Record<string, unknown>
    : {};
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("appointments")
    .update({
      status: "in_progress",
      metadata: { ...metadata, dispatch_status: "started", actual_start_time: metadata.actual_start_time ?? now },
      updated_at: now,
    })
    .eq("workspace_id", workspace_id)
    .eq("id", id)
    .select("id,status,assigned_user_id,metadata,updated_at")
    .single();
  if (error) throw error;

  if (membership.role === "technician") {
    const { error: presenceError } = await db.rpc("set_technician_presence_v1", {
      p_workspace_id: workspace_id,
      p_status: "on_job",
      p_appointment_id: id,
      p_location: null,
    });
    if (presenceError) throw presenceError;
  }

  // Start Job is intentionally internal-only. It establishes the authoritative
  // start timestamp, in-progress state, and technician presence. Customer
  // communication begins only when there is something actionable to send,
  // such as an inspection recommendation/approval request.
  return json({ data: { ...data, already_started: false } });
});

// ---------------------------------------------------------------------------
// POST /v1/appointments/:id/technician-status
// ---------------------------------------------------------------------------

const technicianStatusSchema = z.object({
  workspace_id: z.string().uuid().optional(),
  selected_workspace_id: z.string().uuid().optional(),
  status: z.enum(["acknowledged", "en_route", "arrived"]),
  location: z.object({ lat: z.number().finite(), lng: z.number().finite() }).nullable().optional(),
});

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

appointmentsRouter.post("/v1/appointments/:id/technician-status", async (c: Context) => {
  const appointmentId = z.string().uuid().parse(c.req.param("id"));
  const body = technicianStatusSchema.parse(await c.req.json());
  const { supabase, user, membership, workspace_id } = await requireWorkspaceFromBody(c, body, ["owner", "admin", "manager", "service_advisor", "receptionist", "dispatcher", "technician"]);
  const db = supabase as any;

  const { data: current, error: currentError } = await db
    .from("appointments")
    .select("id,status,assigned_user_id,metadata")
    .eq("workspace_id", workspace_id)
    .eq("id", appointmentId)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current) throw new ApiError(404, "Appointment not found.", "not_found");
  if (["completed", "cancelled", "no_show"].includes(current.status)) {
    throw new ApiError(409, "This appointment can no longer receive dispatch updates.", "invalid_status");
  }
  if (membership.role === "technician" && current.assigned_user_id !== user.id) {
    throw new ApiError(403, "This appointment is not assigned to you.", "forbidden");
  }

  const metadata = metadataObject(current.metadata);
  const now = new Date().toISOString();
  const nextMetadata: Record<string, unknown> = {
    ...metadata,
    dispatch_status: body.status,
    dispatch_status_updated_at: now,
  };
  if (body.location) {
    nextMetadata.last_dispatch_location = body.location;
    nextMetadata.last_dispatch_location_at = now;
  }

  // Arrival is a dispatch/customer-communication event, not a required
  // appointment lifecycle state. The on-site primary action is Start Job,
  // which moves a confirmed appointment directly to in_progress.
  const { data, error } = await db
    .from("appointments")
    .update({ metadata: nextMetadata, updated_at: now })
    .eq("workspace_id", workspace_id)
    .eq("id", appointmentId)
    .select("id,status,assigned_user_id,metadata,updated_at")
    .single();
  if (error) throw error;

  // Only the field technician owns mutable presence. Office/dispatch users
  // may advance dispatch state without becoming the job's live technician.
  if (membership.role === "technician") {
    const presenceStatus = body.status === "en_route" ? "en_route" : body.status === "arrived" ? "on_job" : "available";
    const { error: presenceError } = await db.rpc("set_technician_presence_v1", {
      p_workspace_id: workspace_id,
      p_status: presenceStatus,
      p_appointment_id: appointmentId,
      p_location: body.location ?? null,
    });
    if (presenceError) throw presenceError;
  }

  if (body.status === "en_route" || body.status === "arrived") {
    try {
      const [{ data: appointment }, { data: workspace }] = await Promise.all([
        db.from("appointments")
          .select("id,workspace_id,customer_id,starts_at,ends_at,status,notes,metadata,updated_at,customers(id,first_name,last_name,email),vehicles(id,year,make,model)")
          .eq("workspace_id", body.workspace_id).eq("id", appointmentId).single(),
        db.from("workspaces").select("name,timezone").eq("id", body.workspace_id).single(),
      ]);
      if (appointment) {
        const technicianId = current.assigned_user_id ?? (membership.role === "technician" ? user.id : null);
        const admin = createSupabaseAdminClient();
        const technician = technicianId ? await admin.auth.admin.getUserById(technicianId) : null;
        const technicianName = String(
          technician?.data?.user?.user_metadata?.full_name
          || technician?.data?.user?.user_metadata?.name
          || technician?.data?.user?.email?.split("@")[0]
          || "Your technician"
        );
        const eventKey = body.status === "en_route"
          ? LIFECYCLE_EVENT_KEYS.technicianEnRoute
          : LIFECYCLE_EVENT_KEYS.technicianArrived;
        await dispatchAppointmentLifecycle({
          eventKey,
          eventId: `${appointmentId}:technician-status:${body.status}`,
          appointment,
          workspaceName: workspace?.name ?? "Service Writer",
          workspaceTimezone: workspace?.timezone ?? "UTC",
          actionUrl: new URL("/my-bookings", c.req.url).toString(),
          technicianName,
        });
      }
    } catch (dispatchError) {
      console.error("[Lifecycle] technician-status email enqueue failed", dispatchError);
    }
  }

  return json({ data });
});

// ---------------------------------------------------------------------------
// GET/PUT /v1/appointment-items
// ---------------------------------------------------------------------------

const syncPrimaryServiceSchema = z.object({
  workspace_id: z.string().uuid().optional(),
  selected_workspace_id: z.string().uuid().optional(),
  appointment_id: z.string().uuid(),
  service_catalog_id: z.string().uuid().nullable(),
});

appointmentsRouter.get("/v1/appointment-items", async (c: Context) => {
  const url = new URL(c.req.url);
  const workspaceId = z.string().uuid().parse(url.searchParams.get("workspace_id"));
  const appointmentId = url.searchParams.get("appointment_id");
  const { supabase } = await requireWorkspaceAuth(c, workspaceId);

  let query = supabase
    .from("appointment_items")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (appointmentId) query = query.eq("appointment_id", z.string().uuid().parse(appointmentId));

  const { data, error } = await query;
  if (error) throw error;
  return json({ data: data ?? [] });
});

/**
 * Synchronize the single primary service selected by the preserved appointment
 * form. Only rows tagged source=appointment_form are replaced; imported history
 * and technician-added line items remain untouched.
 */
appointmentsRouter.put("/v1/appointment-items", async (c: Context) => {
  const body = syncPrimaryServiceSchema.parse(await c.req.json());
  // Nuance preserved: the original calls requireWorkspaceMember without
  // forwarding the request; the Hono wrapper always passes c.req.raw through.
  const { supabase, workspace_id } = await requireWorkspaceFromBody(c, body, [
    "owner", "admin", "manager", "service_advisor", "receptionist", "dispatcher",
  ]);

  const { data: appointment, error: appointmentError } = await supabase
    .from("appointments")
    .select("id")
    .eq("workspace_id", workspace_id)
    .eq("id", body.appointment_id)
    .single();
  if (appointmentError || !appointment) {
    throw appointmentError ?? new Error("Appointment was not found in this workspace.");
  }

  let catalog: { id: string; name: string; labor_price: number | string } | null = null;
  if (body.service_catalog_id) {
    const { data, error } = await supabase
      .from("service_catalog")
      .select("id,name,labor_price")
      .eq("workspace_id", workspace_id)
      .eq("id", body.service_catalog_id)
      .eq("is_active", true)
      .single();
    if (error || !data) throw error ?? new Error("Service was not found in this workspace.");
    catalog = data as typeof catalog;
  }

  const { error: deleteError } = await supabase
    .from("appointment_items")
    .delete()
    .eq("workspace_id", workspace_id)
    .eq("appointment_id", body.appointment_id)
    .contains("metadata", { source: "appointment_form" });
  if (deleteError) throw deleteError;

  if (!catalog) return json({ data: null });

  const { data: item, error: insertError } = await supabase
    .from("appointment_items")
    .insert({
      workspace_id,
      appointment_id: body.appointment_id,
      service_catalog_id: catalog.id,
      item_type: "service",
      description: catalog.name,
      quantity: 1,
      unit_price: Number(catalog.labor_price ?? 0),
      sort_order: 0,
      metadata: { source: "appointment_form", role: "primary_service" },
    } as never)
    .select()
    .single();
  if (insertError) throw insertError;

  return json({ data: item });
});

// ---------------------------------------------------------------------------
// GET/POST /v1/dispatch-events
// ---------------------------------------------------------------------------

const dispatchEventSchema = z.object({
  workspace_id: z.string().uuid(),
  appointment_id: z.string().uuid().nullable().optional(),
  work_order_id: z.string().uuid().nullable().optional(),
  technician_id: z.string().uuid().nullable().optional(),
  event_type: z.enum(["assigned", "reassigned", "status_changed", "en_route", "arrived", "started", "paused", "completed", "cancelled", "note"]),
  previous_status: z.string().max(100).nullable().optional(),
  new_status: z.string().max(100).nullable().optional(),
  location: z.record(z.string(), z.unknown()).nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
}).refine((value) => Boolean(value.appointment_id || value.work_order_id), {
  message: "appointment_id or work_order_id is required",
  path: ["appointment_id"],
});

appointmentsRouter.get("/v1/dispatch-events", async (c: Context) => {
  const url = new URL(c.req.url);
  const workspaceId = url.searchParams.get("workspace_id");
  if (!workspaceId) throw new Error("workspace_id is required");
  const { supabase } = await requireWorkspaceAuth(c, workspaceId);
  const { limit, offset } = paginationSchema.parse(Object.fromEntries(url.searchParams));
  const { data, error } = await supabase
    .from("dispatch_events")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return json({ data: data ?? [], pagination: { limit, offset } });
});

appointmentsRouter.post("/v1/dispatch-events", async (c: Context) => {
  const body = dispatchEventSchema.parse(await c.req.json());
  const { supabase, user, membership } = await requireWorkspaceAuth(c, body.workspace_id, ["owner", "admin", "manager", "service_advisor", "dispatcher", "technician", "fleet_manager"]);

  if (membership.role === "technician") {
    if (body.technician_id && body.technician_id !== user.id) {
      throw new ApiError(403, "Technicians can only record their own dispatch events.", "forbidden");
    }
    if (body.appointment_id) {
      const { data: appointment, error } = await supabase
        .from("appointments")
        .select("assigned_user_id")
        .eq("workspace_id", body.workspace_id)
        .eq("id", body.appointment_id)
        .maybeSingle();
      if (error) throw error;
      if (!appointment || appointment.assigned_user_id !== user.id) {
        throw new ApiError(403, "This appointment is not assigned to you.", "forbidden");
      }
    }
    if (body.work_order_id) {
      const { data: assignment, error } = await supabase
        .from("work_order_assignments")
        .select("user_id")
        .eq("workspace_id", body.workspace_id)
        .eq("work_order_id", body.work_order_id)
        .eq("user_id", user.id)
        .is("unassigned_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!assignment) throw new ApiError(403, "This work order is not assigned to you.", "forbidden");
    }
  }

  const eventTechnicianId = membership.role === "technician" ? user.id : (body.technician_id ?? null);
  const { data, error } = await supabase.from("dispatch_events").insert({ ...body, technician_id: eventTechnicianId, performed_by: user.id }).select().single();
  if (error) throw error;
  const eventKey = {
    en_route: LIFECYCLE_EVENT_KEYS.technicianEnRoute,
    arrived: LIFECYCLE_EVENT_KEYS.technicianArrived,
    started: LIFECYCLE_EVENT_KEYS.serviceStarted,
    completed: LIFECYCLE_EVENT_KEYS.serviceCompleted,
    cancelled: LIFECYCLE_EVENT_KEYS.appointmentCancelled,
  }[body.event_type];
  if (eventKey) {
    try {
      const appointmentId = body.appointment_id
        ?? (body.work_order_id
          ? (await supabase.from("work_orders").select("appointment_id").eq("workspace_id", body.workspace_id).eq("id", body.work_order_id).single()).data?.appointment_id
          : null);
      if (appointmentId) {
        const [{ data: appointment }, { data: workspace }] = await Promise.all([
          supabase
            .from("appointments")
            .select("id,workspace_id,customer_id,starts_at,ends_at,status,notes,metadata,updated_at,customers(id,first_name,last_name,email),vehicles(id,year,make,model)")
            .eq("workspace_id", body.workspace_id)
            .eq("id", appointmentId)
            .single(),
          supabase.from("workspaces").select("name,timezone").eq("id", body.workspace_id).single(),
        ]);
        if (appointment) {
          const admin = createSupabaseAdminClient();
          const technician = eventTechnicianId ? await admin.auth.admin.getUserById(eventTechnicianId) : null;
          const technicianName = String(
            technician?.data?.user?.user_metadata?.full_name
            || technician?.data?.user?.user_metadata?.name
            || technician?.data?.user?.email?.split("@")[0]
            || "Your technician",
          );
          await dispatchAppointmentLifecycle({
            eventKey,
            eventId: ["en_route", "arrived", "started"].includes(body.event_type)
              ? `${appointmentId}:technician-status:${body.event_type}`
              : data.id,
            appointment,
            workspaceName: workspace?.name ?? "Service Writer",
            workspaceTimezone: workspace?.timezone ?? "UTC",
            actionUrl: new URL("/my-bookings", c.req.url).toString(),
            technicianName,
          });
        }
      }
    } catch (dispatchError) {
      console.error("[Lifecycle] live-service email enqueue failed", dispatchError);
    }
  }
  return json({ data }, { status: 201 });
});

// ---------------------------------------------------------------------------
// POST /v1/dispatch/assign
// ---------------------------------------------------------------------------

const assignmentSchema = z.object({
  workspace_id: z.string().uuid(),
  job_source: z.enum(["appointment", "work_order"]),
  job_id: z.string().uuid(),
  technician_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

appointmentsRouter.post("/v1/dispatch/assign", async (c: Context) => {
  const body = assignmentSchema.parse(await c.req.json());
  const { supabase } = await requireWorkspaceAuth(c, body.workspace_id, ["owner", "admin", "manager", "service_advisor", "dispatcher"]);
  let previousTechnicianId: string | null | undefined;
  if (body.job_source === "appointment") {
    const previousAssignment = await supabase.from("appointments").select("assigned_user_id").eq("workspace_id", body.workspace_id).eq("id", body.job_id).single();
    previousTechnicianId = previousAssignment.data?.assigned_user_id;
  } else {
    const previousAssignment = await supabase.from("work_order_assignments").select("user_id").eq("workspace_id", body.workspace_id).eq("work_order_id", body.job_id).is("unassigned_at", null).order("assigned_at", { ascending: false }).limit(1).maybeSingle();
    previousTechnicianId = previousAssignment.data?.user_id;
  }
  const { data, error } = await supabase.rpc("assign_dispatch_job_v1", {
    p_workspace_id: body.workspace_id,
    p_job_source: body.job_source,
    p_job_id: body.job_id,
    p_technician_id: body.technician_id ?? null,
    p_notes: body.notes ?? null,
  });
  if (error) throw error;
  try {
    const appointmentId = body.job_source === "appointment"
      ? body.job_id
      : (await supabase.from("work_orders").select("appointment_id").eq("workspace_id", body.workspace_id).eq("id", body.job_id).single()).data?.appointment_id;
    if (appointmentId) {
      const [{ data: appointment }, { data: workspace }] = await Promise.all([
        supabase
          .from("appointments")
          .select("id,workspace_id,customer_id,starts_at,ends_at,status,notes,metadata,updated_at,customers(id,first_name,last_name,email),vehicles(id,year,make,model)")
          .eq("workspace_id", body.workspace_id)
          .eq("id", appointmentId)
          .single(),
        supabase.from("workspaces").select("name,timezone").eq("id", body.workspace_id).single(),
      ]);
      if (appointment) {
        const admin = createSupabaseAdminClient();
        const newTechnician = body.technician_id ? await admin.auth.admin.getUserById(body.technician_id) : null;
        const technicianName = String(
          newTechnician?.data?.user?.user_metadata?.full_name
          || newTechnician?.data?.user?.user_metadata?.name
          || newTechnician?.data?.user?.email?.split("@")[0]
          || "Unassigned",
        );
        const customerUrl = new URL("/my-bookings", c.req.url).toString();
        const technicianUrl = technicianJobUrl(appointmentId, c.req.url);
        if (body.technician_id) {
          await dispatchAppointmentLifecycle({
            eventKey: LIFECYCLE_EVENT_KEYS.technicianAssigned,
            eventId: `${appointmentId}:customer-assignment:${body.technician_id}`,
            appointment,
            workspaceName: workspace?.name ?? "Service Writer",
            workspaceTimezone: workspace?.timezone ?? "UTC",
            actionUrl: customerUrl,
            technicianName,
          });
          const newTechnicianEmail = newTechnician?.data?.user?.email;
          if (newTechnicianEmail) {
            await dispatchAppointmentLifecycle({
              eventKey: LIFECYCLE_EVENT_KEYS.jobAssigned,
              eventId: `${appointmentId}:technician-assignment:${body.technician_id}`,
              appointment,
              workspaceName: workspace?.name ?? "Service Writer",
              workspaceTimezone: workspace?.timezone ?? "UTC",
              actionUrl: technicianUrl,
              recipientEmail: newTechnicianEmail,
              recipientRole: "technician",
              technicianName,
            });
          }
        }
        if (previousTechnicianId && previousTechnicianId !== body.technician_id) {
          const previousTechnician = await admin.auth.admin.getUserById(previousTechnicianId);
          if (previousTechnician.data.user?.email) {
            await dispatchAppointmentLifecycle({
              eventKey: LIFECYCLE_EVENT_KEYS.assignmentChanged,
              eventId: `${appointmentId}:previous-technician:${previousTechnicianId}:${body.technician_id ?? "unassigned"}`,
              appointment,
              workspaceName: workspace?.name ?? "Service Writer",
              workspaceTimezone: workspace?.timezone ?? "UTC",
              actionUrl: technicianUrl,
              recipientEmail: previousTechnician.data.user.email,
              recipientRole: "technician",
              technicianName,
            });
          }
        }
      }
    }
  } catch (dispatchError) {
    console.error("[Lifecycle] dispatch-assignment email enqueue failed", dispatchError);
  }
  return json({ data: data ?? null });
});

// ---------------------------------------------------------------------------
// GET/POST /v1/workforce-identity
// ---------------------------------------------------------------------------

const selectionSchema = z.object({
  workspaceUserId: z.string().uuid(),
  role: z.enum([
    "admin",
    "owner",
    "manager",
    "dispatcher",
    "fleet_manager",
    "technician",
    "service_advisor",
    "receptionist",
    "viewer",
  ]),
});

appointmentsRouter.get("/v1/workforce-identity", async (c: Context) => {
  const { supabase } = await requireAuth(c);
  const { data, error } = await supabase.rpc("get_workforce_identity_v1");
  if (error) throw error;
  return json({ data: data ?? [] });
});

appointmentsRouter.post("/v1/workforce-identity", async (c: Context) => {
  const parsed = selectionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw new ApiError(400, "Invalid workspace selection", "invalid_workspace_selection");
  }

  const { supabase } = await requireAuth(c);
  const { data, error } = await supabase.rpc("select_active_workspace_v1", {
    p_owner_user_id: parsed.data.workspaceUserId,
    p_role: parsed.data.role,
  });
  if (error) throw error;
  if (!data?.[0]) {
    throw new ApiError(404, "The selected workspace is no longer available.", "workspace_not_found");
  }

  return json({ data: data[0] });
});

// ---------------------------------------------------------------------------
// Phase 2 — availability mutations, geocode backfill, booking configuration
// ---------------------------------------------------------------------------

function integerOr(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

// POST /v1/appointments/availability-settings — staff-only scheduling settings write.
appointmentsRouter.post("/v1/appointments/availability-settings", async (c: Context) => {
  const { payload } = z.object({ payload: z.record(z.string(), z.unknown()) }).parse(await c.req.json());
  const { supabase, workspaceId } = await requireStaffWorkspace(c);
  const { error } = await (supabase as any).rpc("update_workspace_scheduling_settings_v1", {
    p_workspace_id: workspaceId,
    p_day_hours: payload.day_hours ?? {},
    p_buffer_time_before: integerOr(payload.buffer_time_before, 0),
    p_buffer_time_after: integerOr(payload.buffer_time_after, 0),
    p_min_lead_time_hours: integerOr(payload.min_lead_time_hours, 2),
    p_max_advance_days: integerOr(payload.max_advance_days, 30),
    p_allow_multi_day_bookings: payload.allow_multi_day_bookings === true,
    p_slot_duration_minutes: integerOr(payload.slot_duration_minutes, 30),
    p_require_approval: payload.require_approval === true,
    p_cancellation_window_hours: integerOr(payload.cancellation_window_hours, 24),
    p_allow_cancellation: payload.allow_cancellation !== false,
    p_allow_rescheduling: payload.allow_rescheduling !== false,
    p_reschedule_window_hours: integerOr(payload.reschedule_window_hours, 24),
    p_terms_and_conditions: typeof payload.terms_and_conditions === "string" ? payload.terms_and_conditions : "",
    p_require_terms_acceptance: payload.require_terms_acceptance === true,
  });
  if (error) throw error;
  return json({ success: true });
});

// POST /v1/appointments/blackout-dates — upsert a blackout date.
appointmentsRouter.post("/v1/appointments/blackout-dates", async (c: Context) => {
  const { date, reason } = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().max(500).nullable().optional(),
  }).parse(await c.req.json());
  const { supabase, user, workspaceId } = await requireStaffWorkspace(c);
  const { data, error } = await (supabase as any)
    .from("workspace_blackout_dates")
    .upsert({
      workspace_id: workspaceId,
      blocked_date: date,
      reason: reason ?? null,
      created_by: user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "workspace_id,blocked_date" })
    .select()
    .single();
  if (error) throw error;
  return json({ data });
});

// DELETE /v1/appointments/blackout-dates/:id
appointmentsRouter.delete("/v1/appointments/blackout-dates/:id", async (c: Context) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const { supabase, workspaceId } = await requireStaffWorkspace(c);
  const { error } = await (supabase as any)
    .from("workspace_blackout_dates")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", id);
  if (error) throw error;
  return json({ success: true });
});

const intakeQuestionSchema = z.object({
  id: z.string().uuid().optional(),
  question_text: z.string().trim().min(1).max(1000),
  question_type: z.string().trim().max(40),
  options: z.array(z.string()).nullable().optional(),
  is_required: z.boolean(),
  sort_order: z.number().int().optional(),
});

// POST /v1/appointments/intake-questions — insert or update an intake question.
appointmentsRouter.post("/v1/appointments/intake-questions", async (c: Context) => {
  const { question } = z.object({ question: intakeQuestionSchema }).parse(await c.req.json());
  const { supabase, user, workspaceId } = await requireStaffWorkspace(c);
  const db = supabase as any;
  const values = {
    workspace_id: workspaceId,
    question_text: question.question_text,
    question_type: question.question_type,
    options: question.options ?? null,
    is_required: question.is_required,
    sort_order: question.sort_order ?? 0,
    updated_at: new Date().toISOString(),
  };
  const result = question.id
    ? await db.from("workspace_intake_questions").update(values).eq("workspace_id", workspaceId).eq("id", question.id).select().single()
    : await db.from("workspace_intake_questions").insert({ ...values, created_by: user.id }).select().single();
  if (result.error) throw result.error;
  return json({ data: result.data });
});

// DELETE /v1/appointments/intake-questions/:id
appointmentsRouter.delete("/v1/appointments/intake-questions/:id", async (c: Context) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const { supabase, workspaceId } = await requireStaffWorkspace(c);
  const { error } = await (supabase as any)
    .from("workspace_intake_questions")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", id);
  if (error) throw error;
  return json({ success: true });
});

// PATCH /v1/appointments/intake-questions/:id — toggle is_active.
appointmentsRouter.patch("/v1/appointments/intake-questions/:id", async (c: Context) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const { is_active } = z.object({ is_active: z.boolean() }).parse(await c.req.json());
  const { supabase, workspaceId } = await requireStaffWorkspace(c);
  const { data, error } = await (supabase as any)
    .from("workspace_intake_questions")
    .update({ is_active, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return json({ data });
});

function serverMapboxToken(): string {
  const raw = (process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN || "").trim();
  if (!raw.startsWith("pk.") || raw.length <= 20) {
    throw new ApiError(503, "Mapbox is not configured", "mapbox_unconfigured");
  }
  return raw;
}

async function geocodeAddressServer(address: string): Promise<{ lat: number; lng: number } | null> {
  const params = new URLSearchParams({ access_token: serverMapboxToken(), limit: "1" });
  const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?${params.toString()}`);
  if (!res.ok) throw new Error(`Mapbox geocoding failed: ${res.statusText}`);
  const data = (await res.json()) as { features?: Array<{ center?: [number, number] }> };
  const center = data?.features?.[0]?.center;
  if (!center) return null;
  return { lng: center[0], lat: center[1] };
}

// POST /v1/appointments/geocode-backfill — geocode appointments missing coordinates.
appointmentsRouter.post("/v1/appointments/geocode-backfill", async (c: Context) => {
  const { batch_size } = z.object({ batch_size: z.number().int().min(1).max(100).optional() }).parse(await c.req.json().catch(() => ({})));
  const batchSize = batch_size ?? 25;
  const { supabase, user } = await requireAuth(c);
  const { data: memberships, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("is_active", true);
  if (membershipError) throw membershipError;
  const workspaceIds = ((memberships ?? []) as Array<{ workspace_id: string }>).map((m) => m.workspace_id);
  if (!workspaceIds.length) throw new ApiError(400, "No active workspace", "no_workspace");
  const db = supabase as any;
  const { data, error, count } = await db
    .from("appointments")
    .select("id, location_address", { count: "exact" })
    .in("workspace_id", workspaceIds)
    .is("location_lat", null)
    .not("location_address", "is", null)
    .is("deleted_at", null)
    .limit(batchSize);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ id: string; location_address: string }>;
  let geocoded = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const result = await geocodeAddressServer(String(row.location_address));
      if (!result) { failed += 1; continue; }
      const { error: updateError } = await db
        .from("appointments")
        .update({ location_lat: result.lat, location_lng: result.lng })
        .eq("id", row.id);
      if (updateError) throw updateError;
      geocoded += 1;
    } catch {
      failed += 1;
    }
  }
  return json({
    scanned: rows.length,
    geocoded,
    failed,
    remaining: Math.max(0, (count ?? rows.length) - geocoded),
  });
});

function textOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

// GET /v1/appointments/:id/booking-configuration — immutable booking snapshot with
// fallback to the canonical appointment → vehicle → service-spec relationship.
appointmentsRouter.get("/v1/appointments/:id/booking-configuration", async (c: Context) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const { supabase, user } = await requireAuth(c);
  const { data: memberships, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("is_active", true);
  if (membershipError) throw membershipError;
  const workspaceIds = ((memberships ?? []) as Array<{ workspace_id: string }>).map((m) => m.workspace_id);
  if (!workspaceIds.length) throw new ApiError(400, "No active workspace", "no_workspace");
  const db = supabase as any;
  const { data: configRow, error: configError } = await db
    .from("appointment_booking_configurations")
    .select("configuration")
    .eq("appointment_id", id)
    .maybeSingle();
  if (configError) throw configError;
  const configuration = (configRow as { configuration?: { vehicles?: unknown[] } } | null)?.configuration;
  if (configuration?.vehicles?.length) return json({ configuration });

  const { data: appointment, error: appointmentError } = await supabase
    .from("appointments")
    .select("id,workspace_id,vehicle_id,updated_at,created_at,starts_at")
    .eq("id", id)
    .in("workspace_id", workspaceIds)
    .maybeSingle();
  if (appointmentError) throw appointmentError;
  const appointmentRow = appointment as {
    id: string; workspace_id: string; vehicle_id: string | null;
    updated_at: string; created_at: string; starts_at: string;
  } | null;
  if (!appointmentRow?.vehicle_id) return json({ configuration: null });

  const { data: vehicle, error: vehicleError } = await supabase
    .from("vehicles")
    .select("id,year,make,model,vin,license_plate")
    .eq("workspace_id", appointmentRow.workspace_id)
    .eq("id", appointmentRow.vehicle_id)
    .maybeSingle();
  if (vehicleError) throw vehicleError;
  const vehicleRow = vehicle as {
    id: string; year: unknown; make: unknown; model: unknown; vin: unknown; license_plate: unknown;
  } | null;
  if (!vehicleRow?.id) return json({ configuration: null });

  const { data: specs, error: specsError } = await db
    .from("vehicle_service_specs")
    .select("engine,oil_type,oil_capacity,oil_filter")
    .eq("workspace_id", appointmentRow.workspace_id)
    .eq("vehicle_id", String(vehicleRow.id))
    .maybeSingle();
  if (specsError) throw specsError;
  const specRow = specs as Record<string, unknown> | null;
  const oil = specRow && [specRow.engine, specRow.oil_type, specRow.oil_capacity, specRow.oil_filter].some(Boolean)
    ? {
        engine: textOrUndefined(specRow.engine),
        oilType: textOrUndefined(specRow.oil_type),
        oilCapacity: textOrUndefined(specRow.oil_capacity),
        oilFilter: textOrUndefined(specRow.oil_filter),
        capacitySource: "manual" as const,
      }
    : undefined;
  return json({
    configuration: {
      schemaVersion: 2,
      capturedAt: textOrUndefined(appointmentRow.updated_at) || textOrUndefined(appointmentRow.created_at) || textOrUndefined(appointmentRow.starts_at) || new Date(0).toISOString(),
      vehicles: [{
        clientVehicleId: String(vehicleRow.id),
        vehicle: {
          year: String(vehicleRow.year || ""),
          make: String(vehicleRow.make || "Unknown"),
          model: String(vehicleRow.model || "Unknown"),
          vin: textOrUndefined(vehicleRow.vin),
          licensePlate: textOrUndefined(vehicleRow.license_plate),
        },
        ...(oil ? { oil } : {}),
      }],
    },
  });
});

// ---------------------------------------------------------------------------
// Phase 2 — client migration endpoints: optional-auth helpers, booking RPC
// proxy, booking signup/consent, generic whitelisted edge-function proxy,
// and provider-sync forwarding. These serve anonymous-capable public booking
// flows, so auth is optional: a bearer token yields the caller's identity,
// otherwise the request runs as the anonymous role (same as the browser).
// ---------------------------------------------------------------------------

/** User identity when a bearer token is present, else the anonymous client. */
async function optionalAuthClient(c: Context) {
  const authorization = c.req.header("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (token) {
    const supabase = createSupabaseRequestClient(token) as any;
    try {
      const { data, error } = await supabase.auth.getUser();
      if (!error && data?.user) return { supabase, user: data.user };
    } catch { /* fall through to anonymous */ }
  }
  return { supabase: createSupabaseBrowserClient() as any, user: null };
}

function serializeDataError(error: any) {
  if (!error) return null;
  return {
    message: typeof error.message === "string" ? error.message : "Request failed",
    code: typeof error.code === "string" ? error.code : null,
    details: (error as { details?: unknown }).details ?? null,
    hint: (error as { hint?: unknown }).hint ?? null,
  };
}

/** Whitelisted RPCs callable through the booking proxy (public booking + rewards + availability). */
const BOOKING_RPC_ALLOWLIST = new Set([
  "public_booking_upsert_customer",
  "public_booking_upsert_vehicle",
  "public_booking_book_appointment_v2",
  "assign_van_by_zip",
  "public_booking_update_appointment_context_v2",
  "public_booking_save_configuration_v2",
  "reserve_tire_inventory_for_appointment",
  "public_booking_insert_services_v7",
  "public_booking_record_payment_intent_v3",
  "link_customer_portal_account_v1",
  "lookup_booking_rewards",
  "reserve_booking_reward",
  "apply_booking_reward",
  "redeem_booking_reward",
  "cancel_booking_reward",
  "public_booking_set_vehicle_tire_spec_v3",
  "check_customer_email",
  "get_booked_slots",
  "get_customer_portal_appointments_v1",
]);

// POST /v1/appointments/booking-rpc — whitelisted public-booking RPCs, optional auth.
appointmentsRouter.post("/v1/appointments/booking-rpc", async (c: Context) => {
  const { fn, params } = z.object({
    fn: z.string().min(1).max(80),
    params: z.record(z.string(), z.unknown()).nullable().optional(),
  }).parse(await c.req.json());
  if (!BOOKING_RPC_ALLOWLIST.has(fn)) throw new ApiError(400, `RPC '${fn}' is not allowed.`, "rpc_not_allowed");
  const { supabase } = await optionalAuthClient(c);
  const { data, error } = await supabase.rpc(fn, params ?? {});
  if (error) return json({ data: null, error: serializeDataError(error) });
  return json({ data, error: null });
});

// POST /v1/appointments/booking-signup — customer portal account creation for guests.
appointmentsRouter.post("/v1/appointments/booking-signup", async (c: Context) => {
  const { email, password, full_name, phone } = z.object({
    email: z.string().email().max(320),
    password: z.string().min(1).max(256),
    full_name: z.string().min(1).max(200),
    phone: z.string().max(40).optional(),
  }).parse(await c.req.json());
  const supabase = createSupabaseBrowserClient() as any;
  const origin = new URL(c.req.url).origin;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name, phone }, emailRedirectTo: `${origin}/customer/dashboard` },
  });
  if (error) return json({ data: null, error: serializeDataError(error) });
  return json({ data: { user: data?.user ?? null, session: data?.session ?? null }, error: null });
});

// POST /v1/appointments/booking-consent — proxy to record-booking-consent (anonymous).
appointmentsRouter.post("/v1/appointments/booking-consent", async (c: Context) => {
  const { signature, ...body } = z.object({
    consent_record_id: z.string().min(1),
    shop_user_id: z.string().min(1),
    consent_type: z.string().min(1),
    consent_version: z.string().min(1),
    consent_text_hash: z.string().min(1),
    ip_address: z.string().nullable().optional(),
    user_agent: z.string().nullable().optional(),
    signature: z.string().min(1),
  }).passthrough().parse(await c.req.json());
  const { supabase } = await optionalAuthClient(c);
  const { data, error } = await supabase.functions.invoke("record-booking-consent", {
    body,
    headers: { "x-hmac-signature": signature },
  });
  if (error) return json({ data: null, error: serializeDataError(error) });
  return json({ data: data ?? null, error: null });
});

/** Edge functions the appointments domain may invoke through the generic proxy. */
const DOMAIN_EDGE_ALLOWLIST = new Set([
  "route-safe-availability",
  "verify-location",
  "vehicle-photos",
  "dispatch-engine",
  "customer-vehicle-context",
  "customer-service-context",
]);

// POST /v1/appointments/edge/:function — whitelisted edge-function proxy, optional auth.
appointmentsRouter.post("/v1/appointments/edge/:function", async (c: Context) => {
  const functionName = c.req.param("function");
  if (!DOMAIN_EDGE_ALLOWLIST.has(functionName)) throw new ApiError(400, `Edge function '${functionName}' is not allowed.`, "edge_not_allowed");
  const { body, headers } = z.object({
    body: z.unknown().optional(),
    headers: z.record(z.string(), z.string()).optional(),
  }).parse(await c.req.json().catch(() => ({})));
  const { supabase } = await optionalAuthClient(c);
  const { data, error } = await supabase.functions.invoke(functionName, { body: body ?? {}, headers });
  if (error) return json({ data: null, error: serializeDataError(error) });
  return json({ data: data ?? null, error: null });
});

function supabaseFunctionsBase(): { base: string; anonKey: string } {
  const base = (process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "").replace(/\/$/, "");
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || "");
  if (!base || !anonKey) throw new ApiError(503, "Supabase is not configured", "supabase_unconfigured");
  return { base, anonKey };
}

/** Forward a GET-style edge-function call (query params) with the caller's auth header. */
async function forwardEdgeGet(c: Context, functionName: string, query: Record<string, string>) {
  const { base, anonKey } = supabaseFunctionsBase();
  const url = new URL(`${base}/functions/v1/${functionName}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const headers: Record<string, string> = { apikey: anonKey };
  const authorization = c.req.header("authorization");
  if (authorization) headers["authorization"] = authorization;
  const res = await fetch(url.toString(), { headers });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return { data: null, error: { message: `Edge function ${functionName} failed`, code: String(res.status), details: data, hint: null } };
  }
  return { data, error: null };
}

// GET /v1/appointments/:id/provider-sync — sync-state for an appointment (edge GET forward).
appointmentsRouter.get("/v1/appointments/:id/provider-sync", async (c: Context) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  await requireAuth(c);
  return json(await forwardEdgeGet(c, "provider-sync-manager", { action: "for_appointment", appointment_id: id }));
});

// GET /v1/appointments/provider-sync-logs — sync logs for a provider record (edge GET forward).
appointmentsRouter.get("/v1/appointments/provider-sync-logs", async (c: Context) => {
  const recordId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("record_id") ?? "");
  await requireAuth(c);
  return json(await forwardEdgeGet(c, "provider-sync-manager", { action: "logs", record_id: recordId }));
});

// POST /v1/appointments/voice-transcribe — forward multipart audio to transcribe-audio.
appointmentsRouter.post("/v1/appointments/voice-transcribe", async (c: Context) => {
  await requireAuth(c);
  const formData = await c.req.formData();
  const audio = formData.get("audio");
  if (!(audio instanceof Blob)) throw new ApiError(400, "Missing audio payload", "missing_audio");
  const forward = new FormData();
  forward.append("audio", audio, (audio as File).name || "audio.webm");
  for (const [key, value] of formData.entries()) {
    if (key !== "audio" && typeof value === "string") forward.append(key, value);
  }
  const { base, anonKey } = supabaseFunctionsBase();
  const headers: Record<string, string> = { apikey: anonKey };
  const authorization = c.req.header("authorization");
  if (authorization) headers["authorization"] = authorization;
  const res = await fetch(`${base}/functions/v1/transcribe-audio`, { method: "POST", headers, body: forward });
  const data = await res.json().catch(() => null);
  if (!res.ok) return json({ data: null, error: serializeDataError({ message: "Transcription failed", code: String(res.status), details: data }) });
  return json({ data, error: null });
});

// ---------------------------------------------------------------------------
// Booking contexts + booking progress tracker (anonymous-capable).
// ---------------------------------------------------------------------------

const bookingContextInsertSchema = z.object({
  business_user_id: z.string().uuid(),
  location_context: z.record(z.string(), z.unknown()).nullable().optional(),
  session_id: z.string().max(200).nullable().optional(),
});

// POST /v1/appointments/booking-contexts — create a booking context.
appointmentsRouter.post("/v1/appointments/booking-contexts", async (c: Context) => {
  const { business_user_id, location_context, session_id } = bookingContextInsertSchema.parse(await c.req.json());
  const { supabase } = await optionalAuthClient(c);
  const db = supabase as any;
  const { data, error } = await db
    .from("booking_contexts")
    .insert({
      business_user_id,
      location_context: location_context ?? null,
      session_id: session_id ?? null,
      status: "active",
    })
    .select("id")
    .single();
  if (error) return json({ data: null, error: serializeDataError(error) });
  return json({ data: { id: (data as { id: string }).id }, error: null });
});

const bookingContextPatchSchema = z.object({
  vehicle_context: z.record(z.string(), z.unknown()).nullable().optional(),
  service_context: z.record(z.string(), z.unknown()).nullable().optional(),
  selected_date: z.string().nullable().optional(),
  selected_time: z.string().nullable().optional(),
  status: z.string().max(60).nullable().optional(),
  job_context: z.record(z.string(), z.unknown()).nullable().optional(),
});

// PATCH /v1/appointments/booking-contexts/:id — update vehicle/service context,
// reserve a slot, or complete the context (merges job_context server-side).
appointmentsRouter.patch("/v1/appointments/booking-contexts/:id", async (c: Context) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const patch = bookingContextPatchSchema.parse(await c.req.json());
  const { supabase } = await optionalAuthClient(c);
  const db = supabase as any;

  const updatePayload: Record<string, unknown> = {};
  if (patch.service_context !== undefined) updatePayload.service_context = patch.service_context;
  if (patch.selected_date !== undefined) updatePayload.selected_date = patch.selected_date;
  if (patch.selected_time !== undefined) updatePayload.selected_time = patch.selected_time;
  if (patch.status !== undefined) updatePayload.status = patch.status;

  if (patch.vehicle_context !== undefined || patch.job_context != null) {
    let vehicleContext = patch.vehicle_context ?? null;
    if (patch.job_context != null) {
      const { data: current, error: readError } = await db
        .from("booking_contexts")
        .select("vehicle_context")
        .eq("id", id)
        .maybeSingle();
      if (readError) return json({ data: null, error: serializeDataError(readError) });
      const existing = (current?.vehicle_context ?? {}) as Record<string, unknown>;
      vehicleContext = { ...existing, ...patch.job_context };
    }
    if (vehicleContext !== undefined) updatePayload.vehicle_context = vehicleContext;
  }

  if (Object.keys(updatePayload).length === 0) {
    return json({ data: { id }, error: null });
  }
  updatePayload.updated_at = new Date().toISOString();
  const { data, error } = await db.from("booking_contexts").update(updatePayload).eq("id", id).select("id").single();
  if (error) return json({ data: null, error: serializeDataError(error) });
  return json({ data: { id: (data as { id: string }).id }, error: null });
});

const bookingProgressSchema = z.object({
  business_user_id: z.string().uuid(),
  guest_email: z.string().nullable().optional(),
  guest_name: z.string().nullable().optional(),
  guest_phone: z.string().nullable().optional(),
  last_step: z.number().int(),
  session_id: z.string().nullable().optional(),
  service_catalog_id: z.string().uuid().nullable().optional(),
  scheduled_date: z.string().nullable().optional(),
  scheduled_time: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

// POST /v1/appointments/booking-progress — upsert the visitor's active
// abandoned-booking row (email- or session-keyed), then fire the notify RPC.
appointmentsRouter.post("/v1/appointments/booking-progress", async (c: Context) => {
  const body = bookingProgressSchema.parse(await c.req.json());
  const email = body.guest_email?.trim().toLowerCase() || null;
  const sessionId = body.session_id ?? null;
  // Must have at least one identity dimension.
  if (!email && !sessionId) return json({ data: { ok: true }, error: null });
  const { supabase } = await optionalAuthClient(c);
  const db = supabase as any;

  let lookup = db
    .from("abandoned_bookings")
    .select("id")
    .eq("user_id", body.business_user_id)
    .eq("recovered", false);
  lookup = email ? lookup.ilike("guest_email", email) : lookup.eq("session_id", sessionId as string);
  const { data: found, error: findError } = await lookup.maybeSingle();
  if (findError && (findError as { code?: string }).code !== "PGRST116") {
    return json({ data: null, error: serializeDataError(findError) });
  }
  const existingId = (found as { id?: string } | null)?.id ?? null;

  const payload = {
    user_id: body.business_user_id,
    guest_email: email,
    guest_name: body.guest_name ?? null,
    guest_phone: body.guest_phone ?? null,
    last_step: body.last_step,
    session_id: sessionId,
    service_catalog_id: body.service_catalog_id ?? null,
    scheduled_date: body.scheduled_date ?? null,
    scheduled_time: body.scheduled_time ?? null,
    metadata: body.metadata ?? {},
    status: "pending",
    last_attempted_at: new Date().toISOString(),
  };

  const { data, error } = existingId
    ? await db.from("abandoned_bookings").update(payload).eq("id", existingId).select("id").single()
    : await db.from("abandoned_bookings").insert(payload).select("id").single();
  if (error) return json({ data: null, error: serializeDataError(error) });

  const rowId = (data as { id?: string } | null)?.id;
  if (rowId) {
    const { error: notifyError } = await db.rpc("notify_abandoned_booking", { row_id: rowId });
    if (notifyError) return json({ data: null, error: serializeDataError(notifyError) });
  }
  return json({ data: { ok: true }, error: null });
});

// POST /v1/appointments/booking-recovered — mark the visitor's abandoned rows recovered.
appointmentsRouter.post("/v1/appointments/booking-recovered", async (c: Context) => {
  const { business_user_id, guest_email, session_id } = z.object({
    business_user_id: z.string().uuid(),
    guest_email: z.string().nullable().optional(),
    session_id: z.string().nullable().optional(),
  }).parse(await c.req.json());
  const email = guest_email?.trim().toLowerCase() || null;
  if (!email && !session_id) return json({ data: { ok: true }, error: null });
  const { supabase } = await optionalAuthClient(c);
  const db = supabase as any;

  let query = db
    .from("abandoned_bookings")
    .update({ recovered: true, status: "recovered", recovered_at: new Date().toISOString() })
    .eq("user_id", business_user_id)
    .in("status", ["pending", "processing", "emailed"])
    .eq("recovered", false);
  query = email ? query.ilike("guest_email", email) : query.eq("session_id", session_id as string);
  const { error } = await query;
  if (error) return json({ data: null, error: serializeDataError(error) });
  return json({ data: { ok: true }, error: null });
});

// ---------------------------------------------------------------------------
// Booking ↔ inventory bridge (resilient: never throws, returns skip reasons).
// ---------------------------------------------------------------------------

function skippedOilResult(reason: string) {
  return { reservationId: null, itemId: null, itemName: null, source: null, quantity: 0, unit: null, shortage: 0, skipped: true, reason };
}

async function findOilItemServer(db: any, businessUserId: string, oilType: string) {
  const normalized = oilType.trim().toUpperCase().replace(/\s+/g, "");
  if (!normalized) return null;
  const { data: items, error } = await db
    .from("inventory_items")
    .select("id, name, sku, unit, category")
    .eq("user_id", businessUserId)
    .or("category.ilike.%oil%,name.ilike.%W-%,name.ilike.%w-%");
  if (error) throw error;
  if (!items?.length) return null;
  const norm = (s: string | null) => (s || "").toUpperCase().replace(/\s+/g, "");
  const rows = items as Array<{ id: string; name: string; sku: string | null; unit: string | null }>;
  const exact = rows.find((i) => norm(i.name) === normalized);
  if (exact) return { id: exact.id, name: exact.name, unit: exact.unit || "qt" };
  const partial = rows.find((i) => norm(i.name).includes(normalized));
  if (partial) return { id: partial.id, name: partial.name, unit: partial.unit || "qt" };
  const bySku = rows.find((i) => norm(i.sku).includes(normalized));
  if (bySku) return { id: bySku.id, name: bySku.name, unit: bySku.unit || "qt" };
  return null;
}

// POST /v1/appointments/booking-inventory/reserve-oil — reserve oil for a booking.
appointmentsRouter.post("/v1/appointments/booking-inventory/reserve-oil", async (c: Context) => {
  const { appointment_id, business_user_id, vehicle_id, van_id, oil_type_override, oil_capacity_override_qt } = z.object({
    appointment_id: z.string().uuid(),
    business_user_id: z.string().uuid(),
    vehicle_id: z.string().uuid().nullable().optional(),
    van_id: z.string().uuid().nullable().optional(),
    oil_type_override: z.string().nullable().optional(),
    oil_capacity_override_qt: z.number().nullable().optional(),
  }).parse(await c.req.json());
  const { supabase } = await optionalAuthClient(c);
  const db = supabase as any;
  try {
    let oilType = oil_type_override?.trim() || null;
    let capacityQt = oil_capacity_override_qt ?? null;
    if ((!oilType || !capacityQt) && vehicle_id) {
      const { data: vehicle } = await db.from("vehicles").select("oil_type, oil_capacity").eq("id", vehicle_id).maybeSingle();
      if (vehicle) {
        if (!oilType) oilType = (vehicle.oil_type as string | null)?.trim() || null;
        if (!capacityQt && vehicle.oil_capacity) {
          const { data: parsed } = await db.rpc("parse_oil_capacity_qt", { p_text: vehicle.oil_capacity });
          capacityQt = Number(parsed) || null;
        }
      }
    }
    if (!oilType) return json({ data: skippedOilResult("no_oil_type") });
    if (!capacityQt || capacityQt <= 0) return json({ data: skippedOilResult("no_oil_capacity") });
    const item = await findOilItemServer(db, business_user_id, oilType);
    if (!item) return json({ data: skippedOilResult(`no_matching_item:${oilType}`) });
    const { data, error } = await db.rpc("reserve_oil_for_appointment", {
      p_appointment_id: appointment_id,
      p_inventory_item_id: item.id,
      p_quantity_qt: capacityQt,
      p_van_id: van_id ?? null,
    });
    if (error) {
      console.warn("[reserveOilForBooking] RPC error", error);
      return json({ data: skippedOilResult(`rpc_error:${(error as { message?: string }).message}`) });
    }
    const row = (Array.isArray(data) ? data[0] : data) as { reservation_id: string | null; source: string; reserved_quantity: number | null; shortage: number | null } | null;
    if (!row) return json({ data: skippedOilResult("no_reservation_returned") });
    return json({
      data: {
        reservationId: row.reservation_id,
        itemId: item.id,
        itemName: item.name,
        source: row.source,
        quantity: Number(row.reserved_quantity ?? 0),
        unit: item.unit,
        shortage: Number(row.shortage ?? 0),
        skipped: false,
      },
    });
  } catch (err) {
    console.warn("[reserveOilForBooking] failed", err);
    return json({ data: skippedOilResult("exception") });
  }
});

// POST /v1/appointments/booking-inventory/reserve-parts — reserve oil/filter/additive parts.
appointmentsRouter.post("/v1/appointments/booking-inventory/reserve-parts", async (c: Context) => {
  const { appointment_id, vehicle_id, van_id, service_catalog_ids } = z.object({
    appointment_id: z.string().uuid(),
    business_user_id: z.string().uuid(),
    vehicle_id: z.string().uuid().nullable().optional(),
    van_id: z.string().uuid().nullable().optional(),
    service_catalog_ids: z.array(z.string().uuid()),
  }).parse(await c.req.json());
  const { supabase } = await optionalAuthClient(c);
  const db = supabase as any;
  const out: { reservations: unknown[]; skipped: Array<{ itemId?: string; itemName?: string; reason: string }> } = { reservations: [], skipped: [] };
  try {
    if (!service_catalog_ids.length) {
      out.skipped.push({ reason: "no_services" });
      return json({ data: out });
    }
    let vehicleCapacityQt: number | null = null;
    if (vehicle_id) {
      const { data: vehicle } = await db.from("vehicles").select("oil_capacity").eq("id", vehicle_id).maybeSingle();
      if (vehicle?.oil_capacity) {
        const { data: parsed } = await db.rpc("parse_oil_capacity_qt", { p_text: vehicle.oil_capacity });
        vehicleCapacityQt = Number(parsed) || null;
      }
    }
    const { data: parts, error: partsErr } = await db
      .from("service_catalog_parts")
      .select("inventory_item_id, quantity, use_vehicle_oil_capacity, unit, is_required")
      .in("service_catalog_id", service_catalog_ids);
    if (partsErr) {
      out.skipped.push({ reason: `parts_query_error:${(partsErr as { message?: string }).message}` });
      return json({ data: out });
    }
    if (!parts?.length) {
      out.skipped.push({ reason: "no_parts_configured" });
      return json({ data: out });
    }
    const aggregated = new Map<string, number>();
    for (const p of parts as Array<{ inventory_item_id: string; quantity: number | null; use_vehicle_oil_capacity: boolean | null }>) {
      let qt = Number(p.quantity ?? 0);
      if (p.use_vehicle_oil_capacity) {
        if (!vehicleCapacityQt) {
          out.skipped.push({ itemId: p.inventory_item_id, reason: "no_vehicle_oil_capacity" });
          continue;
        }
        qt = vehicleCapacityQt;
      }
      if (!qt || qt <= 0) {
        out.skipped.push({ itemId: p.inventory_item_id, reason: "zero_quantity" });
        continue;
      }
      aggregated.set(p.inventory_item_id, (aggregated.get(p.inventory_item_id) ?? 0) + qt);
    }
    if (aggregated.size === 0) return json({ data: out });
    const itemIds = Array.from(aggregated.keys());
    const itemNamesById = new Map<string, string>();
    const { data: items } = await db.from("inventory_items").select("id, name").in("id", itemIds);
    for (const i of (items ?? []) as Array<{ id: string; name: string }>) itemNamesById.set(i.id, i.name);
    const payload = Array.from(aggregated.entries()).map(([id, qty]) => ({ inventory_item_id: id, quantity_qt: qty }));
    const { data, error } = await db.rpc("reserve_parts_for_appointment", {
      p_appointment_id: appointment_id,
      p_van_id: van_id ?? null,
      p_items: payload,
    });
    if (error) {
      out.skipped.push({ reason: `rpc_error:${(error as { message?: string }).message}` });
      return json({ data: out });
    }
    for (const row of (data ?? []) as Array<{ inventory_item_id: string; reservation_id: string | null; source: string; reserved_quantity: number | null; unit: string | null; shortage: number | null }>) {
      out.reservations.push({
        inventoryItemId: row.inventory_item_id,
        itemName: itemNamesById.get(row.inventory_item_id) ?? "Unknown item",
        reservationId: row.reservation_id,
        source: row.source,
        quantity: Number(row.reserved_quantity ?? 0),
        unit: row.unit ?? null,
        shortage: Number(row.shortage ?? 0),
      });
    }
    return json({ data: out });
  } catch (err) {
    console.warn("[reserveServicePartsForBooking] failed", err);
    out.skipped.push({ reason: "exception" });
    return json({ data: out });
  }
});

// POST /v1/appointments/booking-inventory/consume — consume reservations on completion.
appointmentsRouter.post("/v1/appointments/booking-inventory/consume", async (c: Context) => {
  const { appointment_id, override_qty_qt } = z.object({
    appointment_id: z.string().uuid(),
    override_qty_qt: z.number().nullable().optional(),
  }).parse(await c.req.json());
  const { supabase } = await optionalAuthClient(c);
  const db = supabase as any;
  const { data, error } = await db.rpc("consume_appointment_reservations", {
    p_appointment_id: appointment_id,
    p_override_qty_qt: override_qty_qt ?? null,
  });
  if (error) {
    console.warn("[consumeAppointmentReservations] error", error);
    return json({ data: { ok: false, consumed: [], error: (error as { message?: string }).message } });
  }
  return json({ data: { ok: true, consumed: data ?? [] } });
});

// POST /v1/appointments/booking-inventory/release — release reservations on cancel.
appointmentsRouter.post("/v1/appointments/booking-inventory/release", async (c: Context) => {
  const { appointment_id } = z.object({ appointment_id: z.string().uuid() }).parse(await c.req.json());
  const { supabase } = await optionalAuthClient(c);
  const db = supabase as any;
  const { data, error } = await db.rpc("release_appointment_reservations", { p_appointment_id: appointment_id });
  if (error) {
    console.warn("[releaseAppointmentReservations] error", error);
    return json({ data: { ok: false, released: 0, error: (error as { message?: string }).message } });
  }
  return json({ data: { ok: true, released: Number(data ?? 0) } });
});

// ---------------------------------------------------------------------------
// Storage uploads via multipart endpoints (replaces browser storage calls).
// ---------------------------------------------------------------------------

// POST /v1/appointments/booking-assessment-photos — upload a guest booking photo
// to the private booking-assessment-photos bucket and return a signed URL.
appointmentsRouter.post("/v1/appointments/booking-assessment-photos", async (c: Context) => {
  const { supabase } = await optionalAuthClient(c);
  const formData = await c.req.formData();
  const businessUserId = formData.get("business_user_id");
  const vehicleId = formData.get("vehicle_id");
  const file = formData.get("file");
  if (typeof businessUserId !== "string" || !businessUserId) throw new ApiError(400, "business_user_id is required", "missing_field");
  if (typeof vehicleId !== "string" || !vehicleId) throw new ApiError(400, "vehicle_id is required", "missing_field");
  if (!(file instanceof Blob)) throw new ApiError(400, "file is required", "missing_field");
  if (file.size > 10 * 1024 * 1024) throw new ApiError(413, "File too large (max 10MB)", "file_too_large");

  const db = supabase as any;
  const path = `${businessUserId}/${vehicleId}/${Date.now()}_${(file as File).name || "photo.jpg"}`;
  const { error: uploadError } = await db.storage.from("booking-assessment-photos").upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: true,
  });
  if (uploadError) return json({ data: null, error: serializeDataError(uploadError) });
  const { data, error } = await db.storage.from("booking-assessment-photos").createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return json({ data: null, error: serializeDataError(error) ?? { message: "Failed to sign upload URL", code: null, details: null, hint: null } });
  return json({ data: { signedUrl: data.signedUrl }, error: null });
});

// POST /v1/inspections/media — upload inspection media (multipart: path, file).
appointmentsRouter.post("/v1/inspections/media", async (c: Context) => {
  const { supabase } = await requireAuth(c);
  const formData = await c.req.formData();
  const path = formData.get("path");
  const file = formData.get("file");
  if (typeof path !== "string" || !path) throw new ApiError(400, "path is required", "missing_field");
  if (!(file instanceof Blob)) throw new ApiError(400, "file is required", "missing_field");
  const db = supabase as any;
  const { data, error } = await db.storage.from("inspection-media").upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: true,
  });
  if (error) return json({ data: null, error: serializeDataError(error) });
  return json({ data: data ?? { path }, error: null });
});

// GET /v1/inspections/media/signed-url — signed read URL for inspection media.
appointmentsRouter.get("/v1/inspections/media/signed-url", async (c: Context) => {
  const { supabase } = await requireAuth(c);
  const url = new URL(c.req.url);
  const path = url.searchParams.get("path");
  const expires = Number(url.searchParams.get("expires") ?? "3600") || 3600;
  if (!path) throw new ApiError(400, "path is required", "missing_field");
  const db = supabase as any;
  const { data, error } = await db.storage.from("inspection-media").createSignedUrl(path, expires);
  if (error) return json({ data: null, error: serializeDataError(error) });
  return json({ data: { signedUrl: data?.signedUrl ?? null }, error: null });
});

// POST /v1/inspections/media/upload-url — signed upload URL for inspection media.
appointmentsRouter.post("/v1/inspections/media/upload-url", async (c: Context) => {
  const { supabase } = await requireAuth(c);
  const { path } = z.object({ path: z.string().min(1).max(500) }).parse(await c.req.json());
  const db = supabase as any;
  const { data, error } = await db.storage.from("inspection-media").createSignedUploadUrl(path);
  if (error) return json({ data: null, error: serializeDataError(error) });
  return json({ data: { signedUrl: data?.signedUrl ?? null }, error: null });
});

// POST /v1/inspections/service-inspections — insert a service inspection row.
appointmentsRouter.post("/v1/inspections/service-inspections", async (c: Context) => {
  const { supabase } = await requireAuth(c);
  const { payload } = z.object({ payload: z.record(z.string(), z.unknown()) }).parse(await c.req.json());
  const db = supabase as any;
  const { data, error } = await db.from("service_inspections").insert(payload as never).select("id").single();
  if (error) return json({ data: null, error: serializeDataError(error) });
  return json({ data: { id: (data as { id: string }).id }, error: null });
});

// POST /v1/inspections/inspection-results — insert inspection result rows.
appointmentsRouter.post("/v1/inspections/inspection-results", async (c: Context) => {
  const { supabase } = await requireAuth(c);
  const { results } = z.object({ results: z.array(z.record(z.string(), z.unknown())) }).parse(await c.req.json());
  const db = supabase as any;
  const { data, error } = await db.from("inspection_results").insert(results as never).select();
  if (error) return json({ data: null, error: serializeDataError(error) });
  return json({ data: data ?? [], error: null });
});

// POST /v1/inspections/service-inspections/perform — full job-start inspection
// save: service_inspections row + inspection_results rows + service
// recommendations for attention/urgent results, mirroring the legacy client.
appointmentsRouter.post("/v1/inspections/service-inspections/perform", async (c: Context) => {
  const { supabase, user } = await requireAuth(c);
  const { appointment_id, vehicle_id, service_id, template_id, template_name, inspector_name, notes, results } = z.object({
    appointment_id: z.string().uuid(),
    vehicle_id: z.string().uuid(),
    service_id: z.string().uuid().nullable().optional(),
    template_id: z.string().uuid(),
    template_name: z.string().min(1),
    inspector_name: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    results: z.array(z.object({
      item_name: z.string().min(1),
      item_category: z.string().nullable().optional(),
      status: z.string().min(1),
      notes: z.string().nullable().optional(),
      sort_order: z.number().int(),
      service_catalog_id: z.string().uuid().nullable().optional(),
      price: z.number().nullable().optional(),
    })).min(1),
  }).parse(await c.req.json());
  const db = supabase as any;

  // Resolve workspace from the appointment (fallback: service record, vehicle).
  let workspaceId: string | null = null;
  const { data: appointment } = await db.from("appointments").select("workspace_id").eq("id", appointment_id).maybeSingle();
  workspaceId = (appointment as { workspace_id?: string } | null)?.workspace_id ?? null;
  if (!workspaceId && service_id) {
    const { data: serviceRecord } = await db.from("service_records").select("workspace_id").eq("id", service_id).maybeSingle();
    workspaceId = (serviceRecord as { workspace_id?: string } | null)?.workspace_id ?? null;
  }
  if (!workspaceId) {
    const { data: vehicle } = await db.from("vehicles").select("workspace_id").eq("id", vehicle_id).maybeSingle();
    workspaceId = (vehicle as { workspace_id?: string } | null)?.workspace_id ?? null;
  }
  if (!workspaceId) throw new ApiError(400, "Inspection must be associated with an appointment, service record, or vehicle.", "bad_request");
  await requireWorkspaceAuth(c, workspaceId, ["owner", "admin", "manager", "service_advisor", "technician", "dispatcher", "receptionist"]);

  const { data: inspection, error: inspectionError } = await db.from("service_inspections").insert({
    workspace_id: workspaceId,
    user_id: user.id,
    service_id: service_id ?? null,
    vehicle_id,
    appointment_id,
    template_id,
    template_name,
    inspector_name: inspector_name ?? null,
    notes: notes ?? null,
    status: "completed",
  }).select().single();
  if (inspectionError) throw inspectionError;

  const resultRecords = results.map((result) => ({
    workspace_id: workspaceId,
    inspection_id: (inspection as { id: string }).id,
    item_name: result.item_name,
    item_category: result.item_category ?? null,
    status: result.status,
    notes: result.notes ?? null,
    sort_order: result.sort_order,
  }));
  const { data: insertedResults, error: resultsError } = await db.from("inspection_results").insert(resultRecords).select();
  if (resultsError) throw resultsError;
  const inserted: Array<{ id: string; status: string }> = (insertedResults ?? []) as Array<{ id: string; status: string }>;

  for (let i = 0; i < inserted.length; i++) {
    const status = String(inserted[i].status || "").toLowerCase();
    if (status !== "attention" && status !== "urgent") continue;
    const original = results[i];
    const { error: recommendationError } = await db.from("service_recommendations").insert({
      workspace_id: workspaceId,
      appointment_id,
      vehicle_id,
      inspection_id: (inspection as { id: string }).id,
      inspection_result_id: inserted[i].id,
      service_catalog_id: original.service_catalog_id ?? null,
      description: original.item_name,
      technician_notes: original.notes ?? null,
      price: original.price ?? null,
      status: "pending",
    });
    if (recommendationError) throw recommendationError;
  }

  return json({ data: { id: (inspection as { id: string }).id } });
});

// ---------------------------------------------------------------------------
// Inspection templates, performer reads, full inspection save, gate, report.
// ---------------------------------------------------------------------------

// GET /v1/inspections/templates — caller's templates with their items (user-scoped,
// mirroring the legacy client which keys templates by user_id).
appointmentsRouter.get("/v1/inspections/templates", async (c: Context) => {
  const { supabase, user } = await requireAuth(c);
  const db = supabase as any;
  const { data: templates, error: templateError } = await db
    .from("inspection_templates")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (templateError) throw templateError;
  const rows = ((templates ?? []) as Array<{ id: string }>);
  const { data: itemsData, error: itemsError } = rows.length
    ? await db.from("inspection_items").select("*").in("template_id", rows.map((t) => t.id)).order("sort_order")
    : { data: [], error: null };
  if (itemsError) throw itemsError;
  const items: Record<string, unknown[]> = {};
  for (const item of (itemsData ?? []) as Array<{ template_id: string }>) {
    if (!items[item.template_id]) items[item.template_id] = [];
    items[item.template_id].push(item);
  }
  return json({ data: { templates: templates ?? [], items } });
});

// POST /v1/inspections/templates — create a template.
appointmentsRouter.post("/v1/inspections/templates", async (c: Context) => {
  const { supabase, user } = await requireAuth(c);
  const { name, description, category } = z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).nullable().optional(),
    category: z.string().max(80).nullable().optional(),
  }).parse(await c.req.json());
  const db = supabase as any;
  const { data, error } = await db
    .from("inspection_templates")
    .insert({ user_id: user.id, name, description: description ?? null, category: category ?? null })
    .select()
    .single();
  if (error) throw error;
  return json({ data });
});

// PATCH /v1/inspections/templates/:id — update a template.
appointmentsRouter.patch("/v1/inspections/templates/:id", async (c: Context) => {
  const { supabase, user } = await requireAuth(c);
  const id = z.string().uuid().parse(c.req.param("id"));
  const patch = z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    category: z.string().max(80).nullable().optional(),
    is_active: z.boolean().optional(),
  }).parse(await c.req.json());
  const db = supabase as any;
  const { data, error } = await db
    .from("inspection_templates")
    .update(patch)
    .eq("user_id", user.id)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return json({ data });
});

// DELETE /v1/inspections/templates/:id — delete a template.
appointmentsRouter.delete("/v1/inspections/templates/:id", async (c: Context) => {
  const { supabase, user } = await requireAuth(c);
  const id = z.string().uuid().parse(c.req.param("id"));
  const db = supabase as any;
  const { error } = await db.from("inspection_templates").delete().eq("user_id", user.id).eq("id", id);
  if (error) throw error;
  return json({ data: { id } });
});

// POST /v1/inspections/templates/:templateId/items — add a template item.
appointmentsRouter.post("/v1/inspections/templates/:templateId/items", async (c: Context) => {
  const { supabase, user } = await requireAuth(c);
  const templateId = z.string().uuid().parse(c.req.param("templateId"));
  const item = z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).nullable().optional(),
    category: z.string().max(80).nullable().optional(),
    is_required: z.boolean().optional(),
    sort_order: z.number().int().optional(),
  }).parse(await c.req.json());
  const db = supabase as any;
  const { data: template, error: templateError } = await db
    .from("inspection_templates")
    .select("id")
    .eq("user_id", user.id)
    .eq("id", templateId)
    .single();
  if (templateError || !template) throw templateError ?? new ApiError(404, "Template not found.", "not_found");
  const { data, error } = await db
    .from("inspection_items")
    .insert({
      template_id: templateId,
      name: item.name,
      description: item.description ?? null,
      category: item.category ?? null,
      is_required: item.is_required ?? true,
      sort_order: item.sort_order ?? 0,
    })
    .select()
    .single();
  if (error) throw error;
  return json({ data });
});

// DELETE /v1/inspections/items/:id — delete a template item.
appointmentsRouter.delete("/v1/inspections/items/:id", async (c: Context) => {
  const { supabase, user } = await requireAuth(c);
  const id = z.string().uuid().parse(c.req.param("id"));
  const db = supabase as any;
  const { data: row, error: readError } = await db
    .from("inspection_items")
    .select("id,template_id,inspection_templates!inner(user_id)")
    .eq("id", id)
    .eq("inspection_templates.user_id", user.id)
    .maybeSingle();
  if (readError) throw readError;
  if (!row) throw new ApiError(404, "Item not found.", "not_found");
  const { error } = await db.from("inspection_items").delete().eq("id", id);
  if (error) throw error;
  return json({ data: { id } });
});

// GET /v1/inspections/items — items for one template.
appointmentsRouter.get("/v1/inspections/items", async (c: Context) => {
  const { supabase, user } = await requireAuth(c);
  const templateId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("template_id") ?? "");
  const db = supabase as any;
  const { data: template, error: templateError } = await db
    .from("inspection_templates")
    .select("id")
    .eq("user_id", user.id)
    .eq("id", templateId)
    .maybeSingle();
  if (templateError) throw templateError;
  if (!template) throw new ApiError(404, "Template not found.", "not_found");
  const { data, error } = await db
    .from("inspection_items")
    .select("*")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return json({ data: data ?? [] });
});

const inspectionResultSchema = z.object({
  template_item_id: z.string().uuid(),
  condition: z.enum(["good", "fair", "poor", "critical"]),
  notes: z.string().max(2000).optional(),
  photo_urls: z.array(z.string().url().max(2000)).optional(),
  measurement_value: z.number().nullable().optional(),
  measurement_unit: z.string().max(40).nullable().optional(),
  recommended_service_id: z.string().uuid().nullable().optional(),
  estimated_cost: z.number().nullable().optional(),
});

// GET /v1/inspections/performer-data — templates + past inspections for a service/vehicle.
appointmentsRouter.get("/v1/inspections/performer-data", async (c: Context) => {
  const { supabase, user } = await requireAuth(c);
  const url = new URL(c.req.url);
  const serviceIdParam = url.searchParams.get("service_id");
  const vehicleIdParam = url.searchParams.get("vehicle_id");
  const serviceId = serviceIdParam ? z.string().uuid().parse(serviceIdParam) : null;
  const vehicleId = vehicleIdParam ? z.string().uuid().parse(vehicleIdParam) : null;
  const db = supabase as any;
  const templatesPromise = db
    .from("inspection_templates")
    .select("id, name, description, category")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("name");
  let pastQuery = db
    .from("service_inspections")
    .select("id, template_name, inspector_name, inspection_date, notes, status")
    .order("inspection_date", { ascending: false })
    .limit(5);
  if (serviceId) pastQuery = pastQuery.eq("service_id", serviceId);
  if (vehicleId) pastQuery = pastQuery.eq("vehicle_id", vehicleId);
  const [templatesRes, pastRes] = await Promise.all([templatesPromise, pastQuery]);
  if (templatesRes.error) throw templatesRes.error;
  if (pastRes.error) throw pastRes.error;
  return json({ data: { templates: templatesRes.data ?? [], pastInspections: pastRes.data ?? [] } });
});

// GET /v1/inspections/appointment-gate — required inspections for an appointment,
// scoped to each service line's vehicle, with completion state.
appointmentsRouter.get("/v1/inspections/appointment-gate", async (c: Context) => {
  const appointmentId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("appointment_id") ?? "");
  const { supabase } = await requireAuth(c);
  const db = supabase as any;

  const { data: appt, error: apptError } = await db
    .from("appointments")
    .select("id, workspace_id, vehicle_id")
    .eq("id", appointmentId)
    .maybeSingle();
  if (apptError) throw apptError;
  if (!appt) return json({ data: { required: [], pendingCount: 0 } });
  const appointment = appt as { id: string; workspace_id: string; vehicle_id: string | null };
  await requireWorkspaceAuth(c, appointment.workspace_id, ["owner", "admin", "manager", "service_advisor", "technician", "dispatcher", "receptionist"]);

  const { data: appointmentItems, error: itemsError } = await db
    .from("appointment_items")
    .select("service_catalog_id, metadata")
    .eq("workspace_id", appointment.workspace_id)
    .eq("appointment_id", appointmentId);
  if (itemsError) throw itemsError;
  const catalogIds = Array.from(new Set<string>(((appointmentItems ?? []) as Array<{ service_catalog_id: string | null }>).map((row) => row.service_catalog_id).filter((id): id is string => Boolean(id))));
  if (catalogIds.length === 0) return json({ data: { required: [], pendingCount: 0 } });

  const { data: catalogRows, error: catalogError } = await db
    .from("service_catalog")
    .select("id, name, inspection_template_id")
    .eq("workspace_id", appointment.workspace_id)
    .in("id", catalogIds)
    .not("inspection_template_id", "is", null);
  if (catalogError) throw catalogError;
  const catalogById = new Map<string, { id: string; name: string; inspection_template_id: string }>(
    ((catalogRows ?? []) as Array<{ id: string; name: string; inspection_template_id: string }>).map((row) => [row.id, row]),
  );

  const required: Array<{ templateId: string; templateName: string; vehicleId: string | null }> = [];
  const seen = new Set<string>();
  for (const item of (appointmentItems ?? []) as Array<{ service_catalog_id: string | null; metadata: { vehicle_id?: unknown } | null }>) {
    const catalog = item.service_catalog_id ? catalogById.get(item.service_catalog_id) : undefined;
    const templateId = catalog?.inspection_template_id;
    if (!templateId) continue;
    const metadataVehicleId = typeof item.metadata?.vehicle_id === "string" && item.metadata.vehicle_id ? item.metadata.vehicle_id : null;
    const vehicleId = metadataVehicleId ?? appointment.vehicle_id ?? null;
    const key = `${templateId}:${vehicleId ?? "none"}`;
    if (seen.has(key)) continue;
    required.push({ templateId, templateName: catalog.name, vehicleId });
    seen.add(key);
  }
  if (required.length === 0) return json({ data: { required: [], pendingCount: 0 } });

  const { data: completed, error: completedError } = await db
    .from("service_inspections")
    .select("template_id, vehicle_id")
    .eq("workspace_id", appointment.workspace_id)
    .eq("appointment_id", appointmentId)
    .eq("status", "completed");
  if (completedError) throw completedError;
  const completedPairs = new Set<string>(
    ((completed ?? []) as Array<{ template_id: string; vehicle_id: string | null }>).map((row) => `${row.template_id}:${row.vehicle_id ?? "none"}`),
  );
  const out = required.map((r) => ({ ...r, completed: completedPairs.has(`${r.templateId}:${r.vehicleId ?? "none"}`) }));
  return json({ data: { required: out, pendingCount: out.filter((r) => !r.completed).length } });
});

// GET /v1/inspections/:id/report — customer-facing visual inspection report (optional auth).
appointmentsRouter.get("/v1/inspections/:id/report", async (c: Context) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const { supabase } = await optionalAuthClient(c);
  const db = supabase as any;
  const { data: inspection } = await db.from("service_inspections").select("*").eq("id", id).single();
  if (!inspection) throw new ApiError(404, "Inspection not found.", "not_found");
  const row = inspection as { vehicle_id?: string | null; user_id?: string | null };
  const { data: results } = await db
    .from("inspection_results")
    .select("*")
    .eq("inspection_id", id)
    .order("sort_order");
  let vehicle = null;
  let business = null;
  if (row.vehicle_id) {
    const { data: veh } = await (supabase as any)
      .from("vehicles")
      .select("year, make, model, vin, license_plate, color, mileage")
      .eq("id", row.vehicle_id)
      .single();
    vehicle = veh ?? null;
  }
  if (row.user_id) {
    const { data: biz } = await (supabase as any)
      .from("business_profiles")
      .select("business_name, phone, email, logo_url, service_address")
      .eq("user_id", row.user_id)
      .single();
    business = biz ?? null;
  }
  return json({ data: { inspection, results: results ?? [], vehicle, business } });
});

// ---------------------------------------------------------------------------
// Appointment read surface: workspace context, addresses, fees, payments,
// service lines, specs, vans, availability, quick-service form data.
// ---------------------------------------------------------------------------

// GET /v1/appointments/workspace-context — timezone, tax rate, operational settings.
appointmentsRouter.get("/v1/appointments/workspace-context", async (c: Context) => {
  const { supabase, workspaceId } = await requireCallerWorkspace(c, selectedWorkspaceHint(new URL(c.req.url)));
  const db = supabase as any;
  const [{ data: workspace, error: workspaceError }, { data: settings, error: settingsError }] = await Promise.all([
    db.from("workspaces").select("timezone").eq("id", workspaceId).maybeSingle(),
    db.from("workspace_settings").select("tax_rate,operational_settings").eq("workspace_id", workspaceId).maybeSingle(),
  ]);
  if (workspaceError) throw workspaceError;
  if (settingsError) throw settingsError;
  return json({
    data: {
      timezone: (workspace as { timezone?: string | null } | null)?.timezone ?? null,
      tax_rate: (settings as { tax_rate?: number | null } | null)?.tax_rate ?? null,
      operational_settings: (settings as { operational_settings?: unknown } | null)?.operational_settings ?? null,
    },
  });
});

const CUSTOMER_ADDRESS_COLUMNS = "id,address_line1,address_line2,city,region,postal_code,latitude,longitude";

// GET /v1/appointments/customer-address — address fields for a customer.
appointmentsRouter.get("/v1/appointments/customer-address", async (c: Context) => {
  const { supabase, workspaceId } = await requireCallerWorkspace(c, selectedWorkspaceHint(new URL(c.req.url)));
  const customerId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("customer_id") ?? "");
  const { data, error } = await (supabase as any)
    .from("customers")
    .select(CUSTOMER_ADDRESS_COLUMNS)
    .eq("workspace_id", workspaceId)
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw error;
  return json({ data: data ?? null });
});

// GET /v1/appointments/customer-address-by-email — address for a guest email.
appointmentsRouter.get("/v1/appointments/customer-address-by-email", async (c: Context) => {
  const { supabase, workspaceId } = await requireCallerWorkspace(c, selectedWorkspaceHint(new URL(c.req.url)));
  const email = z.string().max(320).parse(new URL(c.req.url).searchParams.get("email") ?? "");
  const { data, error } = await (supabase as any)
    .from("customers")
    .select("address_line1,address_line2,city,region,postal_code,phone")
    .eq("workspace_id", workspaceId)
    .ilike("email", email)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return json({ data: data ?? null });
});

// GET /v1/appointments/fee-settings — fee-related workspace settings columns.
appointmentsRouter.get("/v1/appointments/fee-settings", async (c: Context) => {
  const { supabase, workspaceId } = await requireCallerWorkspace(c, selectedWorkspaceHint(new URL(c.req.url)));
  const { data, error } = await (supabase as any)
    .from("workspace_settings")
    .select("waste_oil_fee_enabled,waste_oil_fee,shop_fee_enabled,shop_fee_type,shop_fee_value,shop_fee_description,surcharge_enabled,surcharge_type,surcharge_value,surcharge_description,tax_rate")
    .eq("workspace_id", workspaceId)
    .single();
  if (error) throw error;
  return json({ data: data ?? null });
});

// GET /v1/appointments/vehicle-service-specs — tire/service specs for a vehicle.
appointmentsRouter.get("/v1/appointments/vehicle-service-specs", async (c: Context) => {
  const { supabase, workspaceId } = await requireCallerWorkspace(c, selectedWorkspaceHint(new URL(c.req.url)));
  const vehicleId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("vehicle_id") ?? "");
  const { data, error } = await (supabase as any)
    .from("vehicle_service_specs")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("vehicle_id", vehicleId)
    .maybeSingle();
  if (error) throw error;
  return json({ data: data ?? null });
});

// GET /v1/appointments/service-catalog — active catalog rows for the workspace.
appointmentsRouter.get("/v1/appointments/service-catalog", async (c: Context) => {
  const url = new URL(c.req.url);
  const { supabase, workspaceId } = await requireCallerWorkspace(c, selectedWorkspaceHint(url));
  const activeOnly = url.searchParams.get("active") !== "false";
  let query = (supabase as any)
    .from("service_catalog")
    .select("id,name,description,labor_price,estimated_minutes,category,is_active,metadata")
    .eq("workspace_id", workspaceId)
    .order("name");
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return json({ data: data ?? [] });
});

// GET /v1/appointments/service-catalog-item — one catalog row for appointment detail.
appointmentsRouter.get("/v1/appointments/service-catalog-item", async (c: Context) => {  const { supabase, workspaceId } = await requireCallerWorkspace(c, selectedWorkspaceHint(new URL(c.req.url)));
  const serviceCatalogId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("service_catalog_id") ?? "");
  const { data, error } = await (supabase as any)
    .from("service_catalog")
    .select("id,name,description,category,labor_price,estimated_minutes,is_active")
    .eq("workspace_id", workspaceId)
    .eq("id", serviceCatalogId)
    .maybeSingle();
  if (error) throw error;
  return json({ data: data ?? null });
});

// GET /v1/appointments/:id/payments — payments bound to an appointment via metadata.
appointmentsRouter.get("/v1/appointments/:id/payments", async (c: Context) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const url = new URL(c.req.url);
  const status = url.searchParams.get("status");
  const { supabase, workspaceId } = await requireCallerWorkspace(c, selectedWorkspaceHint(url));
  let query = (supabase as any)
    .from("payments")
    .select("id,amount,status,provider,provider_payment_id,created_at,updated_at,metadata")
    .eq("workspace_id", workspaceId)
    .contains("metadata", { appointment_id: id })
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return json({ data: data ?? [] });
});

// GET /v1/appointments/:id/services — appointment service lines + catalog fallback.
appointmentsRouter.get("/v1/appointments/:id/services", async (c: Context) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const url = new URL(c.req.url);
  const { supabase, workspaceId } = await requireCallerWorkspace(c, selectedWorkspaceHint(url));
  const db = supabase as any;
  const serviceCatalogId = url.searchParams.get("service_catalog_id");

  const { data: items, error: itemsError } = await db
    .from("appointment_items")
    .select("id,appointment_id,description,quantity,unit_price,service_catalog_id,is_prepaid,added_at_service,created_at,service_catalog(id,name,description,labor_price)")
    .eq("workspace_id", workspaceId)
    .eq("appointment_id", id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (itemsError) throw itemsError;

  let catalogService: unknown = null;
  let appointmentMetadata: Record<string, unknown> | null = null;
  if ((items ?? []).length === 0) {
    const { data: appointment, error: appointmentError } = await db
      .from("appointments")
      .select("metadata")
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .maybeSingle();
    if (appointmentError) throw appointmentError;
    const metadata = ((appointment as { metadata?: unknown } | null)?.metadata ?? {}) as Record<string, unknown>;
    appointmentMetadata = metadata;
    const metadataCatalogId = typeof metadata.service_catalog_id === "string" ? metadata.service_catalog_id : null;
    const catalogId = serviceCatalogId ?? metadataCatalogId;
    if (catalogId) {
      const { data: catalog, error: catalogError } = await db
        .from("service_catalog")
        .select("id,name,description,labor_price")
        .eq("workspace_id", workspaceId)
        .eq("id", catalogId)
        .maybeSingle();
      if (catalogError) throw catalogError;
      catalogService = catalog ?? null;
    }
  }

  return json({ data: { items: items ?? [], appointment_metadata: appointmentMetadata, catalog_service: catalogService } });
});

const appointmentServiceWriteSchema = z.object({
  service_catalog_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(300),
  description: z.string().max(2000).nullable().optional(),
  price: z.number().min(0),
  quantity: z.number().int().min(1),
  is_prepaid: z.boolean(),
  added_at_service: z.boolean(),
});

// POST /v1/appointments/:id/services — add a service line to an appointment.
appointmentsRouter.post("/v1/appointments/:id/services", async (c: Context) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const body = appointmentServiceWriteSchema.parse(await c.req.json());
  const { supabase, workspaceId } = await requireStaffWorkspace(c, selectedWorkspaceHint(new URL(c.req.url)));
  const db = supabase as any;
  const { data, error } = await db
    .from("appointment_items")
    .insert({
      workspace_id: workspaceId,
      appointment_id: id,
      service_catalog_id: body.service_catalog_id ?? null,
      item_type: "service",
      description: body.name,
      quantity: body.quantity,
      unit_price: body.price,
      is_prepaid: body.is_prepaid,
      added_at_service: body.added_at_service,
      metadata: { source: "appointment_detail", description: body.description ?? null },
    } as never)
    .select()
    .single();
  if (error) throw error;
  return json({ data, error: null });
});

// PATCH /v1/appointments/services/:serviceId — update a service line.
appointmentsRouter.patch("/v1/appointments/services/:serviceId", async (c: Context) => {
  const serviceId = z.string().uuid().parse(c.req.param("serviceId"));
  const body = appointmentServiceWriteSchema.parse(await c.req.json());
  const { supabase, workspaceId } = await requireStaffWorkspace(c, selectedWorkspaceHint(new URL(c.req.url)));
  const db = supabase as any;
  const { data, error } = await db
    .from("appointment_items")
    .update({
      service_catalog_id: body.service_catalog_id ?? null,
      description: body.name,
      quantity: body.quantity,
      unit_price: body.price,
      is_prepaid: body.is_prepaid,
      added_at_service: body.added_at_service,
      metadata: { source: "appointment_detail", description: body.description ?? null },
    } as never)
    .eq("workspace_id", workspaceId)
    .eq("id", serviceId)
    .select()
    .single();
  if (error) throw error;
  return json({ data, error: null });
});

// DELETE /v1/appointments/services/:serviceId — remove a service line.
appointmentsRouter.delete("/v1/appointments/services/:serviceId", async (c: Context) => {
  const serviceId = z.string().uuid().parse(c.req.param("serviceId"));
  const { supabase, workspaceId } = await requireStaffWorkspace(c, undefined);
  const { error } = await (supabase as any)
    .from("appointment_items")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", serviceId);
  if (error) throw error;
  return json({ data: { id: serviceId } });
});

// GET /v1/appointments/technician-availability — availability rows for a technician.
appointmentsRouter.get("/v1/appointments/technician-availability", async (c: Context) => {
  const { supabase, workspaceId } = await requireStaffWorkspace(c, selectedWorkspaceHint(new URL(c.req.url)));
  const technicianId = new URL(c.req.url).searchParams.get("technician_id") ?? "";
  const { data, error } = await (supabase as any)
    .from("technician_availability")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("technician_id", technicianId)
    .order("weekday")
    .order("start_time");
  if (error) throw error;
  return json({ data: data ?? [] });
});

// POST /v1/appointments/technician-availability — upsert availability rows for a technician.
appointmentsRouter.post("/v1/appointments/technician-availability", async (c: Context) => {
  const { technician_id, user_id, rows } = z.object({
    technician_id: z.string().min(1),
    user_id: z.string().uuid(),
    rows: z.array(z.object({
      weekday: z.string().min(1).max(16),
      start_time: z.string().min(1).max(8),
      end_time: z.string().min(1).max(8),
      is_available: z.boolean(),
      existingId: z.string().uuid().nullable().optional(),
    })),
  }).parse(await c.req.json());
  const { supabase, user, workspaceId } = await requireStaffWorkspace(c, selectedWorkspaceHint(new URL(c.req.url)));
  if (user_id !== user.id) throw new ApiError(403, "user_id must match the caller.", "forbidden");
  const db = supabase as any;
  const saved: unknown[] = [];
  for (const row of rows) {
    if (row.existingId) {
      const { data, error } = await db
        .from("technician_availability")
        .update({
          weekday: row.weekday,
          start_time: row.start_time,
          end_time: row.end_time,
          is_available: row.is_available,
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", workspaceId)
        .eq("id", row.existingId)
        .select()
        .single();
      if (error) throw error;
      saved.push(data);
    } else {
      const { data, error } = await db
        .from("technician_availability")
        .insert({
          workspace_id: workspaceId,
          technician_id,
          user_id,
          weekday: row.weekday,
          start_time: row.start_time,
          end_time: row.end_time,
          is_available: row.is_available,
        })
        .select()
        .single();
      if (error) throw error;
      saved.push(data);
    }
  }
  return json({ data: { rows: saved } });
});

// GET /v1/appointments/quick-service-form-data — catalog + business name for quick service.
appointmentsRouter.get("/v1/appointments/quick-service-form-data", async (c: Context) => {
  const { supabase, user, workspaceId } = await requireCallerWorkspace(c, selectedWorkspaceHint(new URL(c.req.url)));
  const db = supabase as any;
  const [{ data: services, error: servicesError }, { data: profile, error: profileError }] = await Promise.all([
    db.from("service_catalog").select("id,name,description,labor_price,estimated_minutes,category,is_active,metadata").eq("workspace_id", workspaceId).eq("is_active", true).order("name"),
    db.from("business_profiles").select("business_name").eq("user_id", user.id).maybeSingle(),
  ]);
  if (servicesError) throw servicesError;
  if (profileError) throw profileError;
  return json({
    data: {
      services: (services ?? []).map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description ?? "",
        default_price: Number(s.metadata?.default_price ?? s.labor_price ?? 0),
        estimated_minutes: s.estimated_minutes ?? 60,
        category: s.category ?? "general",
      })),
      businessName: (profile as { business_name?: string } | null)?.business_name ?? "Service Business",
    },
  });
});

// ---------------------------------------------------------------------------
// Dispatch: board reads, settings, assignment validation, technician state.
// ---------------------------------------------------------------------------

// GET /v1/dispatch/board-members — dispatch board staff (members with profiles) + presence rows.
appointmentsRouter.get("/v1/dispatch/board-members", async (c: Context) => {
  const { supabase, workspaceId } = await requireStaffWorkspace(c, selectedWorkspaceHint(new URL(c.req.url)));
  const db = supabase as any;
  const [{ data: members, error: membersError }, { data: presence, error: presenceError }] = await Promise.all([
    db.from("workspace_members").select("user_id,role,is_active,profiles!workspace_members_user_id_fkey(display_name,phone,avatar_url)").eq("workspace_id", workspaceId).eq("is_active", true).in("role", ["technician", "owner", "manager"]),
    db.from("technician_presence").select("user_id,status,current_location,last_seen_at").eq("workspace_id", workspaceId),
  ]);
  if (membersError) throw membersError;
  if (presenceError) throw presenceError;
  return json({ data: { members: members ?? [], presence: presence ?? [] } });
});

// GET /v1/dispatch/operational-jobs — raw appointment/work-order/member rows for the operational jobs board.
appointmentsRouter.get("/v1/dispatch/operational-jobs", async (c: Context) => {
  const { supabase, workspaceId } = await requireStaffWorkspace(c, selectedWorkspaceHint(new URL(c.req.url)));
  const url = new URL(c.req.url);
  const fromDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(url.searchParams.get("from") ?? "");
  const toDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(url.searchParams.get("to") ?? "");
  const startIso = new Date(`${fromDate}T00:00:00`).toISOString();
  const endIso = new Date(`${toDate}T23:59:59.999`).toISOString();
  const db = supabase as any;
  const [appointmentsRes, workOrdersRes, membersRes] = await Promise.all([
    db.from("appointments")
      .select("id,status,starts_at,ends_at,assigned_user_id,updated_at,metadata,customers(first_name,last_name,company_name,phone,address_line1,address_line2,city,region,postal_code),vehicles(year,make,model),locations(address_line1,address_line2,city,region,postal_code,latitude,longitude)")
      .eq("workspace_id", workspaceId)
      .gte("starts_at", startIso)
      .lte("starts_at", endIso)
      .order("starts_at"),
    db.from("work_orders")
      .select("id,number,status,priority,opened_at,created_at,updated_at,technician_notes,metadata,customers(first_name,last_name,company_name,phone,address_line1,address_line2,city,region,postal_code),vehicles(year,make,model),locations(address_line1,address_line2,city,region,postal_code,latitude,longitude),work_order_assignments(user_id,assigned_at,unassigned_at)")
      .eq("workspace_id", workspaceId)
      .is("appointment_id", null)
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .order("created_at"),
    db.from("workspace_members")
      .select("user_id,profiles!workspace_members_user_id_fkey(display_name)")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true),
  ]);
  const error = appointmentsRes.error ?? workOrdersRes.error ?? membersRes.error;
  if (error) throw error;
  return json({
    data: {
      appointments: appointmentsRes.data ?? [],
      work_orders: workOrdersRes.data ?? [],
      members: membersRes.data ?? [],
    },
  });
});

// GET /v1/dispatch/board-staff — workspace members + their presence rows.
appointmentsRouter.get("/v1/dispatch/board-staff", async (c: Context) => {
  const { supabase, workspaceId } = await requireStaffWorkspace(c, selectedWorkspaceHint(new URL(c.req.url)));
  const db = supabase as any;
  const [{ data: members, error: membersError }, { data: presence, error: presenceError }] = await Promise.all([
    db.from("workspace_members").select("user_id,role,is_active").eq("workspace_id", workspaceId).eq("is_active", true),
    db.from("technician_presence").select("*").eq("workspace_id", workspaceId),
  ]);
  if (membersError) throw membersError;
  if (presenceError) throw presenceError;
  return json({ data: { members: members ?? [], presence: presence ?? [] } });
});

const DISPATCHABLE_COLUMNS = "id,starts_at,ends_at,status,assigned_user_id,vehicle_id,customer_id,priority,metadata,location_address,location_lat,location_lng,created_at";

// GET /v1/dispatch/dispatchable-appointments — open appointments with assignment context.
appointmentsRouter.get("/v1/dispatch/dispatchable-appointments", async (c: Context) => {
  const { supabase, workspaceId } = await requireStaffWorkspace(c, selectedWorkspaceHint(new URL(c.req.url)));
  const url = new URL(c.req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "50") || 50, 1), 200);
  const { data, error } = await (supabase as any)
    .from("appointments")
    .select(DISPATCHABLE_COLUMNS)
    .eq("workspace_id", workspaceId)
    .not("status", "in", '("completed","cancelled","no_show")')
    .is("deleted_at", null)
    .order("starts_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return json({ data: data ?? [] });
});

// GET /v1/dispatch/settings — dispatch settings for the caller's business profile.
appointmentsRouter.get("/v1/dispatch/settings", async (c: Context) => {
  const { supabase, user } = await requireAuth(c);
  const userId = new URL(c.req.url).searchParams.get("user_id") ?? "";
  if (userId !== user.id) throw new ApiError(403, "user_id must match the caller.", "forbidden");
  const { data, error } = await (supabase as any)
    .from("business_profiles")
    .select("user_id,auto_dispatch_enabled,dispatch_weight_distance,dispatch_weight_load,dispatch_weight_performance,dispatch_weight_fairness,dispatch_weight_route,dispatch_fleet_performance_threshold,default_technician_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return json({ data: data ?? null });
});

// PATCH /v1/dispatch/settings — update dispatch settings on the caller's business profile.
appointmentsRouter.patch("/v1/dispatch/settings", async (c: Context) => {
  const { user_id, values } = z.object({
    user_id: z.string().uuid(),
    values: z.object({
      auto_dispatch_enabled: z.boolean().optional(),
      dispatch_weight_distance: z.number().min(0).max(1).optional(),
      dispatch_weight_load: z.number().min(0).max(1).optional(),
      dispatch_weight_performance: z.number().min(0).max(1).optional(),
      dispatch_weight_fairness: z.number().min(0).max(1).optional(),
      dispatch_weight_route: z.number().min(0).max(1).optional(),
      dispatch_fleet_performance_threshold: z.number().min(0).optional(),
      default_technician_id: z.string().uuid().nullable().optional(),
    }),
  }).parse(await c.req.json());
  const { supabase, user } = await requireAuth(c);
  if (user_id !== user.id) throw new ApiError(403, "user_id must match the caller.", "forbidden");
  const db = supabase as any;
  const { error: profileError } = await db.from("business_profiles").select("user_id").eq("user_id", user_id).maybeSingle();
  if (profileError) throw profileError;
  const { error } = await db.from("business_profiles").update(values).eq("user_id", user_id);
  if (error) throw error;
  return json({ data: { ok: true } });
});

// POST /v1/dispatch/validate-assignment — raw technician + same-day jobs for guardrail checks.
appointmentsRouter.post("/v1/dispatch/validate-assignment", async (c: Context) => {
  const { technician_id, job_date, job_time, job_duration_minutes, exclude_appointment_id } = z.object({
    technician_id: z.string().min(1),
    job_date: z.string().min(1).max(10),
    job_time: z.string().min(1).max(8),
    job_duration_minutes: z.number().int().min(1),
    exclude_appointment_id: z.string().uuid().optional(),
  }).parse(await c.req.json());
  const { supabase, workspaceId } = await requireStaffWorkspace(c, undefined);
  const db = supabase as any;
  const { data: technician, error: techError } = await db
    .from("technicians")
    .select("id,name,status,max_daily_capacity_hours,is_active,auth_user_id")
    .eq("workspace_id", workspaceId)
    .eq("id", technician_id)
    .maybeSingle();
  if (techError) throw techError;
  if (!technician) throw new ApiError(404, "Technician not found.", "not_found");
  const dayStart = new Date(`${job_date}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  let jobsQuery = db
    .from("appointments")
    .select("id,starts_at,ends_at,status")
    .eq("workspace_id", workspaceId)
    .eq("assigned_user_id", (technician as { auth_user_id?: string | null }).auth_user_id ?? technician_id)
    .gte("starts_at", dayStart.toISOString())
    .lt("starts_at", dayEnd.toISOString())
    .not("status", "in", '("cancelled","completed","no_show")');
  if (exclude_appointment_id) jobsQuery = jobsQuery.neq("id", exclude_appointment_id);
  const { data: existingJobs, error: jobsError } = await jobsQuery;
  if (jobsError) throw jobsError;
  return json({ data: { technician, existingJobs: existingJobs ?? [] } });
});

// GET /v1/dispatch/technician-state — member + presence + open appointments for live tech status.
appointmentsRouter.get("/v1/dispatch/technician-state", async (c: Context) => {
  const { supabase, workspaceId } = await requireCallerWorkspace(c, selectedWorkspaceHint(new URL(c.req.url)));
  const technicianId = new URL(c.req.url).searchParams.get("technician_id") ?? "";
  const db = supabase as any;
  const [{ data: member, error: memberError }, { data: presence, error: presenceError }, { data: appointments, error: appointmentsError }] = await Promise.all([
    db.from("workspace_members").select("user_id,role,is_active").eq("workspace_id", workspaceId).eq("user_id", technicianId).eq("is_active", true).maybeSingle(),
    db.from("technician_presence").select("status,current_location,current_appointment_id,clocked_in_at").eq("workspace_id", workspaceId).eq("user_id", technicianId).maybeSingle(),
    db.from("appointments").select("id,status,metadata,starts_at").eq("workspace_id", workspaceId).eq("assigned_user_id", technicianId).not("status", "in", '("completed","cancelled","no_show")').order("starts_at", { ascending: true }).limit(20),
  ]);
  if (memberError) throw memberError;
  if (presenceError) throw presenceError;
  if (appointmentsError) throw appointmentsError;
  return json({ data: { member: member ?? null, presence: presence ?? null, appointments: appointments ?? [] } });
});

// GET /v1/dispatch/mobile-dispatch-state — member + presence + clock entry + open jobs for mobile dispatch.
appointmentsRouter.get("/v1/dispatch/mobile-dispatch-state", async (c: Context) => {
  const { supabase, workspaceId } = await requireCallerWorkspace(c, selectedWorkspaceHint(new URL(c.req.url)));
  const userId = new URL(c.req.url).searchParams.get("user_id") ?? "";
  const db = supabase as any;
  const [{ data: member, error: memberError }, { data: presence, error: presenceError }, { data: clockEntries, error: clockError }, { data: jobs, error: jobsError }] = await Promise.all([
    db.from("workspace_members").select("user_id,role,is_active").eq("workspace_id", workspaceId).eq("user_id", userId).eq("is_active", true).maybeSingle(),
    db.from("technician_presence").select("status,current_appointment_id,current_location,clocked_in_at,break_started_at").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle(),
    db.from("technician_presence").select("user_id,clocked_in_at,status").eq("workspace_id", workspaceId).eq("user_id", userId).not("clocked_in_at", "is", null).limit(1),
    db.from("appointments")
      .select("id,starts_at,ends_at,status,notes,metadata,customers(first_name,last_name,company_name,phone),vehicles(year,make,model,color,license_plate)")
      .eq("workspace_id", workspaceId)
      .eq("assigned_user_id", userId)
      .not("status", "in", '("completed","cancelled","no_show")')
      .order("starts_at"),
  ]);
  if (memberError) throw memberError;
  if (presenceError) throw presenceError;
  if (clockError) throw clockError;
  if (jobsError) throw jobsError;
  return json({ data: { member: member ?? null, presence: presence ?? null, clock_entries: clockEntries ?? [], jobs: jobs ?? [] } });
});

// GET /v1/dispatch/mobile-state — member + presence + today's clock entries + open jobs.
appointmentsRouter.get("/v1/dispatch/mobile-state", async (c: Context) => {
  const { supabase, user, workspaceId } = await requireCallerWorkspace(c, selectedWorkspaceHint(new URL(c.req.url)));
  const userId = new URL(c.req.url).searchParams.get("user_id") ?? "";
  if (userId !== user.id) throw new ApiError(403, "user_id must match the caller.", "forbidden");
  const db = supabase as any;
  const today = new Date().toISOString().split("T")[0];
  const [{ data: member, error: memberError }, { data: presence, error: presenceError }, { data: clockEntries, error: clockError }, { data: jobs, error: jobsError }] = await Promise.all([
    db.from("workspace_members").select("user_id,role,is_active").eq("workspace_id", workspaceId).eq("user_id", userId).eq("is_active", true).maybeSingle(),
    db.from("technician_presence").select("*").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle(),
    db.from("technician_clock_entries").select("*").eq("workspace_id", workspaceId).eq("user_id", userId).gte("clock_in", `${today}T00:00:00`).order("clock_in", { ascending: false }).limit(10),
    db.from("appointments").select("id,starts_at,ends_at,status,assigned_user_id,vehicle_id,customer_id,priority,metadata,location_address,location_lat,location_lng,customers(id,first_name,last_name,phone,email),vehicles(id,year,make,model,license_plate)").eq("workspace_id", workspaceId).eq("assigned_user_id", userId).not("status", "in", '("completed","cancelled","no_show")').order("starts_at", { ascending: true }).limit(50),
  ]);
  if (memberError) throw memberError;
  if (presenceError) throw presenceError;
  if (clockError) throw clockError;
  if (jobsError) throw jobsError;
  return json({ data: { member: member ?? null, presence: presence ?? null, clockEntries: clockEntries ?? [], jobs: jobs ?? [] } });
});

// POST /v1/dispatch/technician-location — update live location + presence via RPC.
appointmentsRouter.post("/v1/dispatch/technician-location", async (c: Context) => {
  const { latitude, longitude, location } = z.object({
    latitude: z.number().finite(),
    longitude: z.number().finite(),
    location: z.record(z.string(), z.unknown()).optional(),
  }).parse(await c.req.json());
  const { supabase, user, workspaceId } = await requireCallerWorkspace(c, undefined);
  const db = supabase as any;
  const { data: presence, error: presenceError } = await db
    .from("technician_presence")
    .select("status,current_appointment_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (presenceError) throw presenceError;
  const { error } = await db.rpc("set_technician_presence_v1", {
    p_workspace_id: workspaceId,
    p_status: presence?.status ?? "available",
    p_appointment_id: presence?.current_appointment_id ?? null,
    p_location: { lat: latitude, lng: longitude, timestamp: new Date().toISOString(), ...(location ?? {}) },
  });
  if (error) throw error;
  return json({ data: { ok: true } });
});

// POST /v1/dispatch/technician-status — technician self status update via RPC.
appointmentsRouter.post("/v1/dispatch/technician-status", async (c: Context) => {
  const { technician_id, new_status, appointment_id, location } = z.object({
    technician_id: z.string().uuid(),
    new_status: z.string().min(1).max(40),
    appointment_id: z.string().uuid().nullable().optional(),
    location: z.object({ lat: z.number().finite(), lng: z.number().finite() }).nullable().optional(),
  }).parse(await c.req.json());
  const { supabase, user, workspaceId } = await requireCallerWorkspace(c, undefined);
  if (technician_id !== user.id) throw new ApiError(403, "You can only update your own status.", "forbidden");
  const db = supabase as any;
  const { error } = await db.rpc("set_technician_presence_v1", {
    p_workspace_id: workspaceId,
    p_status: new_status,
    p_appointment_id: appointment_id ?? null,
    p_location: location ?? null,
  });
  if (error) throw error;
  return json({ data: { ok: true } });
});

// POST /v1/dispatch/clock — clock in/out + break transitions via RPC.
appointmentsRouter.post("/v1/dispatch/clock", async (c: Context) => {
  const { action, latitude, longitude } = z.object({
    action: z.enum(["clock_in", "clock_out", "start_break", "end_break"]),
    latitude: z.number().finite().nullable().optional(),
    longitude: z.number().finite().nullable().optional(),
  }).parse(await c.req.json());
  const { supabase, user, workspaceId } = await requireCallerWorkspace(c, undefined);
  const db = supabase as any;
  const location = latitude != null && longitude != null ? { lat: latitude, lng: longitude } : null;
  const { error } = await db.rpc("clock_technician_v1", {
    p_workspace_id: workspaceId,
    p_technician_id: user.id,
    p_action: action,
    p_location: location,
  });
  if (error) throw error;
  return json({ data: { ok: true } });
});

// GET /v1/dispatch/technician-daily-load — today's jobs for a technician.
appointmentsRouter.get("/v1/dispatch/technician-daily-load", async (c: Context) => {
  const { supabase, workspaceId } = await requireCallerWorkspace(c, selectedWorkspaceHint(new URL(c.req.url)));
  const url = new URL(c.req.url);
  const technicianId = url.searchParams.get("technician_id") ?? "";
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(url.searchParams.get("date") ?? "");
  const { data, error } = await (supabase as any)
    .from("appointments")
    .select("id,starts_at,ends_at,status,metadata")
    .eq("workspace_id", workspaceId)
    .eq("assigned_user_id", technicianId)
    .gte("starts_at", `${date}T00:00:00`)
    .lt("starts_at", `${date}T23:59:59.999`)
    .order("starts_at", { ascending: true });
  if (error) throw error;
  return json({ data: data ?? [] });
});

// ---------------------------------------------------------------------------
// Dispatch runs: CRUD, stops, and server-side route optimization.
// ---------------------------------------------------------------------------

const DISPATCH_RUN_STATUSES = ["draft", "active", "completed", "cancelled"] as const;
const ROUTE_STOP_STATUSES = ["pending", "arrived", "in_progress", "completed", "skipped"] as const;

async function requireDispatchRun(supabase: any, workspaceId: string, runId: string) {
  const { data, error } = await (supabase as any)
    .from("dispatch_runs")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", runId)
    .single();
  if (error || !data) throw error ?? new ApiError(404, "Dispatch run not found.", "not_found");
  return data;
}

// POST /v1/dispatch-runs — create a dispatch run.
appointmentsRouter.post("/v1/dispatch-runs", async (c: Context) => {
  const { user_id, technician_id, van_id, run_date, start_location } = z.object({
    user_id: z.string().uuid(),
    technician_id: z.string().uuid(),
    van_id: z.string().uuid().nullable().optional(),
    run_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    start_location: z.object({ lat: z.number().finite(), lng: z.number().finite() }).nullable().optional(),
  }).parse(await c.req.json());
  const { supabase, user, workspaceId } = await requireStaffWorkspace(c, undefined);
  if (user_id !== user.id) throw new ApiError(403, "user_id must match the caller.", "forbidden");
  const db = supabase as any;
  const { data, error } = await db
    .from("dispatch_runs")
    .insert({
      workspace_id: workspaceId,
      technician_id,
      van_id: van_id ?? null,
      run_date,
      status: "draft",
      start_location: start_location ?? null,
      created_by: user_id,
    })
    .select("id,status")
    .single();
  if (error || !data) throw error ?? new Error("Failed to create dispatch run.");
  return json({ data: { id: (data as { id: string }).id, status: (data as { status: string }).status } });
});

// POST /v1/dispatch-runs/:id/stops — add a stop to a run.
appointmentsRouter.post("/v1/dispatch-runs/:id/stops", async (c: Context) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const { work_order_id, sequence_order, estimated_duration_minutes } = z.object({
    work_order_id: z.string().uuid(),
    sequence_order: z.number().int().min(0),
    estimated_duration_minutes: z.number().int().min(1).nullable().optional(),
  }).parse(await c.req.json());
  const { supabase, workspaceId } = await requireStaffWorkspace(c, undefined);
  await requireDispatchRun(supabase, workspaceId, id);
  const { data, error } = await (supabase as any)
    .from("route_stops")
    .insert({
      dispatch_run_id: id,
      work_order_id,
      sequence_order,
      status: "pending",
      estimated_duration_minutes: estimated_duration_minutes ?? null,
    })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("Failed to add stop.");
  return json({ data: { id: (data as { id: string }).id } });
});

// PATCH /v1/dispatch-runs/:id — update run status.
appointmentsRouter.patch("/v1/dispatch-runs/:id", async (c: Context) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const { status } = z.object({ status: z.enum(DISPATCH_RUN_STATUSES) }).parse(await c.req.json());
  const { supabase, workspaceId } = await requireStaffWorkspace(c, undefined);
  await requireDispatchRun(supabase, workspaceId, id);
  const { error } = await (supabase as any)
    .from("dispatch_runs")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("id", id);
  if (error) throw error;
  return json({ data: { id, status } });
});

// PATCH /v1/dispatch-runs/route-stops/:id — update a stop's status with arrival/departure stamps.
appointmentsRouter.patch("/v1/dispatch-runs/route-stops/:id", async (c: Context) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const { status } = z.object({ status: z.enum(ROUTE_STOP_STATUSES) }).parse(await c.req.json());
  const { supabase, workspaceId } = await requireStaffWorkspace(c, undefined);
  const db = supabase as any;
  const { data: stop, error: stopError } = await db
    .from("route_stops")
    .select("id,dispatch_run_id,dispatch_runs!inner(workspace_id)")
    .eq("id", id)
    .eq("dispatch_runs.workspace_id", workspaceId)
    .maybeSingle();
  if (stopError) throw stopError;
  if (!stop) throw new ApiError(404, "Route stop not found.", "not_found");
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { status, updated_at: now };
  if (status === "arrived") updates.arrival_time = now;
  if (status === "completed" || status === "skipped") updates.departure_time = now;
  const { error } = await db.from("route_stops").update(updates).eq("id", id);
  if (error) throw error;
  return json({ data: { id, status } });
});

// GET /v1/dispatch-runs — runs for a staff user on a date, with technician/van names + stop counts.
appointmentsRouter.get("/v1/dispatch-runs", async (c: Context) => {
  const { supabase, workspaceId } = await requireStaffWorkspace(c, selectedWorkspaceHint(new URL(c.req.url)));
  const url = new URL(c.req.url);
  const userId = url.searchParams.get("user_id") ?? "";
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(url.searchParams.get("date") ?? "");
  const db = supabase as any;
  const { data: runs, error: runsError } = await db
    .from("dispatch_runs")
    .select("id,technician_id,van_id,run_date,status,total_distance_meters,total_travel_time_seconds,technicians!inner(name),vans(name)")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("run_date", date)
    .order("created_at", { ascending: true });
  if (runsError) throw runsError;
  const runRows = (runs ?? []) as Array<{ id: string }>;
  const runIds = runRows.map((r) => r.id);
  const stopCounts = new Map<string, number>();
  if (runIds.length > 0) {
    const { data: stops } = await db.from("route_stops").select("dispatch_run_id").in("dispatch_run_id", runIds);
    for (const s of (stops ?? []) as Array<{ dispatch_run_id: string }>) {
      stopCounts.set(s.dispatch_run_id, (stopCounts.get(s.dispatch_run_id) ?? 0) + 1);
    }
  }
  return json({
    data: runRows.map((run) => ({ ...run, stop_count: stopCounts.get(run.id) ?? 0 })),
  });
});

// GET /v1/dispatch-runs/:id/stops — enriched stops for a run.
appointmentsRouter.get("/v1/dispatch-runs/:id/stops", async (c: Context) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const { supabase, workspaceId } = await requireStaffWorkspace(c, selectedWorkspaceHint(new URL(c.req.url)));
  await requireDispatchRun(supabase, workspaceId, id);
  const db = supabase as any;
  const { data: stops, error: stopsError } = await db
    .from("route_stops")
    .select("id,sequence_order,status,work_order_id,estimated_arrival,estimated_duration_minutes,actual_arrival,actual_departure,distance_to_next_meters,travel_time_to_next_seconds,work_orders!inner(order_number,location_address,location_lat,location_lng,customers(name))")
    .eq("dispatch_run_id", id)
    .order("sequence_order", { ascending: true });
  if (stopsError) throw stopsError;
  return json({ data: stops ?? [] });
});

function haversineMetersServer(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function serverDrivingRoute(supabase: any, origin: { lat: number; lng: number }, destination: { lat: number; lng: number }) {
  const { data, error } = await (supabase as any).functions.invoke("location-service", {
    body: {
      action: "get_route_preview",
      origin: { latitude: origin.lat, longitude: origin.lng },
      destination: { latitude: destination.lat, longitude: destination.lng },
      profile: "driving-traffic",
      alternatives: false,
    },
  });
  if (error) throw error;
  const route = (data as { routes?: Array<{ distanceMeters: number; durationSeconds: number; geometry: unknown; legs?: Array<{ distance?: number; duration?: number }> }> } | null)?.routes?.[0];
  if (!route) return { distanceMeters: 0, durationSeconds: 0, geometry: null, legs: [] };
  return {
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    geometry: route.geometry,
    legs: (route.legs ?? []).map((leg) => ({ distanceMeters: leg.distance ?? 0, durationSeconds: leg.duration ?? 0 })),
  };
}

// POST /v1/dispatch-runs/:id/optimize — compute driving distance/time for each
// segment along the current sequence order (no reordering), update per-stop
// distance/time fields and run totals, mirroring the legacy client behavior.
appointmentsRouter.post("/v1/dispatch-runs/:id/optimize", async (c: Context) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const { supabase, workspaceId } = await requireStaffWorkspace(c, undefined);
  const db = supabase as any;
  const run = (await requireDispatchRun(supabase, workspaceId, id)) as {
    start_location_lat: number | null;
    start_location_lng: number | null;
  };

  const { data: stops, error: stopsError } = await db
    .from("route_stops")
    .select("id,sequence_order,work_order_id")
    .eq("dispatch_run_id", id)
    .order("sequence_order", { ascending: true });
  if (stopsError) throw stopsError;
  const stopRows = ((stops ?? []) as Array<{ id: string; sequence_order: number; work_order_id: string }>);
  if (stopRows.length === 0) return json({ data: { totalDistanceMeters: 0, totalTravelTimeSeconds: 0 } });

  const workOrderIds = [...new Set(stopRows.map((s) => s.work_order_id))];
  const { data: workOrders } = await db
    .from("work_orders")
    .select("id,location_lat,location_lng")
    .in("id", workOrderIds);
  const woLocation = new Map<string, { lat: number; lng: number }>();
  for (const wo of (workOrders ?? []) as Array<{ id: string; location_lat: unknown; location_lng: unknown }>) {
    const lat = Number(wo.location_lat);
    const lng = Number(wo.location_lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) woLocation.set(wo.id, { lat, lng });
  }

  // Ordered points: start location (if set) then each stop with a known location.
  const points: Array<{ lat: number; lng: number; stopId: string | null }> = [];
  const startLat = Number(run.start_location_lat);
  const startLng = Number(run.start_location_lng);
  if (Number.isFinite(startLat) && Number.isFinite(startLng)) points.push({ lat: startLat, lng: startLng, stopId: null });
  for (const stop of stopRows) {
    const loc = woLocation.get(stop.work_order_id);
    if (loc) points.push({ lat: loc.lat, lng: loc.lng, stopId: stop.id });
  }

  let totalDistanceMeters = 0;
  let totalTravelTimeSeconds = 0;
  for (let i = 0; i < points.length - 1; i++) {
    try {
      let distanceMeters: number;
      let durationSeconds: number;
      try {
        const route = await serverDrivingRoute(supabase, points[i], points[i + 1]);
        distanceMeters = route.distanceMeters;
        durationSeconds = route.durationSeconds;
      } catch {
        distanceMeters = Math.round(haversineMetersServer(points[i], points[i + 1]));
        durationSeconds = Math.round(distanceMeters / 13.4);
      }
      const isLast = i === points.length - 2;
      const arrivalStopId = points[i + 1].stopId;
      if (arrivalStopId) {
        const { error: stopUpdateError } = await db
          .from("route_stops")
          .update({
            distance_to_next_meters: isLast ? null : Math.round(distanceMeters),
            travel_time_to_next_seconds: isLast ? null : Math.round(durationSeconds),
          })
          .eq("id", arrivalStopId);
        if (stopUpdateError) throw stopUpdateError;
      }
      totalDistanceMeters += distanceMeters;
      totalTravelTimeSeconds += durationSeconds;
    } catch (err) {
      console.warn(`[optimize] segment ${i} failed`, err);
    }
  }

  const { error: runUpdateError } = await db
    .from("dispatch_runs")
    .update({
      total_distance_meters: Math.round(totalDistanceMeters),
      total_travel_time_seconds: Math.round(totalTravelTimeSeconds),
    })
    .eq("id", id);
  if (runUpdateError) throw runUpdateError;

  return json({
    data: {
      totalDistanceMeters: Math.round(totalDistanceMeters),
      totalTravelTimeSeconds: Math.round(totalTravelTimeSeconds),
    },
  });
});
