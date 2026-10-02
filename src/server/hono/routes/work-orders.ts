/**
 * WORK-ORDERS domain router (Phase 1 Hono migration).
 *
 * Migrated from:
 * - app/api/v1/work-orders/route.ts (GET, POST)
 * - app/api/v1/work-orders/[id]/route.ts (GET, PATCH)
 * - app/api/v1/work-orders/checklist/advance/route.ts (POST)
 * - app/api/v1/work-orders/checklist/items/[itemId]/route.ts (PATCH)
 * - app/api/v1/command-center/route.ts (GET)
 *
 * Paths are registered relative to `/api` (the app-level basePath); do not
 * include the `/api` prefix. Static checklist paths are registered before
 * `/v1/work-orders/:id` so they cannot be swallowed by the param route.
 */
import { Hono } from "hono";
import { z } from "zod";
import { ApiError, json, paginationSchema } from "@/server/api";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { requireAuth, requireWorkspaceAuth } from "@/server/hono/middleware/auth";

export const workOrdersRouter = new Hono();

const workOrderSchema = z.object({
  workspace_id: z.string().uuid(),
  appointment_id: z.string().uuid().nullable().optional(),
  customer_id: z.string().uuid(),
  vehicle_id: z.string().uuid().nullable().optional(),
  location_id: z.string().uuid().nullable().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  complaint: z.string().max(10000).optional(),
  diagnosis: z.string().max(10000).nullable().optional(),
  technician_notes: z.string().max(10000).nullable().optional(),
  location_address: z.string().max(500).nullable().optional(),
  location_lat: z.number().finite().nullable().optional(),
  location_lng: z.number().finite().nullable().optional(),
  technician_id: z.string().uuid().nullable().optional(),
  van_id: z.string().uuid().nullable().optional(),
  customer_notes: z.string().max(10000).nullable().optional(),
});

const patchSchema = z.object({
  workspace_id: z.string().uuid(),
  status: z.enum(["draft", "scheduled", "assigned", "in_progress", "waiting_for_parts", "awaiting_approval", "completed", "cancelled"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  complaint: z.string().max(10000).nullable().optional(),
  technician_notes: z.string().max(10000).nullable().optional(),
  tech_notes: z.string().max(10000).nullable().optional(),
  diagnosis: z.string().max(10000).nullable().optional(),
  technician_id: z.string().uuid().nullable().optional(),
  signature_url: z.string().max(200000).nullable().optional(),
  vin_captured: z.string().trim().max(32).nullable().optional(),
  mileage_captured: z.number().int().min(0).nullable().optional(),
  started_at: z.string().datetime().nullable().optional(),
  completed_at: z.string().datetime().nullable().optional(),
  updated_at: z.string().datetime().optional(),
});

const TECHNICIAN_FIELDS = new Set([
  "workspace_id",
  "status",
  "technician_notes",
  "tech_notes",
  "diagnosis",
  "signature_url",
  "vin_captured",
  "mileage_captured",
  "started_at",
  "completed_at",
  "updated_at",
]);

const TECHNICIAN_STATUSES = new Set(["in_progress", "waiting_for_parts", "awaiting_approval", "completed"]);

const checklistAdvanceSchema = z.object({
  workspace_id: z.string().uuid(),
  item_id: z.string().uuid(),
  evidence_url: z.string().url().max(2000).nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
});

const checklistItemSchema = z.object({
  workspace_id: z.string().uuid(),
  status: z.string().trim().max(40).optional(),
  evidence_url: z.string().url().max(2000).optional(),
  notes: z.string().max(10000).optional(),
  completed_by: z.string().uuid().optional(),
  completed_at: z.string().datetime().optional(),
}).refine((body) => Object.keys(body).some((key) => key !== "workspace_id"), { message: "At least one checklist field is required" });

const commandCenterQuerySchema = z.object({
  workspace_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

workOrdersRouter.get("/v1/work-orders", async (c) => {
  const url = new URL(c.req.url);
  const workspaceId = url.searchParams.get("workspace_id");
  if (!workspaceId) throw new Error("workspace_id is required");
  const { supabase } = await requireWorkspaceAuth(c, workspaceId, undefined);
  const { limit, offset } = paginationSchema.parse(Object.fromEntries(url.searchParams));
  const status = url.searchParams.get("status");
  const dateFrom = url.searchParams.get("date_from");
  const dateTo = url.searchParams.get("date_to");
  const technicianId = url.searchParams.get("technician_id");
  const assignmentStatuses = (url.searchParams.get("assignment_statuses") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);

  // The work-order board needs the joined customer/vehicle/appointment/assignment
  // rows the legacy query selected inline. A technician filter uses an inner
  // join so only orders with an active assignment to that technician return.
  const assignmentJoin = technicianId
    ? "work_order_assignments!inner(user_id,assigned_at,unassigned_at,profiles!work_order_assignments_user_id_fkey(display_name))"
    : "work_order_assignments(user_id,assigned_at,unassigned_at,profiles!work_order_assignments_user_id_fkey(display_name))";
  let query = supabase
    .from("work_orders")
    .select(`*,customers(*),vehicles(*),locations(*),appointments(id,starts_at,metadata),${assignmentJoin}`)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  if (dateFrom) query = query.gte("created_at", dateFrom);
  if (dateTo) query = query.lte("created_at", dateTo);
  if (technicianId) {
    query = query
      .eq("work_order_assignments.user_id", technicianId)
      .is("work_order_assignments.unassigned_at", null);
    if (assignmentStatuses.length > 0) query = query.in("status", assignmentStatuses);
  }
  query = query.range(offset, offset + limit - 1);
  const { data, error } = await query;
  if (error) throw error;
  return json({ data: data ?? [], pagination: { limit, offset } });
});

workOrdersRouter.post("/v1/work-orders", async (c) => {
  const body = workOrderSchema.parse(await c.req.json());
  const { supabase } = await requireWorkspaceAuth(c, body.workspace_id, ["owner", "admin", "manager", "service_advisor", "dispatcher", "technician"]);

  const metadata = {
    ...(body.location_address ? { location_address: body.location_address } : {}),
    ...(body.location_lat != null ? { location_lat: body.location_lat } : {}),
    ...(body.location_lng != null ? { location_lng: body.location_lng } : {}),
    ...(body.customer_notes ? { customer_notes: body.customer_notes } : {}),
    ...(body.van_id ? { legacy_van_id: body.van_id } : {}),
  };

  const { data, error } = await (supabase as any).rpc("create_work_order_v1", {
    p_workspace_id: body.workspace_id,
    p_payload: {
      appointment_id: body.appointment_id ?? null,
      customer_id: body.customer_id,
      vehicle_id: body.vehicle_id ?? null,
      location_id: body.location_id ?? null,
      priority: body.priority,
      complaint: body.complaint ?? null,
      diagnosis: body.diagnosis ?? null,
      technician_notes: body.technician_notes ?? null,
      technician_id: body.technician_id ?? null,
      metadata,
    },
  });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id || row.number == null) throw new Error("Work order creation returned no identifier.");
  return json({ data: row }, { status: 201 });
});

// Static checklist routes registered before /v1/work-orders/:id so the param
// route cannot swallow them.
workOrdersRouter.post("/v1/work-orders/checklist/advance", async (c) => {
  const body = checklistAdvanceSchema.parse(await c.req.json());
  await requireWorkspaceAuth(c, body.workspace_id, ["owner", "admin", "manager", "service_advisor", "dispatcher", "technician"]);
  return json({
    error: {
      code: "checklist_not_configured",
      message: "Work-order checklist workflow has not been rebuilt on Final yet.",
    },
  }, { status: 501 });
});

workOrdersRouter.patch("/v1/work-orders/checklist/items/:itemId", async (c) => {
  const body = checklistItemSchema.parse(await c.req.json());
  const itemId = z.string().uuid().parse(c.req.param("itemId"));
  const { supabase } = await requireWorkspaceAuth(c, body.workspace_id, ["owner", "admin", "manager", "service_advisor", "dispatcher", "technician", "fleet_manager"]);
  const { data: item, error: itemError } = await supabase.from("work_order_checklist_items").select("id, work_order_id, work_orders!inner(workspace_id)").eq("id", itemId).eq("work_orders.workspace_id", body.workspace_id).single();
  if (itemError || !item) throw itemError ?? new Error("Checklist item was not found in this workspace.");
  const { workspace_id, ...patch } = body;
  const { data, error } = await supabase.from("work_order_checklist_items").update(patch).eq("id", itemId).select().single();
  if (error) throw error;
  return json({ data });
});

workOrdersRouter.get("/v1/work-orders/:id", async (c) => {
  const id = c.req.param("id");
  const workspaceId = new URL(c.req.url).searchParams.get("workspace_id");
  if (!workspaceId) throw new Error("workspace_id is required");
  const { supabase } = await requireWorkspaceAuth(c, workspaceId, undefined);
  const { data, error } = await supabase
    .from("work_orders")
    .select("*,customers(*),vehicles(*),locations(*),appointments(id,starts_at,metadata),work_order_items(*),work_order_assignments(user_id,assigned_at,unassigned_at,profiles!work_order_assignments_user_id_fkey(display_name)),work_order_events(*)")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .single();
  if (error) throw error;
  return json({ data });
});

workOrdersRouter.patch("/v1/work-orders/:id", async (c) => {
  const id = c.req.param("id");
  const body = patchSchema.parse(await c.req.json());
  const { supabase, user, membership } = await requireWorkspaceAuth(
    c,
    body.workspace_id,
    ["owner", "admin", "manager", "service_advisor", "dispatcher", "technician"],
  );

  if (membership.role === "technician") {
    const requestedFields = Object.keys(body);
    const forbiddenField = requestedFields.find((field) => !TECHNICIAN_FIELDS.has(field));
    if (forbiddenField) {
      throw new ApiError(403, `Technicians cannot change ${forbiddenField}`, "technician_field_forbidden");
    }
    if (body.status && !TECHNICIAN_STATUSES.has(body.status)) {
      throw new ApiError(403, "Technicians cannot set this work order status", "technician_status_forbidden");
    }

    const { data: assignment, error: assignmentError } = await supabase
      .from("work_order_assignments")
      .select("work_order_id")
      .eq("workspace_id", body.workspace_id)
      .eq("work_order_id", id)
      .eq("user_id", user.id)
      .is("unassigned_at", null)
      .maybeSingle();
    if (assignmentError) throw assignmentError;
    if (!assignment) {
      throw new ApiError(403, "Technicians may only update work orders actively assigned to them", "technician_assignment_required");
    }
  }

  const { workspace_id, updated_at: _ignoredOptimisticHint, ...patch } = body;

  const { error } = await (supabase as any).rpc("patch_work_order_v1", {
    p_workspace_id: workspace_id,
    p_work_order_id: id,
    p_patch: patch,
  });
  if (error) throw error;

  const { data, error: readError } = await supabase
    .from("work_orders")
    .select("*")
    .eq("workspace_id", workspace_id)
    .eq("id", id)
    .single();
  if (readError) throw readError;
  return json({ data });
});

workOrdersRouter.get("/v1/command-center", async (c) => {
  const url = new URL(c.req.url);
  const input = commandCenterQuerySchema.parse({
    workspace_id: url.searchParams.get("workspace_id"),
    date: url.searchParams.get("date"),
  });
  const { supabase } = await requireWorkspaceAuth(c, input.workspace_id, ["owner","admin","manager","service_advisor","receptionist","dispatcher","viewer"]);
  const { data: workspace, error: workspaceError } = await supabase.from("workspaces").select("timezone").eq("id", input.workspace_id).single();
  if (workspaceError) throw workspaceError;
  const timezone = workspace?.timezone || "UTC";
  const start = new Date(`${input.date}T00:00:00`);
  const end = new Date(`${input.date}T23:59:59.999`);
  const [appointments, workOrders, members] = await Promise.all([
    supabase.from("appointments")
      .select("id,status,starts_at,ends_at,assigned_user_id,updated_at,metadata,customers(first_name,last_name,company_name,phone,address_line1,address_line2,city,region,postal_code),vehicles(year,make,model),locations(address_line1,address_line2,city,region,postal_code,latitude,longitude)")
      .eq("workspace_id", input.workspace_id).gte("starts_at", start.toISOString()).lte("starts_at", end.toISOString()).order("starts_at"),
    supabase.from("work_orders")
      .select("id,number,status,priority,opened_at,created_at,updated_at,technician_notes,metadata,customers(first_name,last_name,company_name,phone,address_line1,address_line2,city,region,postal_code),vehicles(year,make,model),locations(address_line1,address_line2,city,region,postal_code,latitude,longitude),work_order_assignments(user_id,assigned_at,unassigned_at)")
      .eq("workspace_id", input.workspace_id).is("appointment_id", null).gte("created_at", start.toISOString()).lte("created_at", end.toISOString()).order("created_at"),
    supabase.from("workspace_members")
      .select("user_id,role,is_active,profiles!workspace_members_user_id_fkey(display_name)")
      .eq("workspace_id", input.workspace_id).eq("is_active", true),
  ]);
  const error = appointments.error || workOrders.error || members.error;
  if (error) throw error;
  const technicians = (members.data || []).filter((m:any)=>m.role==="technician").map((m:any)=>({
    id:m.user_id,name:m.profiles?.display_name || "Technician",status:"active",current_location:null,
  }));
  return json({ data: { timezone, appointments: appointments.data || [], work_orders: workOrders.data || [], members: members.data || [], technicians } });
});

// ===========================================================================
// Phase 2 — WORK-ORDERS domain (field operations) endpoints.
// Migrated from src/application/commands/*.command.ts and
// src/application/queries/*.query.ts onto the sanctioned client data path.
// All endpoints return raw rows; presentation mapping stays in the
// application layer. Static paths are registered before `:id` param routes.
// ===========================================================================

const ASSET_BUCKET = "assets";

// ---------------------------------------------------------------------------
// Assets — GET /v1/assets (list), GET /v1/assets/signed-url, GET /v1/assets/:id
//
// The canonical `assets` table is user-scoped (user_id) with soft deletes
// (status/deleted_at); there is no workspace_id column. All reads filter on
// the authenticated user and exclude deleted rows.
// ---------------------------------------------------------------------------

const assetListSchema = z.object({
  search: z.string().optional(),
  asset_type: z.string().optional(),
  sort: z.enum(["newest", "oldest", "name", "size"]).default("newest"),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  folder: z.string().optional(),
  folder_null: z.enum(["true", "false"]).optional(),
});

workOrdersRouter.get("/v1/assets/signed-url", async (c) => {
  const { supabase } = await requireAuth(c);
  const params = new URL(c.req.url).searchParams;
  const storagePath = params.get("storage_path") || "";
  if (!storagePath) throw new ApiError(400, "storage_path is required", "storage_path_required");
  const expiresIn = Math.min(Math.max(Number(params.get("expires_in") ?? 3600) || 3600, 1), 604800);
  const { data, error } = await supabase.storage.from(ASSET_BUCKET).createSignedUrl(storagePath, expiresIn);
  if (error) throw error;
  return json({ data: { signed_url: data?.signedUrl ?? null } });
});

workOrdersRouter.get("/v1/assets", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const input = assetListSchema.parse(Object.fromEntries(new URL(c.req.url).searchParams));
  let query = (supabase.from("assets") as any)
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .is("deleted_at", null);
  if (input.folder_null === "true") query = query.is("folder", null);
  else if (input.folder !== undefined) query = query.eq("folder", input.folder);
  if (input.asset_type) query = query.eq("asset_type", input.asset_type);
  if (input.search) query = query.ilike("original_filename", `%${input.search}%`);
  switch (input.sort) {
    case "oldest":
      query = query.order("created_at", { ascending: true });
      break;
    case "name":
      query = query.order("original_filename", { ascending: true });
      break;
    case "size":
      query = query.order("file_size", { ascending: false });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }
  query = query.range(input.offset, input.offset + input.limit - 1);
  const { data, error, count } = await query;
  if (error) throw error;
  return json({ data: { items: data ?? [], total: count ?? 0 } });
});

workOrdersRouter.get("/v1/assets/:id", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await (supabase.from("assets") as any)
    .select("*").eq("id", c.req.param("id")).eq("user_id", user.id).is("deleted_at", null).maybeSingle();
  if (error) throw error;
  return json({ data: data ?? null });
});

workOrdersRouter.post("/v1/assets/upload", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const form = await c.req.raw.formData();
  const file = form.get("file");
  const field = (key: string): string | null => {
    const value = form.get(key);
    return typeof value === "string" && value.trim() ? value : null;
  };
  const storagePath = field("storage_path");
  if (!(file instanceof File)) throw new ApiError(400, "A file upload is required", "file_required");
  if (!storagePath) throw new ApiError(400, "storage_path is required", "storage_path_required");
  const { error: uploadError } = await supabase.storage.from(ASSET_BUCKET).upload(storagePath, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (uploadError) throw uploadError;
  const { data, error } = await (supabase.from("assets") as any).insert({
    user_id: user.id,
    storage_path: storagePath,
    bucket: ASSET_BUCKET,
    original_filename: field("original_filename") ?? file.name,
    mime_type: field("mime_type") ?? (file.type || null),
    file_size: field("file_size") != null ? Number(field("file_size")) : file.size,
    asset_type: field("asset_type") ?? "other",
    width: field("width") != null ? Number(field("width")) : null,
    height: field("height") != null ? Number(field("height")) : null,
    duration_seconds: field("duration_seconds") != null ? Number(field("duration_seconds")) : null,
    status: "ready",
  }).select("*").single();
  if (error) {
    await supabase.storage.from(ASSET_BUCKET).remove([storagePath]);
    throw error;
  }
  return json({ data }, { status: 201 });
});

workOrdersRouter.patch("/v1/assets/:id", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const body = z.object({ original_filename: z.string().min(1).max(255) })
    .parse(await c.req.json());
  const { data, error } = await (supabase.from("assets") as any)
    .update({ original_filename: body.original_filename, updated_at: new Date().toISOString() })
    .eq("id", c.req.param("id")).eq("user_id", user.id).is("deleted_at", null).select("*").single();
  if (error) throw error;
  return json({ data });
});

workOrdersRouter.delete("/v1/assets/:id", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data: row, error: rowError } = await (supabase.from("assets") as any)
    .select("storage_path").eq("id", c.req.param("id")).eq("user_id", user.id).is("deleted_at", null).single();
  if (rowError) throw rowError;
  if (row?.storage_path) {
    await supabase.storage.from(ASSET_BUCKET).remove([row.storage_path]);
  }
  const { error } = await (supabase.from("assets") as any)
    .update({ status: "deleted", deleted_at: new Date().toISOString() })
    .eq("id", c.req.param("id")).eq("user_id", user.id);
  if (error) throw error;
  return json({ data: { ok: true } });
});

workOrdersRouter.post("/v1/assets/bulk-delete", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const body = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) })
    .parse(await c.req.json());
  const { data: rows, error: rowsError } = await (supabase.from("assets") as any)
    .select("id,storage_path").eq("user_id", user.id).is("deleted_at", null).in("id", body.ids);
  if (rowsError) throw rowsError;
  const paths = (rows ?? []).map((r: any) => r.storage_path).filter(Boolean);
  if (paths.length > 0) await supabase.storage.from(ASSET_BUCKET).remove(paths);
  const { error } = await (supabase.from("assets") as any)
    .update({ status: "deleted", deleted_at: new Date().toISOString() })
    .eq("user_id", user.id).in("id", body.ids);
  if (error) throw error;
  return json({ data: { succeeded: body.ids, failed: [] } });
});

workOrdersRouter.patch("/v1/assets/bulk-move", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const body = z.object({
    ids: z.array(z.string().uuid()).min(1).max(500),
    folder: z.string().nullable(),
  }).parse(await c.req.json());
  const { error } = await (supabase.from("assets") as any)
    .update({ folder: body.folder, updated_at: new Date().toISOString() })
    .eq("user_id", user.id).is("deleted_at", null).in("id", body.ids);
  if (error) throw error;
  return json({ data: { succeeded: body.ids, failed: [] } });
});

workOrdersRouter.post("/v1/assets/attach", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const body = z.object({
    service_id: z.string().min(1),
    asset_ids: z.array(z.string().uuid()).min(1).max(500),
  }).parse(await c.req.json());
  const rows = body.asset_ids.map((asset_id) => ({
    service_id: body.service_id,
    asset_id,
    user_id: user.id,
  }));
  const { error } = await (supabase.from("service_assets") as any)
    .upsert(rows, { onConflict: "service_id,asset_id", ignoreDuplicates: true });
  if (error) throw error;
  return json({ data: { succeeded: body.asset_ids, failed: [] } }, { status: 201 });
});

workOrdersRouter.delete("/v1/assets/attach", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const body = z.object({
    service_id: z.string().min(1),
    asset_id: z.string().uuid(),
  }).parse(await c.req.json());
  const { error } = await (supabase.from("service_assets") as any).delete()
    .eq("service_id", body.service_id).eq("asset_id", body.asset_id).eq("user_id", user.id);
  if (error) throw error;
  return json({ data: { ok: true } });
});

// ---------------------------------------------------------------------------
// Job threads — POST /v1/job-threads/*, GET /v1/job-threads/:id/timeline
// ---------------------------------------------------------------------------

const ensureThreadSchema = z.object({
  job_id: z.string().min(1),
  job_source: z.string().min(1),
});

workOrdersRouter.post("/v1/job-threads/ensure", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const body = ensureThreadSchema.parse(await c.req.json());
  const { data: threadId, error } = await (supabase.rpc as any)("ensure_job_thread", {
    p_job_id: body.job_id,
    p_job_source: body.job_source,
    p_created_by: user.id,
  });
  if (error) throw error;
  return json({ data: { thread_id: threadId } });
});

workOrdersRouter.get("/v1/job-threads/timeline", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const params = new URL(c.req.url).searchParams;
  const jobId = z.string().min(1).parse(params.get("job_id") ?? "");
  const jobSource = z.string().min(1).parse(params.get("job_source") ?? "");
  const { data: threadId, error: ensureError } = await (supabase.rpc as any)("ensure_job_thread", {
    p_job_id: jobId,
    p_job_source: jobSource,
    p_created_by: user.id,
  });
  if (ensureError) throw ensureError;
  const [messagesRes, eventsRes, exceptionsRes] = await Promise.all([
    (supabase.from("job_thread_messages") as any)
      .select("id, thread_id, sender_id, sender_role, content, attachments, channel, recipient, created_at, job_message_deliveries(status, last_error, delivered_at)")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true }),
    (supabase.from("job_thread_events") as any)
      .select("id, thread_id, event_type, metadata, created_at, created_by")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true }),
    (supabase.from("job_thread_exceptions") as any)
      .select("id, thread_id, exception_type, note, attachments, created_at, created_by")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true }),
  ]);
  const error = messagesRes.error || eventsRes.error || exceptionsRes.error;
  if (error) throw error;
  return json({
    data: {
      thread_id: threadId,
      messages: messagesRes.data ?? [],
      events: eventsRes.data ?? [],
      exceptions: exceptionsRes.data ?? [],
    },
  });
});

workOrdersRouter.post("/v1/job-threads/messages", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const body = z.object({
    job_id: z.string().min(1),
    job_source: z.string().min(1),
    content: z.string().min(1),
    channel: z.string().min(1).default("dispatch"),
    recipient: z.string().nullable().optional(),
    attachments: z.array(z.string()).default([]),
    client_message_id: z.string().nullable().optional(),
  }).parse(await c.req.json());
  const { data: threadId, error: ensureError } = await (supabase.rpc as any)("ensure_job_thread", {
    p_job_id: body.job_id,
    p_job_source: body.job_source,
    p_created_by: user.id,
  });
  if (ensureError) throw ensureError;
  const { data: messageId, error } = await (supabase.rpc as any)("send_job_thread_message_v2", {
    p_job_id: body.job_id,
    p_job_source: body.job_source,
    p_content: body.content,
    p_channel: body.channel,
    p_recipient: body.recipient ?? null,
    p_attachments: body.attachments ?? [],
    p_client_message_id: body.client_message_id ?? crypto.randomUUID(),
  });
  if (error) throw error;
  return json({ data: { message_id: messageId ?? null, thread_id: threadId } }, { status: 201 });
});

workOrdersRouter.post("/v1/job-threads/events", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const body = z.object({
    job_id: z.string().min(1),
    job_source: z.string().min(1),
    event_type: z.string().min(1).max(80),
    metadata: z.record(z.string(), z.unknown()).default({}),
  }).parse(await c.req.json());
  const { data: threadId, error: ensureError } = await (supabase.rpc as any)("ensure_job_thread", {
    p_job_id: body.job_id,
    p_job_source: body.job_source,
    p_created_by: user.id,
  });
  if (ensureError) throw ensureError;
  const { data, error } = await (supabase.from("job_thread_events") as any).insert({
    thread_id: threadId,
    event_type: body.event_type,
    metadata: body.metadata ?? {},
    created_by: user.id,
  }).select("id").single();
  if (error) throw error;
  return json({ data: { event_id: data.id, thread_id: threadId } }, { status: 201 });
});

workOrdersRouter.post("/v1/job-threads/exceptions", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const body = z.object({
    job_id: z.string().min(1),
    job_source: z.string().min(1),
    exception_type: z.string().min(1).max(80),
    note: z.string().nullable().optional(),
    attachments: z.array(z.string()).default([]),
  }).parse(await c.req.json());
  const { data: threadId, error: ensureError } = await (supabase.rpc as any)("ensure_job_thread", {
    p_job_id: body.job_id,
    p_job_source: body.job_source,
    p_created_by: user.id,
  });
  if (ensureError) throw ensureError;
  const { data, error } = await (supabase.from("job_thread_exceptions") as any).insert({
    thread_id: threadId,
    job_id: body.job_id,
    exception_type: body.exception_type,
    note: body.note ?? null,
    attachments: body.attachments ?? [],
    created_by: user.id,
  }).select("id").single();
  if (error) throw error;
  return json({ data: { exception_id: data.id, thread_id: threadId } }, { status: 201 });
});

workOrdersRouter.post("/v1/job-threads/:threadId/read", async (c) => {
  const { supabase } = await requireAuth(c);
  const { data, error } = await (supabase.rpc as any)("mark_job_thread_read_v1", {
    p_thread_id: c.req.param("threadId"),
  });
  if (error) throw error;
  return json({ data: data ?? null });
});

// ---------------------------------------------------------------------------
// Inventory — /v1/inventory/*
// ---------------------------------------------------------------------------

workOrdersRouter.get("/v1/inventory/overview", async (c) => {
  const { supabase } = await requireAuth(c);
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id") ?? "");
  const [itemsRes, locationsRes, stockRes, reservationsRes] = await Promise.all([
    (supabase.from("inventory_items") as any)
      .select("id,name,description,sku,unit,unit_cost,sell_price,category,low_stock_threshold,image_url,reorder_url,tire_size,tire_load_index,tire_speed_rating,tire_season,tire_position")
      .eq("workspace_id", workspaceId).eq("is_active", true).order("name"),
    (supabase.from("inventory_locations") as any)
      .select("id,name,location_type")
      .eq("workspace_id", workspaceId).eq("is_active", true).order("name"),
    (supabase.from("inventory_stock") as any)
      .select("inventory_item_id,location_id,quantity")
      .eq("workspace_id", workspaceId),
    (supabase.from("inventory_reservations") as any)
      .select("inventory_item_id,quantity,location_id,status")
      .eq("workspace_id", workspaceId).eq("status", "reserved"),
  ]);
  const error = itemsRes.error || locationsRes.error || stockRes.error || reservationsRes.error;
  if (error) throw error;
  return json({
    data: {
      items: itemsRes.data ?? [],
      locations: locationsRes.data ?? [],
      stock: stockRes.data ?? [],
      reservations: reservationsRes.data ?? [],
    },
  });
});

workOrdersRouter.get("/v1/inventory/oil-usage", async (c) => {
  const { supabase } = await requireAuth(c);
  const params = new URL(c.req.url).searchParams;
  const workspaceId = z.string().uuid().parse(params.get("workspace_id") ?? "");
  const fromISO = z.string().min(1).parse(params.get("from") ?? "");
  const toISO = z.string().min(1).parse(params.get("to") ?? "");
  const { data: serviceRecords, error: servicesError } = await (supabase.from("service_records") as any)
    .select("id,appointment_id,customer_id,vehicle_id,completed_at,oil_quarts_used,metadata")
    .eq("workspace_id", workspaceId).eq("status", "completed")
    .gt("oil_quarts_used", 0)
    .gte("completed_at", fromISO).lte("completed_at", toISO)
    .order("completed_at", { ascending: false }).limit(5000);
  if (servicesError) throw servicesError;
  const rows = serviceRecords ?? [];
  const customerIds = Array.from(new Set(rows.map((r: any) => r.customer_id).filter(Boolean)));
  const vehicleIds = Array.from(new Set(rows.map((r: any) => r.vehicle_id).filter(Boolean)));
  const appointmentIds = Array.from(new Set(rows.map((r: any) => r.appointment_id).filter(Boolean)));
  const serviceIds = rows.map((r: any) => r.id);
  const [customersRes, vehiclesRes, specsRes, appointmentsRes, movementsRes] = await Promise.all([
    customerIds.length > 0
      ? (supabase.from("customers") as any).select("id,first_name,last_name,company_name").eq("workspace_id", workspaceId).in("id", customerIds)
      : Promise.resolve({ data: [], error: null }),
    vehicleIds.length > 0
      ? (supabase.from("vehicles") as any).select("id,year,make,model").eq("workspace_id", workspaceId).in("id", vehicleIds)
      : Promise.resolve({ data: [], error: null }),
    vehicleIds.length > 0
      ? (supabase.from("vehicle_service_specs") as any).select("vehicle_id,oil_type").eq("workspace_id", workspaceId).in("vehicle_id", vehicleIds)
      : Promise.resolve({ data: [], error: null }),
    appointmentIds.length > 0
      ? (supabase.from("appointments") as any).select("id,metadata").eq("workspace_id", workspaceId).in("id", appointmentIds)
      : Promise.resolve({ data: [], error: null }),
    serviceIds.length > 0
      ? (supabase.from("inventory_movements") as any).select("service_record_id").eq("workspace_id", workspaceId).eq("movement_type", "consumption").in("service_record_id", serviceIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const error = customersRes.error || vehiclesRes.error || specsRes.error || appointmentsRes.error || movementsRes.error;
  if (error) throw error;
  return json({
    data: {
      service_records: rows,
      customers: customersRes.data ?? [],
      vehicles: vehiclesRes.data ?? [],
      vehicle_service_specs: specsRes.data ?? [],
      appointments: appointmentsRes.data ?? [],
      inventory_movements: movementsRes.data ?? [],
    },
  });
});

workOrdersRouter.post("/v1/inventory/images", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const form = await c.req.raw.formData();
  const file = form.get("file");
  const workspaceId = typeof form.get("workspace_id") === "string" ? (form.get("workspace_id") as string).trim() : "";
  if (!(file instanceof File)) throw new ApiError(400, "A file upload is required", "file_required");
  if (!workspaceId) throw new ApiError(400, "workspace_id is required", "workspace_id_required");
  if (!file.type.startsWith("image/")) throw new ApiError(400, "Please upload an image file", "invalid_image");
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const path = `inventory/${workspaceId}/${user.id}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from("service-images").upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (uploadError) throw uploadError;
  const { data } = supabase.storage.from("service-images").getPublicUrl(path);
  return json({ data: { public_url: data.publicUrl, path } }, { status: 201 });
});

const inventoryItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  sku: z.string().nullable().optional(),
  quantity: z.number().int().min(0).default(0),
  unit: z.string().nullable().optional(),
  unit_cost: z.number().nullable().optional(),
  sell_price: z.number().nullable().optional(),
  category: z.string().nullable().optional(),
  low_stock_threshold: z.number().int().nullable().optional(),
  image_url: z.string().nullable().optional(),
  reorder_url: z.string().nullable().optional(),
  tire_size: z.string().nullable().optional(),
  tire_load_index: z.string().nullable().optional(),
  tire_speed_rating: z.string().nullable().optional(),
  tire_season: z.string().nullable().optional(),
  tire_position: z.string().nullable().optional(),
});

workOrdersRouter.post("/v1/inventory/items", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const body = z.object({ workspace_id: z.string().uuid(), item: inventoryItemSchema })
    .parse(await c.req.json());
  const { quantity, ...itemFields } = body.item;
  const { data, error } = await (supabase.from("inventory_items") as any).insert({
    ...itemFields,
    quantity: 0,
    workspace_id: body.workspace_id,
    user_id: user.id,
    is_active: true,
  }).select("id").single();
  if (error) throw error;
  const { error: stockError } = await (supabase.rpc as any)("set_inventory_item_stock", {
    p_item_id: data.id,
    p_quantity: quantity,
    p_reason: "initial stock",
  });
  if (stockError) throw stockError;
  return json({ data: { id: data.id } }, { status: 201 });
});

workOrdersRouter.patch("/v1/inventory/items/:id", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({ workspace_id: z.string().uuid(), item: inventoryItemSchema })
    .parse(await c.req.json());
  const { quantity, ...itemFields } = body.item;
  const { error } = await (supabase.from("inventory_items") as any)
    .update(itemFields)
    .eq("id", c.req.param("id"))
    .eq("workspace_id", body.workspace_id)
    .eq("is_active", true);
  if (error) throw error;
  const { error: stockError } = await (supabase.rpc as any)("set_inventory_item_stock", {
    p_item_id: c.req.param("id"),
    p_quantity: quantity,
    p_reason: "inventory item edit",
  });
  if (stockError) throw stockError;
  return json({ data: { ok: true } });
});

workOrdersRouter.delete("/v1/inventory/items/:id", async (c) => {
  const { supabase } = await requireAuth(c);
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id") ?? "");
  const { data, error } = await (supabase.from("inventory_items") as any)
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", c.req.param("id")).eq("workspace_id", workspaceId).select().single();
  if (error) throw error;
  return json({ data });
});

workOrdersRouter.post("/v1/inventory/transfer", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({
    item_id: z.string().min(1),
    to_location_id: z.string().min(1),
    quantity: z.number().positive(),
    idempotency_key: z.string().nullable().optional(),
  }).parse(await c.req.json());
  const { error } = await (supabase.rpc as any)("transfer_inventory_stock", {
    p_item_id: body.item_id,
    p_to_location_id: body.to_location_id,
    p_quantity: body.quantity,
    p_idempotency_key: body.idempotency_key ?? `inventory-transfer-${crypto.randomUUID()}`,
  });
  if (error) throw error;
  return json({ data: { ok: true } });
});

workOrdersRouter.post("/v1/inventory/reconcile-oil", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({
    service_record_id: z.string().min(1),
    inventory_item_id: z.string().min(1),
    location_id: z.string().nullable().optional(),
  }).parse(await c.req.json());
  const { data, error } = await (supabase.rpc as any)("reconcile_service_oil_usage", {
    p_service_record_id: body.service_record_id,
    p_inventory_item_id: body.inventory_item_id,
    p_location_id: body.location_id ?? null,
  });
  if (error) throw error;
  return json({ data: { movement_id: data ?? null } });
});

workOrdersRouter.post("/v1/inventory/reservations/reserve", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({
    user_id: z.string().min(1),
    inventory_item_id: z.string().min(1),
    work_order_id: z.string().nullable().optional(),
    appointment_id: z.string().nullable().optional(),
    van_id: z.string().nullable().optional(),
    quantity: z.number().int().positive(),
    expires_in_hours: z.number().positive().default(4),
    notes: z.string().nullable().optional(),
  }).parse(await c.req.json());
  const { data: item, error: itemError } = await (supabase.from("inventory_items") as any)
    .select("quantity").eq("id", body.inventory_item_id).single();
  if (itemError || !item) throw new ApiError(404, `Item not found: ${body.inventory_item_id}`, "item_not_found");
  const { data: reservations, error: reservationsError } = await (supabase.from("inventory_reservations") as any)
    .select("quantity").eq("inventory_item_id", body.inventory_item_id).eq("status", "reserved");
  if (reservationsError) throw reservationsError;
  const totalStock = Number(item.quantity ?? 0);
  const totalReserved = (reservations ?? []).reduce((sum: number, r: any) => sum + Number(r.quantity ?? 0), 0);
  const available = totalStock - totalReserved;
  if (available < body.quantity) {
    throw new ApiError(409, `Insufficient stock: ${available} available, ${body.quantity} requested`, "insufficient_stock");
  }
  const expiresAt = new Date(Date.now() + body.expires_in_hours * 60 * 60 * 1000).toISOString();
  const { data: reservation, error: insertError } = await (supabase.from("inventory_reservations") as any).insert({
    user_id: body.user_id,
    inventory_item_id: body.inventory_item_id,
    work_order_id: body.work_order_id ?? null,
    appointment_id: body.appointment_id ?? null,
    van_id: body.van_id ?? null,
    quantity: body.quantity,
    expires_at: expiresAt,
    notes: body.notes ?? null,
  }).select("id").single();
  if (insertError) throw new ApiError(500, `Failed to reserve: ${insertError.message}`, "reserve_failed");
  return json({ data: { reservation_id: reservation.id, available_after: available - body.quantity } }, { status: 201 });
});

workOrdersRouter.get("/v1/inventory/reservations", async (c) => {
  const { supabase } = await requireAuth(c);
  const workOrderId = z.string().min(1).parse(new URL(c.req.url).searchParams.get("work_order_id") ?? "");
  const { data, error } = await (supabase.from("inventory_reservations") as any)
    .select("*, inventory_items(name, sku, unit_cost)")
    .eq("work_order_id", workOrderId).eq("status", "reserved").order("created_at", { ascending: true });
  if (error) throw error;
  return json({ data: data ?? [] });
});

// Fleet work-order rows for offline pull sync — GET /v1/fleet/work-orders.
// Distinct from /v1/fleet/dispatcher-work-orders, which returns appointments.
// Reads the fleet_work_orders table scoped to the caller
// (the table is user_id-scoped, not workspace-scoped).
workOrdersRouter.get("/v1/fleet/work-orders", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await (supabase.from("fleet_work_orders") as any)
    .select("id,order_number,status,priority,scheduled_date,service_type,po_number,total,fleet_vehicle_id,fleet_client_id,updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  return json({ data: data ?? [] });
});

workOrdersRouter.post("/v1/inventory/reservations/:id/consume", async (c) => {
  const { supabase } = await requireAuth(c);
  const reservationId = c.req.param("id");
  const { data: reservation, error: fetchError } = await (supabase.from("inventory_reservations") as any)
    .select("*").eq("id", reservationId).single();
  if (fetchError || !reservation) throw new ApiError(404, "Reservation not found", "reservation_not_found");
  if (reservation.status !== "reserved") throw new ApiError(409, "Reservation is not active", "reservation_not_active");
  const { error: decrementError } = await (supabase.rpc as any)("decrement_inventory_quantity", {
    p_item_id: reservation.inventory_item_id,
    p_quantity: reservation.quantity,
  });
  if (decrementError) throw new ApiError(500, `Failed to decrement stock: ${decrementError.message}`, "decrement_failed");
  const now = new Date().toISOString();
  const { data, error } = await (supabase.from("inventory_reservations") as any)
    .update({ status: "consumed", consumed_at: now, updated_at: now })
    .eq("id", reservationId).select().single();
  if (error) throw new ApiError(500, `Failed to consume: ${error.message}`, "consume_failed");
  return json({ data });
});

workOrdersRouter.post("/v1/inventory/reservations/:id/release", async (c) => {
  const { supabase } = await requireAuth(c);
  const now = new Date().toISOString();
  const { data, error } = await (supabase.from("inventory_reservations") as any)
    .update({ status: "released", released_at: now, updated_at: now })
    .eq("id", c.req.param("id")).eq("status", "reserved").select("id");
  if (error) throw error;
  return json({ data: { released: (data ?? []).length > 0 } });
});

workOrdersRouter.post("/v1/inventory/reservations/release-by-work-order", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({ work_order_id: z.string().min(1) }).parse(await c.req.json());
  const now = new Date().toISOString();
  const { error } = await (supabase.from("inventory_reservations") as any)
    .update({ status: "released", released_at: now, updated_at: now })
    .eq("work_order_id", body.work_order_id).eq("status", "reserved");
  if (error) throw error;
  return json({ data: { ok: true } });
});

workOrdersRouter.get("/v1/inventory/shortages", async (c) => {
  const { supabase } = await requireAuth(c);
  const userId = z.string().min(1).parse(new URL(c.req.url).searchParams.get("user_id") ?? "");
  const [itemsRes, reservationsRes] = await Promise.all([
    (supabase.from("inventory_items") as any).select("*").eq("user_id", userId),
    (supabase.from("inventory_reservations") as any).select("*").eq("user_id", userId).eq("status", "reserved"),
  ]);
  const error = itemsRes.error || reservationsRes.error;
  if (error) throw error;
  return json({ data: { items: itemsRes.data ?? [], reservations: reservationsRes.data ?? [] } });
});

// ---------------------------------------------------------------------------
// Recurring services — /v1/recurring-services/*
// ---------------------------------------------------------------------------

workOrdersRouter.get("/v1/recurring-services/lookup", async (c) => {
  const { supabase } = await requireAuth(c);
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id") ?? "");
  const [catalogRes, customersRes, vehiclesRes] = await Promise.all([
    (supabase.from("service_catalog") as any)
      .select("id,name").eq("workspace_id", workspaceId).eq("is_active", true).order("name"),
    (supabase.from("customers") as any)
      .select("id,first_name,last_name,company_name").eq("workspace_id", workspaceId).neq("status", "archived").order("first_name"),
    (supabase.from("vehicles") as any)
      .select("id,customer_id,make,model,year").eq("workspace_id", workspaceId).order("year", { ascending: false }),
  ]);
  const error = catalogRes.error || customersRes.error || vehiclesRes.error;
  if (error) throw error;
  return json({
    data: {
      catalog_items: catalogRes.data ?? [],
      customers: customersRes.data ?? [],
      vehicles: vehiclesRes.data ?? [],
    },
  });
});

workOrdersRouter.get("/v1/recurring-services", async (c) => {
  const { supabase } = await requireAuth(c);
  const userId = z.string().min(1).parse(new URL(c.req.url).searchParams.get("user_id") ?? "");
  const { data, error } = await (supabase.from("recurring_services") as any)
    .select("id, service_catalog_id, customer_id, vehicle_id, frequency, interval, start_date, next_due_date, is_active, created_at")
    .eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw error;
  return json({ data: data ?? [] });
});

workOrdersRouter.post("/v1/recurring-services", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({
    user_id: z.string().min(1),
    service_catalog_id: z.string().min(1),
    customer_id: z.string().nullable().optional(),
    vehicle_id: z.string().nullable().optional(),
    frequency: z.enum(["days", "weeks", "months", "years"]),
    interval: z.number().int().positive(),
    start_date: z.string().min(1),
    next_due_date: z.string().min(1),
  }).parse(await c.req.json());
  const { data, error } = await (supabase.from("recurring_services") as any).insert({
    user_id: body.user_id,
    service_catalog_id: body.service_catalog_id,
    customer_id: body.customer_id ?? null,
    vehicle_id: body.vehicle_id ?? null,
    frequency: body.frequency,
    interval: body.interval,
    start_date: body.start_date,
    next_due_date: body.next_due_date,
    is_active: true,
  }).select("id, service_catalog_id, customer_id, vehicle_id, frequency, interval, start_date, next_due_date, is_active, created_at").single();
  if (error) throw error;
  return json({ data }, { status: 201 });
});

// ---------------------------------------------------------------------------
// Detailing pricing — /v1/detailing-pricing/*
// ---------------------------------------------------------------------------

workOrdersRouter.get("/v1/detailing-pricing/rules", async (c) => {
  const { supabase } = await requireAuth(c);
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id") ?? "");
  const { data, error } = await (supabase.from("detailing_pricing_rules") as any)
    .select("id,service_catalog_id,size_tier,condition,price_multiplier,duration_multiplier,flat_fee,photo_required,quote_required,requires_water,requires_power,requires_covered_area")
    .eq("workspace_id", workspaceId)
    .order("service_catalog_id").order("size_tier").order("condition");
  if (error) throw error;
  return json({ data: data ?? [] });
});

workOrdersRouter.get("/v1/detailing-pricing/public-rules", async (c) => {
  const businessUserId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("business_user_id") ?? "");
  const admin = createSupabaseAdminClient();
  const db = admin as any;
  const { data: workspaces, error: workspaceError } = await db
    .from("workspaces")
    .select("id")
    .eq("created_by", businessUserId)
    .eq("is_active", true);
  if (workspaceError) throw workspaceError;
  const workspaceIds = ((workspaces ?? []) as Array<{ id: string }>).map((workspace) => workspace.id);
  if (!workspaceIds.length) return json({ data: [] });

  const { data, error } = await db
    .from("detailing_pricing_rules")
    .select("id,workspace_id,service_catalog_id,size_tier,condition,price_multiplier,duration_multiplier,flat_fee,photo_required,quote_required,requires_water,requires_power,requires_covered_area")
    .in("workspace_id", workspaceIds)
    .order("service_catalog_id")
    .order("size_tier")
    .order("condition");
  if (error) throw error;
  return json({ data: data ?? [] });
});

workOrdersRouter.post("/v1/detailing-pricing/rules", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({ workspace_id: z.string().uuid(), rules: z.array(z.record(z.string(), z.unknown())) })
    .parse(await c.req.json());
  const { error } = await (supabase.rpc as any)("replace_detailing_pricing_rules", {
    p_workspace_id: body.workspace_id,
    p_rules: body.rules,
  });
  if (error) throw error;
  return json({ data: { ok: true } });
});

workOrdersRouter.post("/v1/detailing-pricing/rules-for-service", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({
    workspace_id: z.string().uuid(),
    service_catalog_id: z.string().nullable().optional(),
    rules: z.array(z.record(z.string(), z.unknown())),
  }).parse(await c.req.json());
  const { error } = await (supabase.rpc as any)("replace_detailing_pricing_rules_for_scope", {
    p_workspace_id: body.workspace_id,
    p_service_catalog_id: body.service_catalog_id ?? null,
    p_rules: body.rules,
  });
  if (error) throw error;
  return json({ data: { ok: true } });
});

// ---------------------------------------------------------------------------
// Services — GET /v1/services, GET /v1/services/:id
// ---------------------------------------------------------------------------

workOrdersRouter.get("/v1/services", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await (supabase.from("services") as any)
    .select("id, title, customer_id, vehicle_id, status, service_type, service_date, estimated_cost, metadata, appointment_id, notes, assigned_technician, payment_status, created_at, updated_at, user_id")
    .eq("user_id", user.id).order("created_at", { ascending: false });
  if (error) throw error;
  return json({ data: data ?? [] });
});

workOrdersRouter.get("/v1/services/:id", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await (supabase.from("services") as any)
    .select("id, title, customer_id, vehicle_id, status, service_type, service_date, estimated_cost, metadata, appointment_id, notes, assigned_technician, payment_status, created_at, updated_at, user_id")
    .eq("id", c.req.param("id")).eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  return json({ data: data ?? null });
});

// ---------------------------------------------------------------------------
// Upsells — service_catalog rows flagged via metadata.is_upsell
// ---------------------------------------------------------------------------

workOrdersRouter.get("/v1/upsells", async (c) => {
  const { supabase } = await requireAuth(c);
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id") ?? "");
  const { data, error } = await (supabase.from("service_catalog") as any)
    .select("id,name,description,labor_price,is_active,metadata")
    .eq("workspace_id", workspaceId).order("name");
  if (error) throw error;
  return json({ data: data ?? [] });
});

workOrdersRouter.patch("/v1/upsells/:id", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({
    workspace_id: z.string().uuid(),
    name: z.string().min(1),
    description: z.string().nullable().optional(),
    default_price: z.number(),
    is_active: z.boolean(),
  }).parse(await c.req.json());
  const { error } = await (supabase.from("service_catalog") as any).update({
    name: body.name,
    description: body.description ?? null,
    labor_price: body.default_price,
    is_active: body.is_active,
  }).eq("workspace_id", body.workspace_id).eq("id", c.req.param("id"));
  if (error) throw error;
  return json({ data: { ok: true } });
});

workOrdersRouter.post("/v1/upsells/:id/toggle", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({ workspace_id: z.string().uuid(), currently_active: z.boolean() })
    .parse(await c.req.json());
  const { error } = await (supabase.from("service_catalog") as any)
    .update({ is_active: !body.currently_active })
    .eq("workspace_id", body.workspace_id).eq("id", c.req.param("id"));
  if (error) throw error;
  return json({ data: { ok: true } });
});

workOrdersRouter.post("/v1/upsells", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({
    workspace_id: z.string().uuid(),
    name: z.string().min(1),
    description: z.string().nullable().optional(),
    default_price: z.number(),
    sort_order: z.number().int().optional(),
  }).parse(await c.req.json());
  const { error } = await (supabase.from("service_catalog") as any).insert({
    workspace_id: body.workspace_id,
    name: body.name,
    description: body.description ?? null,
    category: "Add-ons",
    estimated_minutes: 15,
    labor_price: body.default_price,
    is_active: true,
    metadata: { is_upsell: true, pricing_mode: "flat", ...(body.sort_order != null ? { sort_order: body.sort_order } : {}) },
  });
  if (error) throw error;
  return json({ data: { ok: true } }, { status: 201 });
});

workOrdersRouter.post("/v1/upsells/default-templates", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({
    workspace_id: z.string().uuid(),
    templates: z.array(z.object({
      name: z.string().min(1),
      description: z.string().nullable().optional(),
      price: z.number(),
    })).min(1).max(200),
  }).parse(await c.req.json());
  const { error } = await (supabase.from("service_catalog") as any).insert(
    body.templates.map((t, index) => ({
      workspace_id: body.workspace_id,
      name: t.name,
      description: t.description ?? null,
      category: "Add-ons",
      estimated_minutes: 15,
      labor_price: t.price,
      is_active: true,
      metadata: { is_upsell: true, sort_order: 900 + index, pricing_mode: "flat" },
    })),
  );
  if (error) throw error;
  return json({ data: { created: body.templates.length } }, { status: 201 });
});

// ---------------------------------------------------------------------------
// Shop pricing — GET/PUT /v1/shop-pricing
// ---------------------------------------------------------------------------

workOrdersRouter.get("/v1/shop-pricing", async (c) => {
  const { supabase } = await requireAuth(c);
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id") ?? "");
  const { data, error } = await (supabase.from("shop_pricing_rules") as any)
    .select("rule_key, value, workspace_id").eq("workspace_id", workspaceId);
  if (error) throw error;
  return json({ data: data ?? [] });
});

workOrdersRouter.put("/v1/shop-pricing", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({
    workspace_id: z.string().uuid(),
    values: z.record(z.string(), z.unknown()),
  }).parse(await c.req.json());
  const rows = Object.entries(body.values).map(([rule_key, value]) => ({
    workspace_id: body.workspace_id,
    rule_key,
    value,
  }));
  const { data, error } = rows.length > 0
    ? await (supabase.from("shop_pricing_rules") as any).upsert(rows, { onConflict: "workspace_id,rule_key" }).select()
    : { data: [], error: null };
  if (error) throw error;
  return json({ data: data ?? [] });
});

// ---------------------------------------------------------------------------
// Repair pricing — benchmarks + quote requests
// ---------------------------------------------------------------------------

workOrdersRouter.get("/v1/repair-pricing/benchmarks", async (c) => {
  const { supabase } = await requireAuth(c);
  const { data, error } = await (supabase.from("benchmark_pricing") as any).select("*");
  if (error) throw error;
  return json({ data: data ?? [] });
});

workOrdersRouter.post("/v1/repair-pricing/benchmarks", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({
    service_name: z.string().min(1),
    vehicle_type: z.string().min(1),
    low_price: z.number().nullable().optional(),
    average_price: z.number().nullable().optional(),
    high_price: z.number().nullable().optional(),
  }).parse(await c.req.json());
  const { data, error } = await (supabase.from("benchmark_pricing") as any).insert({
    ...body,
    data_source: "ServiceWriter benchmarks",
  }).select().single();
  if (error) throw error;
  return json({ data }, { status: 201 });
});

workOrdersRouter.get("/v1/repair-pricing/quote-requests", async (c) => {
  const { supabase } = await requireAuth(c);
  const { data, error } = await (supabase.from("price_quote_requests") as any)
    .select("*").order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return json({ data: data ?? [] });
});

workOrdersRouter.patch("/v1/repair-pricing/quote-requests/:id", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({
    status: z.string().min(1),
    quoted_price: z.number().nullable().optional(),
  }).parse(await c.req.json());
  const { data, error } = await (supabase.from("price_quote_requests") as any)
    .update({ status: body.status, ...(body.quoted_price != null ? { quoted_price: body.quoted_price } : {}) })
    .eq("id", c.req.param("id")).select().single();
  if (error) throw error;
  return json({ data });
});

workOrdersRouter.post("/v1/repair-pricing/public-quote-requests", async (c) => {
  const body = z.record(z.string(), z.unknown()).parse(await c.req.json());
  const anon = createSupabaseAnonServerClient();
  const { data, error } = await anon.functions.invoke("public-quote-request", { body });
  if (error) throw error;
  return json({ data: data ?? null }, { status: 201 });
});

// ---------------------------------------------------------------------------
// Service records — GET /v1/service-records/:id/detail (bundle)
// ---------------------------------------------------------------------------

workOrdersRouter.get("/v1/service-records/:id/detail", async (c) => {
  const { supabase } = await requireAuth(c);
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id") ?? "");
  const serviceId = c.req.param("id");
  const { data: service, error: serviceError } = await (supabase.from("service_records") as any)
    .select("*").eq("id", serviceId).eq("workspace_id", workspaceId).maybeSingle();
  if (serviceError) throw serviceError;
  if (!service) throw new ApiError(404, "Service record not found", "service_record_not_found");
  const [itemsRes, assetsRes, attachmentsRes, threadsRes, appointmentRes] = await Promise.all([
    (supabase.from("service_record_items") as any).select("*").eq("service_id", serviceId),
    (supabase.from("service_record_assets") as any)
      .select("asset_id, assets(id, original_filename, storage_bucket, storage_path, mime_type, file_size_bytes)")
      .eq("service_id", serviceId),
    (supabase.from("job_thread_attachments") as any)
      .select("asset_id, assets(id, original_filename, storage_bucket, storage_path, mime_type, file_size_bytes)")
      .eq("thread_id", serviceId),
    (supabase.from("threads") as any).select("id").eq("job_id", serviceId).eq("job_source", "service_record")
      .is("deleted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    service.appointment_id
      ? (supabase.from("appointments") as any).select("*").eq("id", service.appointment_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const error = itemsRes.error || assetsRes.error || attachmentsRes.error || threadsRes.error || appointmentRes.error;
  if (error) throw error;
  return json({
    data: {
      service,
      items: itemsRes.data ?? [],
      assets: assetsRes.data ?? [],
      attachments: attachmentsRes.data ?? [],
      thread_id: threadsRes.data?.id ?? null,
      appointment: appointmentRes.data ?? null,
    },
  });
});

// ---------------------------------------------------------------------------
// Operational jobs — GET /v1/operational-jobs (today-window bundle)
// ---------------------------------------------------------------------------

workOrdersRouter.get("/v1/operational-jobs", async (c) => {
  const { supabase } = await requireAuth(c);
  const params = new URL(c.req.url).searchParams;
  const workspaceId = z.string().uuid().parse(params.get("workspace_id") ?? "");
  const from = z.string().min(1).parse(params.get("from") ?? "");
  const to = z.string().min(1).parse(params.get("to") ?? "");
  const { data: serviceRecords, error: serviceError } = await (supabase.from("service_records") as any)
    .select("id,title,status,service_type,service_date,estimated_cost,metadata,appointment_id,assigned_technician_id")
    .eq("workspace_id", workspaceId)
    .gte("service_date", from).lte("service_date", to)
    .order("service_date", { ascending: true });
  if (serviceError) throw serviceError;
  const appointmentIds = Array.from(new Set(
    (serviceRecords ?? []).map((r: any) => r.appointment_id).filter((id: unknown): id is string => typeof id === "string"),
  ));
  const { data: appointments, error: appointmentsError } = appointmentIds.length > 0
    ? await (supabase.from("appointments") as any)
      .select("id,metadata,appointment_type").in("id", appointmentIds).eq("workspace_id", workspaceId)
    : { data: [], error: null };
  if (appointmentsError) throw appointmentsError;
  return json({ data: { service_records: serviceRecords ?? [], appointments: appointments ?? [] } });
});

// ---------------------------------------------------------------------------
// Command-center technicians — GET /v1/command-center/technicians
// ---------------------------------------------------------------------------

workOrdersRouter.get("/v1/command-center/technicians", async (c) => {
  const { supabase } = await requireAuth(c);
  const params = new URL(c.req.url).searchParams;
  const workspaceId = z.string().uuid().parse(params.get("workspace_id") ?? "");
  const from = z.string().min(1).parse(params.get("from") ?? "");
  const to = z.string().min(1).parse(params.get("to") ?? "");
  const [techniciansRes, jobsRes, workspaceRes] = await Promise.all([
    (supabase.from("technicians") as any)
      .select("id, user_id, first_name, last_name, full_name, email, phone, status, role, home_latitude, home_longitude, current_latitude, current_longitude, location_updated_at, assigned_van_id")
      .eq("workspace_id", workspaceId).order("full_name"),
    (supabase.from("service_records") as any)
      .select("id,title,status,service_type,service_date,estimated_cost,metadata,appointment_id,assigned_technician_id")
      .eq("workspace_id", workspaceId)
      .gte("service_date", from).lte("service_date", to)
      .order("service_date", { ascending: true }),
    (supabase.from("workspaces") as any).select("timezone").eq("id", workspaceId).maybeSingle(),
  ]);
  const error = techniciansRes.error || jobsRes.error || workspaceRes.error;
  if (error) throw error;
  const appointmentIds = Array.from(new Set(
    (jobsRes.data ?? []).map((r: any) => r.appointment_id).filter((id: unknown): id is string => typeof id === "string"),
  ));
  const { data: appointments, error: appointmentsError } = appointmentIds.length > 0
    ? await (supabase.from("appointments") as any)
      .select("id,metadata,appointment_type").in("id", appointmentIds).eq("workspace_id", workspaceId)
    : { data: [], error: null };
  if (appointmentsError) throw appointmentsError;
  return json({
    data: {
      technicians: techniciansRes.data ?? [],
      service_records: jobsRes.data ?? [],
      appointments: appointments ?? [],
      timezone: workspaceRes.data?.timezone ?? "UTC",
    },
  });
});

// ---------------------------------------------------------------------------
// Dispatcher fleet work orders — GET /v1/fleet/dispatcher-work-orders
// ---------------------------------------------------------------------------

workOrdersRouter.get("/v1/fleet/dispatcher-work-orders", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { data, error } = await (supabase.from("appointments") as any)
    .select("id, user_id, title, status, service_catalog_id, customer_id, vehicle_id, fleet_vehicle_id, starts_at, ends_at, address, notes, metadata, priority, dispatch_status, assigned_technician_id")
    .eq("user_id", user.id)
    .in("status", ["scheduled", "in_progress"])
    .gte("starts_at", todayStart.toISOString())
    .order("starts_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  return json({ data: data ?? [] });
});

// ---------------------------------------------------------------------------
// Service search for linking — GET /v1/services/search-for-linking
// ---------------------------------------------------------------------------

workOrdersRouter.get("/v1/services/search-for-linking", async (c) => {
  const { supabase } = await requireAuth(c);
  const params = new URL(c.req.url).searchParams;
  const workspaceId = z.string().uuid().parse(params.get("workspace_id") ?? "");
  const limit = Math.min(Math.max(Number(params.get("limit") ?? 50) || 50, 1), 200);
  const { data, error } = await (supabase.from("service_catalog") as any)
    .select("id, name, category, base_price, duration_minutes")
    .eq("workspace_id", workspaceId).order("updated_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return json({ data: data ?? [] });
});

// ---------------------------------------------------------------------------
// Workspaces — GET /v1/workspaces/timezone
// ---------------------------------------------------------------------------

workOrdersRouter.get("/v1/workspaces/timezone", async (c) => {
  const { supabase } = await requireAuth(c);
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id") ?? "");
  const { data, error } = await (supabase.from("workspaces") as any)
    .select("timezone").eq("id", workspaceId).single();
  if (error) throw error;
  return json({ data: { timezone: data?.timezone ?? "UTC" } });
});

// ---------------------------------------------------------------------------
// Inline service writer — POST /v1/inline-service-writer/appointment-items
// ---------------------------------------------------------------------------

workOrdersRouter.post("/v1/inline-service-writer/appointment-items", async (c) => {
  const body = z.object({
    workspace_id: z.string().uuid(),
    items: z.array(z.object({
      appointment_id: z.string().min(1),
      service_catalog_id: z.string().nullable().optional(),
      name: z.string().min(1),
      quantity: z.number().int().positive().default(1),
      unit_price: z.number().default(0),
      status: z.string().default("pending"),
    })).min(1).max(200),
  }).parse(await c.req.json());
  const { supabase } = await requireWorkspaceAuth(c, body.workspace_id);
  const appointmentIds = Array.from(new Set(body.items.map((i) => i.appointment_id)));
  const { data: appointments, error: appointmentsError } = await (supabase.from("appointments") as any)
    .select("id").eq("workspace_id", body.workspace_id).in("id", appointmentIds);
  if (appointmentsError) throw appointmentsError;
  const validIds = new Set((appointments ?? []).map((a: any) => a.id));
  const rows = body.items
    .filter((item) => validIds.has(item.appointment_id))
    .map((item) => ({
      appointment_id: item.appointment_id,
      service_catalog_id: item.service_catalog_id ?? null,
      name: item.name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      status: item.status,
    }));
  const { data, error } = rows.length > 0
    ? await (supabase.from("appointment_items") as any).insert(rows).select()
    : { data: [], error: null };
  if (error) throw error;
  return json({ data: data ?? [] }, { status: 201 });
});

// ---------------------------------------------------------------------------
// Team members — GET/POST /v1/team/members, PATCH/DELETE /v1/team/members/:id
// ---------------------------------------------------------------------------

workOrdersRouter.get("/v1/team/members", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const userId = z.string().min(1).parse(new URL(c.req.url).searchParams.get("user_id") ?? "");
  if (userId !== user.id) throw new ApiError(403, "You can only list your own team members", "team_members_forbidden");
  const { data, error } = await (supabase.from("team_members") as any)
    .select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw error;
  return json({ data: data ?? [] });
});

workOrdersRouter.post("/v1/team/members", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.record(z.string(), z.unknown()).parse(await c.req.json());
  const { data, error } = await (supabase.from("team_members") as any).insert(body).select().single();
  if (error) throw error;
  return json({ data }, { status: 201 });
});

workOrdersRouter.patch("/v1/team/members/:id", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.record(z.string(), z.unknown()).parse(await c.req.json());
  const { data, error } = await (supabase.from("team_members") as any)
    .update(body).eq("id", c.req.param("id")).select().single();
  if (error) throw error;
  return json({ data });
});

workOrdersRouter.delete("/v1/team/members/:id", async (c) => {
  const { supabase } = await requireAuth(c);
  const { error } = await (supabase.from("team_members") as any).delete().eq("id", c.req.param("id"));
  if (error) throw error;
  return json({ data: { ok: true } });
});

// ---------------------------------------------------------------------------
// Team documents — POST /v1/team/documents/upload
// ---------------------------------------------------------------------------

workOrdersRouter.post("/v1/team/documents/upload", async (c) => {
  const { supabase } = await requireAuth(c);
  const form = await c.req.raw.formData();
  const file = form.get("file");
  const path = typeof form.get("path") === "string" ? (form.get("path") as string).trim() : "";
  if (!(file instanceof File)) throw new ApiError(400, "A file upload is required", "file_required");
  if (!path) throw new ApiError(400, "A storage path is required", "path_required");
  const { error } = await supabase.storage.from("team-documents").upload(path, file, { upsert: true });
  if (error) throw error;
  return json({ data: { path } }, { status: 201 });
});

// ---------------------------------------------------------------------------
// Team dashboard — profile, assignments, drivers license
// ---------------------------------------------------------------------------

workOrdersRouter.get("/v1/team/dashboard/profile", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const authUserId = z.string().min(1).parse(new URL(c.req.url).searchParams.get("auth_user_id") ?? "");
  if (authUserId !== user.id) throw new ApiError(403, "You can only read your own dashboard profile", "dashboard_profile_forbidden");
  const { data, error } = await (supabase.from("technicians") as any)
    .select("*").eq("auth_user_id", authUserId).maybeSingle();
  if (error) throw error;
  return json({ data: data ?? null });
});

workOrdersRouter.get("/v1/team/dashboard/assignments", async (c) => {
  const { supabase } = await requireAuth(c);
  const technicianId = z.string().min(1).parse(new URL(c.req.url).searchParams.get("technician_id") ?? "");
  const { data: tech, error: techError } = await (supabase.from("technicians") as any)
    .select("auth_user_id").eq("id", technicianId).maybeSingle();
  if (techError) throw techError;
  if (!tech?.auth_user_id) return json({ data: [] });
  const { data, error } = await (supabase.from("appointments") as any)
    .select("id,starts_at,ends_at,status,notes,metadata")
    .eq("assigned_user_id", tech.auth_user_id)
    .gte("starts_at", new Date().toISOString())
    .not("status", "in", '("cancelled","completed","no_show")')
    .order("starts_at", { ascending: true });
  if (error) throw error;
  return json({ data: data ?? [] });
});

workOrdersRouter.patch("/v1/team/dashboard/profile/:techId", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.record(z.string(), z.unknown()).parse(await c.req.json());
  const { data, error } = await (supabase.from("technicians") as any)
    .update(body).eq("id", c.req.param("techId")).select().single();
  if (error) throw error;
  return json({ data });
});

workOrdersRouter.post("/v1/team/dashboard/drivers-license", async (c) => {
  const { supabase } = await requireAuth(c);
  const form = await c.req.raw.formData();
  const file = form.get("file");
  const userId = typeof form.get("user_id") === "string" ? (form.get("user_id") as string).trim() : "";
  const techId = typeof form.get("tech_id") === "string" ? (form.get("tech_id") as string).trim() : "";
  if (!(file instanceof File)) throw new ApiError(400, "A file upload is required", "file_required");
  if (!userId || !techId) throw new ApiError(400, "user_id and tech_id are required", "drivers_license_params_required");
  const filePath = `${userId}/drivers-license-${techId}.png`;
  const { error: uploadError } = await supabase.storage.from("team-documents").upload(filePath, file, { upsert: true });
  if (uploadError) throw uploadError;
  const { data } = supabase.storage.from("team-documents").getPublicUrl(filePath);
  const { data: updated, error: updateError } = await (supabase.from("technicians") as any)
    .update({ drivers_license_url: data.publicUrl }).eq("id", techId).select().single();
  if (updateError) throw updateError;
  return json({ data: { public_url: data.publicUrl, technician: updated } });
});

// ---------------------------------------------------------------------------
// Time clock — GET /v1/time-clock, POST /v1/time-clock/*
// ---------------------------------------------------------------------------

workOrdersRouter.get("/v1/time-clock", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { data, error } = await (supabase.from("time_clock_entries") as any)
    .select("*").eq("user_id", user.id)
    .gte("clock_in", startOfDay.toISOString()).order("clock_in", { ascending: false });
  if (error) throw error;
  const entries = data ?? [];
  const current = entries.find((e: any) => !e.clock_out) ?? null;
  return json({ data: { entries, current } });
});

workOrdersRouter.post("/v1/time-clock/clock-in", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({ location: z.string().nullable().optional() }).parse(await c.req.json().catch(() => ({})));
  const { data, error } = await (supabase.rpc as any)("clock_in", { p_location: body.location ?? null });
  if (error) throw error;
  return json({ data: data ?? null });
});

workOrdersRouter.post("/v1/time-clock/clock-out", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({ location: z.string().nullable().optional() }).parse(await c.req.json().catch(() => ({})));
  const { data, error } = await (supabase.rpc as any)("clock_out", { p_location: body.location ?? null });
  if (error) throw error;
  return json({ data: data ?? null });
});

workOrdersRouter.post("/v1/time-clock/break/start", async (c) => {
  const { supabase } = await requireAuth(c);
  const { data, error } = await (supabase.rpc as any)("start_break");
  if (error) throw error;
  return json({ data: data ?? null });
});

workOrdersRouter.post("/v1/time-clock/break/end", async (c) => {
  const { supabase } = await requireAuth(c);
  const { data, error } = await (supabase.rpc as any)("end_break");
  if (error) throw error;
  return json({ data: data ?? null });
});

// ---------------------------------------------------------------------------
// Job runtime — GET /v1/jobs/:id/runtime (canonical execution bundle)
// ---------------------------------------------------------------------------

workOrdersRouter.get("/v1/jobs/:id/runtime", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const jobId = c.req.param("id");
  const { data: appointment, error: appointmentError } = await (supabase.from("appointments") as any)
    .select("id,user_id,workspace_id,customer_id,vehicle_id,service_catalog_id,title,status,dispatch_status,assigned_technician_id,estimated_cost,metadata,starts_at,ends_at,service_date")
    .eq("id", jobId).eq("user_id", user.id).single();
  if (appointmentError) throw appointmentError;
  const [itemsRes, serviceRes, invoiceRes, checklistRes] = await Promise.all([
    (supabase.from("appointment_items") as any)
      .select("id,service_catalog_id,name,quantity,unit_price,technician_notes,status,metadata")
      .eq("workspace_id", appointment.workspace_id).eq("appointment_id", jobId).order("sort_order"),
    (supabase.from("service_records") as any)
      .select("id,subtotal,tax_amount,total_amount,status,started_at,completed_at,metadata")
      .eq("workspace_id", appointment.workspace_id).eq("appointment_id", jobId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    (supabase.from("invoices") as any)
      .select("id,subtotal,tax_total,total,status,balance_due,due_date,paid_at")
      .eq("workspace_id", appointment.workspace_id).eq("appointment_id", jobId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    (supabase.from("job_execution_checklist") as any)
      .select("id,step_key,label,step_order,status,evidence_url,completed_at,completed_by")
      .eq("appointment_id", jobId).order("step_order"),
  ]);
  const error = itemsRes.error || serviceRes.error || invoiceRes.error || checklistRes.error;
  if (error) throw error;
  let payments: any[] = [];
  if (invoiceRes.data?.id) {
    const { data: paymentRows, error: paymentsError } = await (supabase.from("payments") as any)
      .select("id,amount,method,status,created_at")
      .eq("workspace_id", appointment.workspace_id).eq("invoice_id", invoiceRes.data.id)
      .order("created_at", { ascending: false });
    if (paymentsError) throw paymentsError;
    payments = paymentRows ?? [];
  }
  return json({
    data: {
      appointment,
      items: itemsRes.data ?? [],
      service: serviceRes.data ?? null,
      invoice: invoiceRes.data ?? null,
      payments,
      checklist: checklistRes.data ?? [],
    },
  });
});

// ---------------------------------------------------------------------------
// Tech app — GET /v1/tech-app/* bundles
// ---------------------------------------------------------------------------

workOrdersRouter.get("/v1/tech-app/context", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data: technician, error: techError } = await (supabase.from("technicians") as any)
    .select("*").eq("user_id", user.id).maybeSingle();
  if (techError && techError.code !== "PGRST116") throw techError;
  const [vanRes, clockRes, prefsRes] = await Promise.all([
    (supabase.from("vans") as any).select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    (() => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      return (supabase.from("time_clock_entries") as any).select("*").eq("user_id", user.id)
        .gte("clock_in", start.toISOString()).order("clock_in", { ascending: false }).limit(10);
    })(),
    technician?.id
      ? (supabase.from("technician_notification_preferences") as any).select("*").eq("technician_id", technician.id).single()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const error = vanRes.error || clockRes.error;
  if (error) throw error;
  return json({
    data: {
      technician: technician ?? null,
      van: vanRes.data ?? null,
      clock_entries: clockRes.data ?? [],
      notification_prefs: prefsRes.data ?? null,
    },
  });
});

workOrdersRouter.get("/v1/tech-app/job-workspace", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const jobId = z.string().min(1).parse(new URL(c.req.url).searchParams.get("job_id") ?? "");
  const { data: appointment, error: appointmentError } = await (supabase.from("appointments") as any)
    .select("*").eq("id", jobId).eq("user_id", user.id).single();
  if (appointmentError) throw appointmentError;
  const workspaceId = appointment.user_id;
  const [customerRes, vehicleRes, itemsRes, catalogRes, techniciansRes, commentsRes, operationalJobRes] = await Promise.all([
    appointment.customer_id
      ? (supabase.from("customers") as any).select("*").eq("id", appointment.customer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    appointment.vehicle_id
      ? (supabase.from("vehicles") as any).select("*").eq("id", appointment.vehicle_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    (supabase.from("appointment_items") as any)
      .select("id, appointment_id, service_catalog_id, name, quantity, unit_price, status, technician_notes, service_catalog(id, name, category, description, base_price, duration_minutes)")
      .eq("appointment_id", jobId).order("created_at"),
    (supabase.from("service_catalog") as any)
      .select("id, name, category, description, base_price, duration_minutes")
      .eq("workspace_id", workspaceId).order("name"),
    (supabase.from("technicians") as any)
      .select("id, first_name, last_name, full_name, phone, email, status")
      .eq("workspace_id", workspaceId).order("full_name"),
    (supabase.from("job_comments") as any)
      .select("id, appointment_id, author_id, author_name, body, created_at")
      .eq("appointment_id", jobId).order("created_at", { ascending: true }),
    (supabase.from("operational_jobs") as any)
      .select("*").eq("job_id", jobId).eq("job_source", "appointment").maybeSingle(),
  ]);
  const error = customerRes.error || vehicleRes.error || itemsRes.error || catalogRes.error
    || techniciansRes.error || commentsRes.error || operationalJobRes.error;
  if (error) throw error;
  return json({
    data: {
      appointment,
      customer: customerRes.data ?? null,
      vehicle: vehicleRes.data ?? null,
      items: itemsRes.data ?? [],
      service_catalog: catalogRes.data ?? [],
      technicians: techniciansRes.data ?? [],
      comments: commentsRes.data ?? [],
      operational_job: operationalJobRes.data ?? null,
    },
  });
});

workOrdersRouter.get("/v1/tech-app/session", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const [techRes, entriesRes] = await Promise.all([
    (supabase.from("technicians") as any).select("*").eq("user_id", user.id).maybeSingle(),
    (supabase.from("time_clock_entries") as any).select("*").eq("user_id", user.id)
      .gte("clock_in", start.toISOString()).order("clock_in", { ascending: false }),
  ]);
  const error = techRes.error || entriesRes.error;
  if (error) throw error;
  return json({ data: { technician: techRes.data ?? null, entries: entriesRes.data ?? [] } });
});

workOrdersRouter.get("/v1/tech-app/job-workspace-v2", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const jobId = z.string().min(1).parse(new URL(c.req.url).searchParams.get("job_id") ?? "");
  const { data: appointment, error: appointmentError } = await (supabase.from("appointments") as any)
    .select("*").eq("id", jobId).eq("user_id", user.id).single();
  if (appointmentError) throw appointmentError;
  const [itemsRes, threadsRes] = await Promise.all([
    (supabase.from("appointment_items") as any)
      .select("id, appointment_id, service_catalog_id, name, quantity, unit_price, status, technician_notes, service_catalog(id, name, category, description, base_price, duration_minutes)")
      .eq("appointment_id", jobId).order("created_at"),
    (supabase.from("threads") as any).select("id").eq("job_id", jobId).eq("job_source", "appointment")
      .is("deleted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const error = itemsRes.error || threadsRes.error;
  if (error) throw error;
  return json({ data: { appointment, items: itemsRes.data ?? [], thread: threadsRes.data ?? null } });
});

workOrdersRouter.get("/v1/tech-app/technician-id", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await (supabase.from("technicians") as any)
    .select("id").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  return json({ data: { technician_id: data?.id ?? null } });
});

workOrdersRouter.get("/v1/tech-app/more", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const [techRes, vansRes] = await Promise.all([
    (supabase.from("technicians") as any)
      .select("id, user_id, workspace_id, first_name, last_name, full_name, phone, email, status, employment_type, hourly_rate, pay_type, role, home_address, avatar_url, emergency_contact_name, emergency_contact_phone")
      .eq("user_id", user.id).single(),
    (supabase.from("vans") as any).select("*").eq("user_id", user.id),
  ]);
  const error = techRes.error || vansRes.error;
  if (error) throw error;
  return json({ data: { technician: techRes.data, vans: vansRes.data ?? [] } });
});

workOrdersRouter.get("/v1/tech-app/today/clock-entries", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const params = new URL(c.req.url).searchParams;
  const userId = params.get("user_id") || user.id;
  const date = params.get("date") || new Date().toISOString().slice(0, 10);
  const startOfDay = new Date(`${date}T00:00:00`);
  const { data, error } = await (supabase.from("time_clock_entries") as any)
    .select("*").eq("user_id", userId).gte("clock_in", startOfDay.toISOString())
    .order("clock_in", { ascending: false });
  if (error) throw error;
  return json({ data: data ?? [] });
});

workOrdersRouter.get("/v1/tech-app/inventory", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data: technician, error: techError } = await (supabase.from("technicians") as any)
    .select("id").eq("user_id", user.id).maybeSingle();
  if (techError) throw techError;
  const [inventoryRes, vansRes] = await Promise.all([
    technician?.id
      ? (supabase.from("van_inventory") as any).select("*").eq("technician_id", technician.id).order("item_name")
      : Promise.resolve({ data: [], error: null }),
    (supabase.from("vans") as any).select("*").eq("user_id", user.id),
  ]);
  const error = inventoryRes.error || vansRes.error;
  if (error) throw error;
  return json({ data: { inventory: inventoryRes.data ?? [], vans: vansRes.data ?? [] } });
});

workOrdersRouter.get("/v1/tech-app/profile", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data: technician, error: techError } = await (supabase.from("technicians") as any)
    .select("*").eq("user_id", user.id).maybeSingle();
  if (techError) throw techError;
  const { data: skills, error: skillsError } = technician?.id
    ? await (supabase.from("technician_skills") as any).select("*").eq("technician_id", technician.id)
    : { data: [], error: null };
  if (skillsError) throw skillsError;
  return json({ data: { technician: technician ?? null, skills: skills ?? [] } });
});

workOrdersRouter.get("/v1/tech-app/notification-settings", async (c) => {
  const { supabase } = await requireAuth(c);
  const techId = z.string().min(1).parse(new URL(c.req.url).searchParams.get("tech_id") ?? "");
  const { data, error } = await (supabase.from("technician_notification_preferences") as any)
    .select("*").eq("technician_id", techId).single();
  if (error && error.code !== "PGRST116") throw error;
  return json({ data: data ?? null });
});

workOrdersRouter.put("/v1/tech-app/notification-settings", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({
    tech_id: z.string().min(1),
    enabled: z.boolean(),
    types: z.array(z.string()),
  }).parse(await c.req.json());
  const { data, error } = await (supabase.from("technician_notification_preferences") as any)
    .upsert({
      technician_id: body.tech_id,
      enabled: body.enabled,
      notification_types: body.types,
      updated_at: new Date().toISOString(),
    }, { onConflict: "technician_id" }).select().single();
  if (error) throw error;
  return json({ data });
});

workOrdersRouter.get("/v1/tech-app/messages", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data: threads, error: threadsError } = await (supabase.from("threads") as any)
    .select("id, job_id, job_source, subject, updated_at")
    .eq("created_by", user.id).order("updated_at", { ascending: false }).limit(50);
  if (threadsError) throw threadsError;
  const unreadByThread: Record<string, number> = {};
  await Promise.all((threads ?? []).map(async (thread: any) => {
    const { data: lastRead } = await (supabase.rpc as any)("mark_job_thread_read_v1", {
      p_thread_id: thread.id,
      p_user_id: user.id,
    });
    const since: string | null = (lastRead as any)?.last_read_at ?? null;
    let query = (supabase.from("job_thread_messages") as any)
      .select("id", { count: "exact", head: true }).eq("thread_id", thread.id);
    if (since) query = query.gt("created_at", since);
    const { count } = await query;
    unreadByThread[thread.id] = count ?? 0;
  }));
  return json({ data: { threads: threads ?? [], unread_by_thread: unreadByThread } });
});

workOrdersRouter.get("/v1/tech-app/job-detail", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const jobId = z.string().min(1).parse(new URL(c.req.url).searchParams.get("job_id") ?? "");
  const { data: appointment, error: appointmentError } = await (supabase.from("appointments") as any)
    .select("*").eq("id", jobId).eq("user_id", user.id).single();
  if (appointmentError) throw appointmentError;
  const { data: service, error: serviceError } = await (supabase.from("services") as any)
    .select("*").eq("appointment_id", jobId).maybeSingle();
  if (serviceError) throw serviceError;
  return json({ data: { appointment, service: service ?? null } });
});

workOrdersRouter.get("/v1/tech-app/fleet-assignments", async (c) => {
  const { supabase } = await requireAuth(c);
  const params = new URL(c.req.url).searchParams;
  const techId = params.get("tech_id");
  const scopeUserId = z.string().min(1).parse(params.get("scope_user_id") ?? "");
  const isAdmin = params.get("is_admin") === "true";
  const workspaceId = scopeUserId;
  let query = (supabase.from("appointments") as any)
    .select("id, title, starts_at, ends_at, status, fleet_vehicle_id, fleet_owner_id, assigned_technician_id, customer_id, vehicle_id, address, notes, metadata, customers(first_name, last_name, company_name, phone), vehicles(year, make, model, license_plate)")
    .eq("workspace_id", workspaceId)
    .in("status", ["scheduled", "in_progress", "en_route", "arrived"])
    .order("starts_at", { ascending: true });
  query = isAdmin ? query.eq("fleet_owner_id", scopeUserId) : query.eq("assigned_technician_id", techId);
  const { data: appointments, error } = await query;
  if (error) throw error;
  const vehicleIds = Array.from(new Set(
    (appointments ?? []).map((a: any) => a.fleet_vehicle_id).filter((id: unknown): id is string => typeof id === "string"),
  ));
  const { data: fleetVehicles, error: fleetError } = vehicleIds.length > 0
    ? await (supabase.from("fleet_vehicles") as any).select("*").in("id", vehicleIds)
    : { data: [], error: null };
  if (fleetError) throw fleetError;
  const fleetById = new Map((fleetVehicles ?? []).map((v: any) => [v.id, v]));
  return json({
    data: (appointments ?? []).map((a: any) => ({
      ...a,
      fleet_vehicle: a.fleet_vehicle_id ? fleetById.get(a.fleet_vehicle_id) ?? null : null,
    })),
  });
});

// ---------------------------------------------------------------------------
// Tech app mutations — POST /v1/tech-app/*
// ---------------------------------------------------------------------------

workOrdersRouter.post("/v1/tech-app/job-photos", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const form = await c.req.raw.formData();
  const file = form.get("file");
  const appointmentId = typeof form.get("appointment_id") === "string" ? (form.get("appointment_id") as string).trim() : "";
  const businessUserId = typeof form.get("business_user_id") === "string" ? (form.get("business_user_id") as string).trim() : user.id;
  const photoType = typeof form.get("photo_type") === "string" ? (form.get("photo_type") as string).trim() : "other";
  const isRequired = form.get("is_required") === "true";
  if (!(file instanceof File)) throw new ApiError(400, "A photo file is required", "file_required");
  if (!appointmentId) throw new ApiError(400, "appointment_id is required", "appointment_id_required");
  const storagePath = `${businessUserId}/job-photos/${appointmentId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error: uploadError } = await supabase.storage.from("job-photos").upload(storagePath, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (uploadError) throw uploadError;
  const { data: urlData } = supabase.storage.from("job-photos").getPublicUrl(storagePath);
  const { data, error } = await (supabase.from("job_photos") as any).insert({
    appointment_id: appointmentId,
    business_user_id: businessUserId,
    photo_type: photoType,
    photo_url: urlData.publicUrl,
    storage_path: storagePath,
    is_required: isRequired,
    uploaded_by: user.id,
  }).select().single();
  if (error) throw error;
  return json({ data }, { status: 201 });
});

workOrdersRouter.post("/v1/tech-app/van-inventory/movements", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({
    van_inventory_id: z.string().min(1),
    entry_type: z.string().min(1),
    quantity: z.number(),
    idempotency_key: z.string().nullable().optional(),
    job_id: z.string().nullable().optional(),
    job_source: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
  }).parse(await c.req.json());
  const { data, error } = await (supabase.rpc as any)("record_inventory_movement_v1", {
    p_van_inventory_id: body.van_inventory_id,
    p_entry_type: body.entry_type,
    p_quantity: body.quantity,
    p_idempotency_key: body.idempotency_key ?? null,
    p_job_id: body.job_id ?? null,
    p_job_source: body.job_source ?? null,
    p_note: body.note ?? null,
  });
  if (error) throw error;
  return json({ data: data ?? null });
});

workOrdersRouter.post("/v1/tech-app/restock-requests", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({
    van_id: z.string().min(1),
    items: z.array(z.unknown()),
    note: z.string().nullable().optional(),
  }).parse(await c.req.json());
  const { data, error } = await (supabase.rpc as any)("create_inventory_restock_request_v1", {
    p_van_id: body.van_id,
    p_items: body.items,
    p_note: body.note ?? null,
  });
  if (error) throw error;
  return json({ data: data ?? null });
});

workOrdersRouter.post("/v1/tech-app/job-transitions", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({
    job_id: z.string().min(1),
    source: z.string().min(1),
    next_status: z.string().min(1),
    notes: z.string().nullable().optional(),
    idempotency_key: z.string().nullable().optional(),
    expected_updated_at: z.string().nullable().optional(),
  }).parse(await c.req.json());
  const { data, error } = await (supabase.rpc as any)("technician_transition_job_v1", {
    p_job_id: body.job_id,
    p_source: body.source,
    p_next_status: body.next_status,
    p_notes: body.notes ?? null,
    p_idempotency_key: body.idempotency_key ?? null,
    p_expected_updated_at: body.expected_updated_at ?? null,
  });
  if (error) throw error;
  return json({ data: data ?? null });
});

workOrdersRouter.post("/v1/tech-app/execution-steps/advance", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({
    step_id: z.string().min(1),
    status: z.string().min(1),
    evidence_url: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  }).parse(await c.req.json());
  const { data, error } = await (supabase.rpc as any)("advance_job_execution_step_v1", {
    p_step_id: body.step_id,
    p_status: body.status,
    p_evidence_url: body.evidence_url ?? null,
    p_notes: body.notes ?? null,
  });
  if (error) throw error;
  return json({ data: data ?? null });
});

workOrdersRouter.post("/v1/tech-app/fleet-job-notes", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({ job_id: z.string().min(1), notes: z.string().nullable().optional() })
    .parse(await c.req.json());
  const { data, error } = await (supabase.rpc as any)("save_technician_fleet_job_notes_v1", {
    p_job_id: body.job_id,
    p_notes: body.notes ?? null,
  });
  if (error) throw error;
  return json({ data: data ?? null });
});

workOrdersRouter.post("/v1/tech-app/appointment-notes", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const body = z.object({ job_id: z.string().min(1), notes: z.string().nullable().optional() })
    .parse(await c.req.json());
  const { data, error } = await (supabase.from("appointments") as any)
    .update({ notes: body.notes ?? null }).eq("id", body.job_id).eq("user_id", user.id).select();
  if (error) throw error;
  return json({ data: data ?? [] });
});

workOrdersRouter.post("/v1/tech-app/recommendations", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({
    items: z.array(z.record(z.string(), z.unknown())).min(1).max(200),
  }).parse(await c.req.json());
  const { data, error } = await (supabase.from("declined_services") as any).insert(body.items).select();
  if (error) throw error;
  return json({ data: data ?? [] }, { status: 201 });
});

workOrdersRouter.post("/v1/tech-app/eta-email", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({
    appointment_id: z.string().min(1),
    eta_minutes: z.number().int().nullable().optional(),
    eta_label: z.string().nullable().optional(),
    distance_miles: z.number().nullable().optional(),
    notes: z.string().nullable().optional(),
  }).parse(await c.req.json());
  const { data, error } = await supabase.functions.invoke("send-technician-eta", { body });
  if (error) throw error;
  return json({ data: data ?? null });
});

// ---------------------------------------------------------------------------
// Technician OS — GET /v1/tech-os/*, POST/PATCH /v1/tech-os/*
// ---------------------------------------------------------------------------

workOrdersRouter.get("/v1/tech-os/roster", async (c) => {
  const params = new URL(c.req.url).searchParams;
  const workspaceId = z.string().uuid().parse(params.get("workspace_id") ?? "");
  const { supabase } = await requireWorkspaceAuth(c, workspaceId);
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  const [membersRes, jobsRes] = await Promise.all([
    (supabase.from("team_members") as any).select("*").eq("workspace_id", workspaceId).order("full_name"),
    (supabase.from("service_records") as any)
      .select("id,title,status,service_type,service_date,estimated_cost,metadata,appointment_id,assigned_technician_id")
      .eq("workspace_id", workspaceId)
      .gte("service_date", start.toISOString()).lt("service_date", end.toISOString())
      .order("service_date", { ascending: true }),
  ]);
  const error = membersRes.error || jobsRes.error;
  if (error) throw error;
  const appointmentIds = Array.from(new Set(
    (jobsRes.data ?? []).map((r: any) => r.appointment_id).filter((id: unknown): id is string => typeof id === "string"),
  ));
  const { data: appointments, error: appointmentsError } = appointmentIds.length > 0
    ? await (supabase.from("appointments") as any)
      .select("id,metadata,appointment_type").in("id", appointmentIds).eq("workspace_id", workspaceId)
    : { data: [], error: null };
  if (appointmentsError) throw appointmentsError;
  const { data: workspace } = await (supabase.from("workspaces") as any)
    .select("timezone").eq("id", workspaceId).maybeSingle();
  return json({
    data: {
      members: membersRes.data ?? [],
      service_records: jobsRes.data ?? [],
      appointments: appointments ?? [],
      timezone: workspace?.timezone ?? "UTC",
    },
  });
});

workOrdersRouter.post("/v1/tech-os/snapshot", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({ from: z.string().min(1), to: z.string().min(1) }).parse(await c.req.json());
  const { data, error } = await (supabase.rpc as any)("get_team_os_technician_snapshot_v1", {
    p_from: body.from,
    p_to: body.to,
  });
  if (error) throw error;
  return json({ data: data ?? null });
});

workOrdersRouter.get("/v1/tech-os/workspace-owner", async (c) => {
  const { supabase } = await requireAuth(c);
  const { data, error } = await (supabase.rpc as any)("current_workspace_owner_user_id");
  if (error) throw error;
  return json({ data: { owner_user_id: data ?? null } });
});

workOrdersRouter.patch("/v1/tech-os/technicians/:id", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.record(z.string(), z.unknown()).parse(await c.req.json());
  const { data, error } = await (supabase.from("technicians") as any)
    .update(body).eq("id", c.req.param("id")).select();
  if (error) throw error;
  return json({ data: data ?? [] });
});

workOrdersRouter.post("/v1/tech-os/van-assignments", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({ tech_id: z.string().min(1), new_van_id: z.string().nullable().optional() })
    .parse(await c.req.json());
  const { error: clearError } = await (supabase.from("vans") as any)
    .update({ assigned_technician_id: null }).eq("assigned_technician_id", body.tech_id);
  if (clearError) throw clearError;
  if (body.new_van_id) {
    const { error: setError } = await (supabase.from("vans") as any)
      .update({ assigned_technician_id: body.tech_id }).eq("id", body.new_van_id);
    if (setError) throw setError;
  }
  return json({ data: { ok: true } });
});

workOrdersRouter.patch("/v1/tech-os/technicians/:id/status", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({ status: z.string().min(1) }).parse(await c.req.json());
  const { data, error } = await (supabase.from("technicians") as any)
    .update({ status: body.status }).eq("id", c.req.param("id")).select();
  if (error) throw error;
  return json({ data: data ?? [] });
});

workOrdersRouter.patch("/v1/tech-os/payroll-cycles/:id/pay", async (c) => {
  const { supabase } = await requireAuth(c);
  const { data, error } = await (supabase.from("technician_payroll_cycles") as any)
    .update({ payout_status: "paid" }).eq("id", c.req.param("id")).select();
  if (error) throw error;
  return json({ data: data ?? [] });
});

workOrdersRouter.post("/v1/tech-os/performance-scores/recalc", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({ tech_id: z.string().min(1) }).parse(await c.req.json());
  const { data, error } = await (supabase.rpc as any)("calculate_technician_performance_score", {
    p_technician_id: body.tech_id,
  });
  if (error) throw error;
  return json({ data: data ?? null });
});

workOrdersRouter.post("/v1/tech-os/technicians", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({ user_id: z.string().min(1), profile: z.record(z.string(), z.unknown()) })
    .parse(await c.req.json());
  const { data, error } = await (supabase.from("technicians") as any)
    .insert({ user_id: body.user_id, ...body.profile }).select().single();
  if (error) {
    if (error.message === "seat_limit_reached") {
      throw new ApiError(403, "Technician seat limit reached for current plan.", "seat_limit_reached");
    }
    throw error;
  }
  return json({ data }, { status: 201 });
});

workOrdersRouter.post("/v1/tech-os/technicians/create-with-invite", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({
    name: z.string().min(1),
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    role: z.string().min(1),
    send_invite: z.boolean().default(false),
    profile: z.record(z.string(), z.unknown()).default({}),
  }).parse(await c.req.json());
  const { data, error } = await (supabase.rpc as any)("create_team_os_technician_v1", {
    p_name: body.name,
    p_email: body.email || null,
    p_phone: body.phone || null,
    p_role: body.role,
    p_send_invite: body.send_invite,
    p_profile: body.profile ?? {},
  });
  if (error) throw error;
  if (!data) throw new ApiError(500, "Technician creation returned no result", "technician_create_empty");
  let invitationDeliveryError: string | null = null;
  if (body.send_invite && (data as any).invitation_token) {
    const { error: emailError } = await supabase.functions.invoke("invite-team-member", {
      body: { email: (data as any).email, name: (data as any).name, invitation_token: (data as any).invitation_token },
    });
    if (emailError) invitationDeliveryError = emailError.message;
  }
  return json({ data: { ...data, invitation_delivery_error: invitationDeliveryError } }, { status: 201 });
});

workOrdersRouter.post("/v1/tech-os/technicians/:id/access", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({
    action: z.enum(["resend_invitation", "revoke_invitation", "change_role", "lock", "unlock", "offboard", "reactivate"]),
    role: z.string().nullable().optional(),
    reassign_to: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  }).parse(await c.req.json());
  const { data, error } = await (supabase.rpc as any)("manage_team_os_technician_access_v1", {
    p_technician_id: c.req.param("id"),
    p_action: body.action,
    p_role: body.role ?? null,
    p_reassign_to: body.reassign_to ?? null,
    p_notes: body.notes ?? null,
  });
  if (error) throw error;
  if (body.action === "resend_invitation" && (data as any)?.invitation_token) {
    const { error: emailError } = await supabase.functions.invoke("invite-team-member", {
      body: { email: (data as any).email, name: (data as any).name, invitation_token: (data as any).invitation_token },
    });
    if (emailError) throw new ApiError(502, `Invitation renewed, but delivery failed: ${emailError.message}`, "invitation_delivery_failed");
  }
  return json({ data: data ?? null });
});

const techOsInsertSchema = z.object({
  tech_id: z.string().min(1),
  user_id: z.string().min(1),
  data: z.record(z.string(), z.unknown()).default({}),
});

function techOsInsertRoute(path: string, table: string, build: (techId: string, userId: string, data: Record<string, unknown>) => Record<string, unknown>) {
  workOrdersRouter.post(path, async (c) => {
    const { supabase } = await requireAuth(c);
    const body = techOsInsertSchema.parse(await c.req.json());
    const { data, error } = await (supabase.from(table) as any)
      .insert(build(body.tech_id, body.user_id, body.data)).select();
    if (error) throw error;
    return json({ data: data ?? [] }, { status: 201 });
  });
}

techOsInsertRoute("/v1/tech-os/emergency-contacts", "technician_emergency_contacts", (_t, _u, d) => d);
techOsInsertRoute("/v1/tech-os/skills", "technician_skills", (t, u, d) => ({ technician_id: t, user_id: u, ...d }));
techOsInsertRoute("/v1/tech-os/payroll-cycles", "technician_payroll_cycles", (t, u, d) => ({ technician_id: t, user_id: u, ...d }));
techOsInsertRoute("/v1/tech-os/incidents", "technician_incidents", (t, u, d) => ({ technician_id: t, user_id: u, ...d }));
techOsInsertRoute("/v1/tech-os/leave-requests", "technician_leave_requests", (t, u, d) => ({ technician_id: t, user_id: u, ...d }));
techOsInsertRoute("/v1/tech-os/appraisals", "technician_appraisals", (t, u, d) => ({ technician_id: t, user_id: u, reviewer_id: u, ...d }));
techOsInsertRoute("/v1/tech-os/documents", "technician_documents", (t, u, d) => ({ technician_id: t, user_id: u, ...d }));

workOrdersRouter.post("/v1/tech-os/onboarding-tasks", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({
    tech_id: z.string().min(1),
    user_id: z.string().min(1),
    tasks: z.array(z.object({ name: z.string().min(1), category: z.string().min(1) })).min(1).max(200),
  }).parse(await c.req.json());
  const { data, error } = await (supabase.from("technician_onboarding_tasks") as any).insert(
    body.tasks.map((t) => ({ technician_id: body.tech_id, user_id: body.user_id, task_name: t.name, category: t.category })),
  ).select();
  if (error) throw error;
  return json({ data: data ?? [] }, { status: 201 });
});

workOrdersRouter.patch("/v1/tech-os/onboarding-tasks/:id", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({ completed: z.boolean() }).parse(await c.req.json());
  const { data, error } = await (supabase.from("technician_onboarding_tasks") as any).update({
    is_completed: body.completed,
    completed_at: body.completed ? new Date().toISOString() : null,
  }).eq("id", c.req.param("id")).select();
  if (error) throw error;
  return json({ data: data ?? [] });
});

workOrdersRouter.post("/v1/tech-os/documents/upload", async (c) => {
  const { supabase } = await requireAuth(c);
  const form = await c.req.raw.formData();
  const file = form.get("file");
  const userId = typeof form.get("user_id") === "string" ? (form.get("user_id") as string).trim() : "";
  const techId = typeof form.get("tech_id") === "string" ? (form.get("tech_id") as string).trim() : "";
  if (!(file instanceof File)) throw new ApiError(400, "A file upload is required", "file_required");
  if (!userId || !techId) throw new ApiError(400, "user_id and tech_id are required", "tech_document_params_required");
  const fileExt = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const fileName = `${userId}/${techId}/${Date.now()}.${fileExt}`;
  const { error } = await supabase.storage.from("technician-hr").upload(fileName, file);
  if (error) throw error;
  const { data } = supabase.storage.from("technician-hr").getPublicUrl(fileName);
  return json({ data: { public_url: data.publicUrl, path: fileName } }, { status: 201 });
});

// ===========================================================================
// Phase 2 (continued) — endpoints added to close frontend + offline gaps.
// ===========================================================================

// ---------------------------------------------------------------------------
// Offline gap 1 — idempotent warehouse → van inventory transfer.
//
// The offline outbox queues `{ itemId, vanId, quantity }` with the replay key
// `inventory-transfer-${vanId}-${itemId}-${quantity}` and needs a call that
// can never double-apply on replay. `transfer_inventory_stock` already
// dedupes on `inventory_movements.reference_id` (unique partial index on
// (workspace_id, reference_id)), so this endpoint exists to expose that
// idempotency contract with the van-oriented payload shape the outbox
// replays — the idempotency key is required, never generated server-side.
// ---------------------------------------------------------------------------

workOrdersRouter.post("/v1/inventory/transfer-to-van", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({
    item_id: z.string().min(1),
    van_id: z.string().min(1),
    quantity: z.number().positive(),
    idempotency_key: z.string().min(1),
  }).parse(await c.req.json());
  const { error } = await (supabase.rpc as any)("transfer_inventory_stock", {
    p_item_id: body.item_id,
    p_to_location_id: body.van_id,
    p_quantity: body.quantity,
    p_idempotency_key: body.idempotency_key,
  });
  if (error) throw error;
  return json({ data: { ok: true, idempotency_key: body.idempotency_key } });
});

// ---------------------------------------------------------------------------
// Offline gap 2 — fleet work-order pull.
//
// GET /v1/fleet/dispatcher-work-orders returns appointments, not
// fleet_work_orders rows. The offline pull needs the canonical
// fleet_work_orders table. The table is user-scoped (no workspace_id
// column); identity comes from the auth token. Paginated `{ data,
// pagination }` to match the offline fetchAllPages contract.
// ---------------------------------------------------------------------------

workOrdersRouter.get("/v1/fleet/work-orders", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { limit, offset } = paginationSchema.parse(Object.fromEntries(new URL(c.req.url).searchParams));
  const { data, error } = await (supabase.from("fleet_work_orders") as any)
    .select("id,order_number,status,priority,scheduled_date,service_type,po_number,total,fleet_vehicle_id,fleet_client_id,updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return json({ data: data ?? [], pagination: { limit, offset } });
});

// ---------------------------------------------------------------------------
// Technicians — GET /v1/technicians (user-scoped list), DELETE
// /v1/tech-os/technicians/:id. The legacy /v1/team/members routes serve the
// workspace-scoped team_members table; the team-members frontend module
// reads the user-scoped technicians table instead.
// ---------------------------------------------------------------------------

workOrdersRouter.get("/v1/technicians", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const userId = z.string().min(1).parse(new URL(c.req.url).searchParams.get("user_id") ?? "");
  if (userId !== user.id) throw new ApiError(403, "You can only list your own technicians", "technicians_forbidden");
  const { data, error } = await (supabase.from("technicians") as any)
    .select("*").eq("user_id", userId).order("name", { ascending: true });
  if (error) throw error;
  return json({ data: data ?? [] });
});

workOrdersRouter.delete("/v1/tech-os/technicians/:id", async (c) => {
  const { supabase } = await requireAuth(c);
  const { error } = await (supabase.from("technicians") as any).delete().eq("id", c.req.param("id"));
  if (error) throw error;
  return json({ data: { ok: true } });
});

// ---------------------------------------------------------------------------
// Service records search for linking — GET /v1/service-records/search-for-linking
//
// The CRM ↔ Assets linkage searches service *records* (with customer names),
// not the service catalog. Returns the raw bundle; the caller filters by
// term client-side.
// ---------------------------------------------------------------------------

workOrdersRouter.get("/v1/service-records/search-for-linking", async (c) => {
  const { supabase } = await requireAuth(c);
  const params = new URL(c.req.url).searchParams;
  const workspaceId = z.string().uuid().parse(params.get("workspace_id") ?? "");
  const limit = Math.min(Math.max(Number(params.get("limit") ?? 25) || 25, 1), 200);
  const { data, error } = await (supabase.from("service_records") as any)
    .select("id,customer_id,work_performed,metadata,completed_at,created_at,customers(first_name,last_name,company_name)")
    .eq("workspace_id", workspaceId)
    .neq("status", "voided")
    .order("completed_at", { ascending: false, nullsFirst: false })
    .limit(Math.max(limit * 4, limit));
  if (error) throw error;
  return json({ data: data ?? [] });
});

// ---------------------------------------------------------------------------
// Shop pricing operational settings — GET/PUT
// /v1/shop-pricing/operational-settings
//
// The shop-pricing frontend module reads/writes
// workspace_settings.operational_settings (labor rate, markups), a different
// store from the shop_pricing_rules table served by GET/PUT /v1/shop-pricing.
// ---------------------------------------------------------------------------

const operationalSettingsSchema = z.object({
  workspace_id: z.string().uuid(),
  operational_settings: z.record(z.string(), z.unknown()),
});

workOrdersRouter.get("/v1/shop-pricing/operational-settings", async (c) => {
  const { supabase } = await requireAuth(c);
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id") ?? "");
  const { data, error } = await (supabase.from("workspace_settings") as any)
    .select("operational_settings").eq("workspace_id", workspaceId).maybeSingle();
  if (error) throw error;
  return json({ data: data?.operational_settings ?? {} });
});

workOrdersRouter.put("/v1/shop-pricing/operational-settings", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = operationalSettingsSchema.parse(await c.req.json());
  const { data, error } = await (supabase.from("workspace_settings") as any)
    .upsert(
      { workspace_id: body.workspace_id, operational_settings: body.operational_settings },
      { onConflict: "workspace_id" },
    )
    .select("workspace_id")
    .single();
  if (error) throw error;
  return json({ data: data ?? { workspace_id: body.workspace_id } });
});

// ---------------------------------------------------------------------------
// Service catalog — GET/POST /v1/catalog/items, GET/PATCH/DELETE
// /v1/catalog/items/:id
//
// The catalog admin frontend manages the full service_catalog table
// (including inactive rows and raw metadata), which the active-only
// vehicles-router list does not serve. Rows are accepted as pre-built
// records: the client owns the metadata merge semantics.
// ---------------------------------------------------------------------------

workOrdersRouter.get("/v1/catalog/items", async (c) => {
  const { supabase } = await requireAuth(c);
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id") ?? "");
  const { data, error } = await (supabase.from("service_catalog") as any)
    .select("id,workspace_id,name,description,category,estimated_minutes,labor_price,is_active,created_at,metadata")
    .eq("workspace_id", workspaceId).order("name");
  if (error) throw error;
  return json({ data: data ?? [] });
});

workOrdersRouter.get("/v1/catalog/items/:id", async (c) => {
  const { supabase } = await requireAuth(c);
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id") ?? "");
  const { data, error } = await (supabase.from("service_catalog") as any)
    .select("*").eq("workspace_id", workspaceId).eq("id", c.req.param("id")).maybeSingle();
  if (error) throw error;
  return json({ data: data ?? null });
});

workOrdersRouter.post("/v1/catalog/items", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({
    workspace_id: z.string().uuid(),
    rows: z.array(z.record(z.string(), z.unknown())).min(1).max(500),
  }).parse(await c.req.json());
  const { data, error } = await (supabase.from("service_catalog") as any)
    .insert(body.rows.map((row) => ({ ...row, workspace_id: body.workspace_id })))
    .select("id");
  if (error) throw error;
  return json({ data: { count: (data ?? []).length } }, { status: 201 });
});

workOrdersRouter.patch("/v1/catalog/items/:id", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({
    workspace_id: z.string().uuid(),
    row: z.record(z.string(), z.unknown()),
  }).parse(await c.req.json());
  const { error } = await (supabase.from("service_catalog") as any)
    .update(body.row).eq("workspace_id", body.workspace_id).eq("id", c.req.param("id"));
  if (error) throw error;
  return json({ data: { ok: true } });
});

workOrdersRouter.delete("/v1/catalog/items/:id", async (c) => {
  const { supabase } = await requireAuth(c);
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id") ?? "");
  const { error } = await (supabase.from("service_catalog") as any)
    .delete().eq("workspace_id", workspaceId).eq("id", c.req.param("id"));
  if (error) throw error;
  return json({ data: { ok: true } });
});

// ---------------------------------------------------------------------------
// Service record full detail — GET /v1/service-records/:id/detail-full
//
// The service-detail frontend module assembles customer, vehicle, line
// items, specs, settings, workspace, appointment, and first catalog item
// around a service record. This endpoint returns all raw pieces in one
// round trip; the client keeps its mapping/adapter logic. Returns
// `{ data: null }` when the record does not exist.
// ---------------------------------------------------------------------------

workOrdersRouter.get("/v1/service-records/:id/detail-full", async (c) => {
  const { supabase } = await requireAuth(c);
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id") ?? "");
  const serviceId = c.req.param("id");
  const { data: service, error: serviceError } = await (supabase.from("service_records") as any)
    .select("*").eq("workspace_id", workspaceId).eq("id", serviceId).maybeSingle();
  if (serviceError) throw serviceError;
  if (!service) return json({ data: null });

  const [customerRes, vehicleRes, linesRes, settingsRes, workspaceRes, appointmentRes] = await Promise.all([
    service.customer_id
      ? (supabase.from("customers") as any).select("*").eq("workspace_id", workspaceId).eq("id", service.customer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    service.vehicle_id
      ? (supabase.from("vehicles") as any).select("*").eq("workspace_id", workspaceId).eq("id", service.vehicle_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    (supabase.from("service_record_line_items") as any)
      .select("id,item_type,description,quantity,unit_price,total_price,labor_hours,labor_rate,metadata,created_at")
      .eq("workspace_id", workspaceId).eq("service_record_id", serviceId).order("sort_order"),
    (supabase.from("workspace_settings") as any).select("email").eq("workspace_id", workspaceId).maybeSingle(),
    (supabase.from("workspaces") as any).select("name").eq("id", workspaceId).maybeSingle(),
    service.appointment_id
      ? (supabase.from("appointments") as any)
          .select("id,customer_id,vehicle_id,metadata,notes,starts_at")
          .eq("workspace_id", workspaceId).eq("id", service.appointment_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const error = customerRes.error || vehicleRes.error || linesRes.error || settingsRes.error || workspaceRes.error || appointmentRes.error;
  if (error) throw error;

  let specs: unknown = null;
  if (service.vehicle_id) {
    const specRes = await (supabase.from("vehicle_service_specs") as any)
      .select("engine,oil_type,oil_capacity,oil_filter,metadata")
      .eq("workspace_id", workspaceId).eq("vehicle_id", service.vehicle_id)
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (specRes.error) throw specRes.error;
    specs = specRes.data ?? null;
  }

  let fallbackCustomer: unknown = null;
  if (!customerRes.data && appointmentRes.data?.customer_id) {
    const fallbackRes = await (supabase.from("customers") as any).select("*")
      .eq("workspace_id", workspaceId).eq("id", appointmentRes.data.customer_id).maybeSingle();
    if (fallbackRes.error) throw fallbackRes.error;
    fallbackCustomer = fallbackRes.data ?? null;
  }

  let firstAppointmentItem: unknown = null;
  if (service.appointment_id) {
    const itemRes = await (supabase.from("appointment_items") as any)
      .select("service_catalog_id,description,quantity,unit_price,service_catalog(name,description,estimated_duration)")
      .eq("workspace_id", workspaceId).eq("appointment_id", service.appointment_id)
      .order("created_at").limit(1);
    if (itemRes.error) throw itemRes.error;
    firstAppointmentItem = (itemRes.data ?? [])[0] ?? null;
  }

  return json({
    data: {
      service,
      customer: customerRes.data ?? null,
      vehicle: vehicleRes.data ?? null,
      line_items: linesRes.data ?? [],
      workspace_email: settingsRes.data?.email ?? "",
      workspace_name: workspaceRes.data?.name ?? "",
      appointment: appointmentRes.data ?? null,
      fallback_customer: fallbackCustomer,
      vehicle_specs: specs,
      first_appointment_item: firstAppointmentItem,
    },
  });
});

// ---------------------------------------------------------------------------
// Repair pricing (shop tables) — the shop-facing repair-pricing module reads
// the legacy service_catalog_benchmarks / quote_requests tables, not the
// benchmark_pricing / price_quote_requests tables served above.
// ---------------------------------------------------------------------------

workOrdersRouter.get("/v1/repair-pricing/catalog-benchmarks", async (c) => {
  const { supabase } = await requireAuth(c);
  const { data, error } = await (supabase.from("service_catalog_benchmarks") as any)
    .select("*").order("captured_at", { ascending: false });
  if (error) throw error;
  return json({ data: data ?? [] });
});

workOrdersRouter.post("/v1/repair-pricing/catalog-benchmarks", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({
    user_id: z.string().min(1),
    service_catalog_id: z.string().min(1),
    vin: z.string().nullable(),
    vehicle_label: z.string().nullable(),
    repair_title: z.string().min(1),
    independent_low: z.number(), independent_avg: z.number(), independent_high: z.number(),
    dealer_low: z.number(), dealer_avg: z.number(), dealer_high: z.number(),
    shop_price: z.number().nullable(),
  }).parse(await c.req.json());
  const { data, error } = await (supabase.from("service_catalog_benchmarks") as any).upsert(
    { ...body, captured_at: new Date().toISOString() },
    { onConflict: "service_catalog_id,vin" },
  ).select().single();
  if (error) throw error;
  return json({ data });
});

workOrdersRouter.get("/v1/repair-pricing/shop-quote-requests", async (c) => {
  const { supabase } = await requireAuth(c);
  const { data, error } = await (supabase.from("quote_requests") as any)
    .select("*").order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  return json({ data: data ?? [] });
});

workOrdersRouter.patch("/v1/repair-pricing/shop-quote-requests/:id", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({
    status: z.string().min(1),
    converted_quote_id: z.string().nullable().optional(),
  }).parse(await c.req.json());
  const { data, error } = await (supabase.from("quote_requests") as any)
    .update({ status: body.status, ...(body.converted_quote_id ? { converted_quote_id: body.converted_quote_id } : {}) })
    .eq("id", c.req.param("id")).select().single();
  if (error) throw error;
  return json({ data });
});

// ---------------------------------------------------------------------------
// Vehicle lookup by VIN — GET /v1/vehicles/by-vin
//
// The service-record form resolves a vehicle id from a VIN (excluding
// archived vehicles). The vehicles-router list has no VIN filter, so this
// lookup lives here.
// ---------------------------------------------------------------------------

workOrdersRouter.get("/v1/vehicles/by-vin", async (c) => {
  const { supabase } = await requireAuth(c);
  const params = new URL(c.req.url).searchParams;
  const workspaceId = z.string().uuid().parse(params.get("workspace_id") ?? "");
  const vin = z.string().min(1).parse((params.get("vin") ?? "").trim().toUpperCase());
  const { data, error } = await (supabase.from("vehicles") as any)
    .select("id").eq("workspace_id", workspaceId).eq("vin", vin).neq("status", "archived").maybeSingle();
  if (error) throw error;
  return json({ data: data ?? null });
});

// ---------------------------------------------------------------------------
// Technician tracking — GET /v1/tech-os/tracking-dispatch-jobs
//                      GET /v1/tech-os/location-history
//
// The legacy tracking board joined the user-scoped technicians table to
// open assigned appointments. Both reads are user-scoped here (the caller's
// own technicians); location_history is a retired table and returns [] when
// it no longer exists.
// ---------------------------------------------------------------------------

workOrdersRouter.get("/v1/tech-os/tracking-dispatch-jobs", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data: technicians, error: techError } = await (supabase.from("technicians") as any)
    .select("id,auth_user_id").eq("user_id", user.id);
  if (techError) throw techError;
  const byAuth = new Map<string, string>(
    ((technicians ?? []) as Array<{ id: string; auth_user_id: string | null }>)
      .filter((t) => t.auth_user_id).map((t) => [t.auth_user_id as string, t.id]),
  );
  const authIds = Array.from(byAuth.keys());
  let appointments: any[] = [];
  if (authIds.length > 0) {
    const { data, error } = await (supabase.from("appointments") as any)
      .select("id,starts_at,ends_at,status,assigned_user_id,location_lat,location_lng,location_address,metadata,customers(first_name,last_name,company_name),vehicles(year,make,model)")
      .in("assigned_user_id", authIds)
      .not("status", "in", "(cancelled,completed,no_show)")
      .order("starts_at", { ascending: true });
    if (error) throw error;
    appointments = data ?? [];
  }
  const customerName = (customer: any): string | null => {
    if (!customer) return null;
    return customer.company_name
      || [customer.first_name, customer.last_name].filter(Boolean).join(" ") || null;
  };
  const data = appointments.map((row: any) => {
    const m = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown> : {};
    const start = row.starts_at ? new Date(row.starts_at) : null;
    return {
      ...row,
      scheduled_date: row.starts_at ? String(row.starts_at).slice(0, 10) : null,
      scheduled_time: start && !Number.isNaN(start.getTime()) ? start.toISOString().slice(11, 19) : null,
      dispatch_status: typeof m.dispatch_status === "string" ? m.dispatch_status : row.status,
      assigned_technician_id: row.assigned_user_id ? byAuth.get(row.assigned_user_id) ?? null : null,
      customer: row.customers ? { name: customerName(row.customers) } : null,
      service_catalog: { name: String(m.service_name ?? m.title ?? "Service") },
    };
  });
  return json({ data });
});

workOrdersRouter.get("/v1/tech-os/location-history", async (c) => {
  const { supabase } = await requireAuth(c);
  const technicianId = z.string().min(1).parse(
    new URL(c.req.url).searchParams.get("technician_id") ?? "",
  );
  const { data, error } = await (supabase.from("location_history") as any)
    .select("*").eq("technician_id", technicianId)
    .order("recorded_at", { ascending: false }).limit(50);
  if (error) throw error;
  return json({ data: data ?? [] });
});

// ---------------------------------------------------------------------------
// Job runtime bundle — GET /v1/jobs/:id/runtime
//
// The job-runtime view joins an appointment to its items, service record,
// invoice, payments, and execution checklist. All of those are workspace-
// scoped off the appointment's own workspace_id, so the bundle is fetched in
// one round trip and the client keeps its mapping/authorization logic.
// ---------------------------------------------------------------------------

workOrdersRouter.get("/v1/jobs/:id/runtime", async (c) => {
  const { supabase } = await requireAuth(c);
  const jobId = c.req.param("id");

  const { data: appointment, error: appointmentError } = await (supabase as any)
    .from("appointments")
    .select("id,workspace_id,customer_id,vehicle_id,status,starts_at,ends_at,assigned_user_id,metadata,created_at,updated_at,customers(id,first_name,last_name,phone,email),vehicles(id,vin,year,make,model)")
    .eq("id", jobId)
    .maybeSingle();
  if (appointmentError) throw appointmentError;
  if (!appointment) return json({ data: null });

  const workspaceId = appointment.workspace_id as string;
  const [itemsResult, serviceResult, invoiceResult, paymentsResult, checklistResult] = await Promise.all([
    (supabase as any).from("appointment_items")
      .select("service_catalog_id,description,quantity,unit_price,item_type")
      .eq("workspace_id", workspaceId).eq("appointment_id", jobId).order("sort_order"),
    (supabase as any).from("service_records")
      .select("id,subtotal,tax_amount,total_amount,status,started_at,completed_at,metadata")
      .eq("workspace_id", workspaceId).eq("appointment_id", jobId).neq("status", "voided").maybeSingle(),
    (supabase as any).from("invoices")
      .select("id,status,subtotal,tax_total,total,amount_paid,metadata")
      .eq("workspace_id", workspaceId).eq("metadata->>appointment_id", jobId)
      .neq("status", "void").order("created_at", { ascending: true }).limit(1).maybeSingle(),
    (supabase as any).from("payments")
      .select("amount,status,metadata")
      .eq("workspace_id", workspaceId).eq("metadata->>appointment_id", jobId),
    (supabase as any).from("job_execution_checklists")
      .select("status,is_required,step_name")
      .eq("job_id", jobId).eq("job_source", "appointment"),
  ]);
  for (const result of [itemsResult, serviceResult, invoiceResult, paymentsResult, checklistResult]) {
    if (result.error) throw result.error;
  }
  return json({
    data: {
      appointment,
      items: itemsResult.data ?? [],
      service: serviceResult.data ?? null,
      invoice: invoiceResult.data ?? null,
      payments: paymentsResult.data ?? [],
      checklist: checklistResult.data ?? [],
    },
  });
});

// ---------------------------------------------------------------------------
// Job thread timeline by id — GET /v1/job-threads/timeline-by-id
//
// The timeline subscriber only knows the thread id (not the job id/source),
// so this returns the same bundle as /v1/job-threads/timeline keyed by
// thread id for change polling.
// ---------------------------------------------------------------------------

workOrdersRouter.get("/v1/job-threads/timeline-by-id", async (c) => {
  const { supabase } = await requireAuth(c);
  const threadId = z.string().min(1).parse(new URL(c.req.url).searchParams.get("thread_id") ?? "");
  const [messagesRes, eventsRes, exceptionsRes] = await Promise.all([
    (supabase.from("job_thread_messages") as any)
      .select("id, thread_id, sender_id, sender_role, content, attachments, channel, recipient, created_at, job_message_deliveries(status, last_error, delivered_at)")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true }),
    (supabase.from("job_thread_events") as any)
      .select("id, thread_id, event_type, metadata, created_at, created_by")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true }),
    (supabase.from("job_thread_exceptions") as any)
      .select("id, thread_id, exception_type, note, attachments, created_at, created_by")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true }),
  ]);
  const error = messagesRes.error || eventsRes.error || exceptionsRes.error;
  if (error) throw error;
  return json({
    data: {
      thread_id: threadId,
      messages: messagesRes.data ?? [],
      events: eventsRes.data ?? [],
      exceptions: exceptionsRes.data ?? [],
    },
  });
});

// ---------------------------------------------------------------------------
// Technician roster members — GET /v1/tech-os/roster-members
//
// The Technician Hub roster reads workspace_members (technician/owner/
// manager roles) joined to profiles, then joins today's operational jobs
// client-side. Distinct from /v1/tech-os/roster, which reads team_members.
// ---------------------------------------------------------------------------

workOrdersRouter.get("/v1/tech-os/roster-members", async (c) => {
  const params = new URL(c.req.url).searchParams;
  const workspaceId = z.string().uuid().parse(params.get("workspace_id") ?? "");
  const { supabase: wsSupabase } = await requireWorkspaceAuth(c, workspaceId);
  const roles = (params.get("roles") ?? "technician,owner,manager")
    .split(",").map((r) => r.trim()).filter(Boolean);
  const { data, error } = await (wsSupabase as any).from("workspace_members")
    .select("user_id,role,is_active,profiles!workspace_members_user_id_fkey(display_name,phone,avatar_url)")
    .eq("workspace_id", workspaceId)
    .in("role", roles)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return json({ data: data ?? [] });
});

// ---------------------------------------------------------------------------
// Technician app — /v1/tech-app/*
//
// The tech-app reads are technician-scoped (via the caller's auth identity)
// and were previously direct Supabase reads/RPCs from the browser. They live
// here as thin endpoints; row mapping stays client-side.
// ---------------------------------------------------------------------------

function unauthenticatedTechContext() {
  const now = new Date().toISOString();
  return {
    user_id: "",
    workspace_user_id: "",
    technician_id: null,
    technician_name: "Technician",
    role: "technician",
    is_admin_preview: false,
    access_state: "unauthenticated",
    presence_state: "off_shift",
    field_status: null,
    shift_id: null,
    shift_status: null,
    clock_in: null,
    van_id: null,
    van_name: null,
    push_notifications_enabled: true,
    data_fresh_at: now,
  };
}

function shouldUseTechnicianContextFallback(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    code === "PGRST202" ||
    message.includes("get_technician_app_context_v1") ||
    message.includes('record "v_shift" is not assigned yet') ||
    message.includes('record "v_van" is not assigned yet')
  );
}

workOrdersRouter.post("/v1/tech-app/context", async (c) => {
  let auth: Awaited<ReturnType<typeof requireAuth>>;
  try {
    auth = await requireAuth(c);
  } catch {
    return json({ data: unauthenticatedTechContext() });
  }
  const { supabase, user } = auth;
  const { data, error } = await (supabase.rpc as any)("get_technician_app_context_v1");
  if (!error && data) return json({ data });
  if (!shouldUseTechnicianContextFallback(error)) throw error;

  // Fallback: assemble the context from the underlying tables.
  const now = new Date().toISOString();
  const { data: tech } = await (supabase as any)
    .from("technicians")
    .select("id, user_id, name, status, auth_user_id, invitation_id, is_active")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!tech) {
    return json({
      data: {
        ...unauthenticatedTechContext(),
        user_id: user.id,
        workspace_user_id: user.id,
        technician_name: "Workspace Preview",
        role: "admin",
        is_admin_preview: true,
        access_state: "admin_preview",
        data_fresh_at: now,
      },
    });
  }
  const [shiftResult, vanResult, preferencesResult] = await Promise.all([
    (supabase as any)
      .from("time_clock_entries")
      .select("id, clock_in, status")
      .eq("user_id", user.id)
      .in("status", ["active", "on_break"])
      .order("clock_in", { ascending: false })
      .limit(1)
      .maybeSingle(),
    (supabase as any)
      .from("vans")
      .select("id, name")
      .eq("assigned_technician_id", tech.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle(),
    (supabase as any)
      .from("technician_notification_preferences")
      .select("push_notifications_enabled")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  const shift = shiftResult.data as { id: string; clock_in: string | null; status: string | null } | null;
  const van = vanResult.data as { id: string; name: string | null } | null;
  const preferences = preferencesResult.data as { push_notifications_enabled: boolean | null } | null;
  const accessState = tech.is_active === false ? "deactivated" : "linked";
  const presenceState = accessState === "deactivated"
    ? "deactivated"
    : !shift
      ? "off_shift"
      : shift.status === "on_break"
        ? "on_break"
        : ["en_route", "arrived", "in_progress"].includes(tech.status ?? "")
          ? tech.status ?? "available"
          : "available";
  return json({
    data: {
      user_id: user.id,
      workspace_user_id: tech.user_id,
      technician_id: tech.id,
      technician_name: tech.name || "Technician",
      role: "technician",
      is_admin_preview: false,
      access_state: accessState,
      presence_state: presenceState,
      field_status: tech.status,
      shift_id: shift?.id ?? null,
      shift_status: shift?.status ?? null,
      clock_in: shift?.clock_in ?? null,
      van_id: van?.id ?? null,
      van_name: van?.name ?? null,
      push_notifications_enabled: preferences?.push_notifications_enabled ?? true,
      data_fresh_at: now,
    },
  });
});

workOrdersRouter.post("/v1/tech-app/job-workspace", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({ job_id: z.string().min(1) }).parse(await c.req.json());
  const { data, error } = await (supabase.rpc as any)("get_technician_job_workspace_v1", { p_job_id: body.job_id });
  if (error) throw error;
  return json({ data: data ?? null });
});

workOrdersRouter.post("/v1/tech-app/session", async (c) => {
  const { supabase } = await requireAuth(c);
  const { data, error } = await (supabase.rpc as any)("get_technician_session_v2");
  if (error) throw error;
  return json({ data: data ?? null });
});

workOrdersRouter.post("/v1/tech-app/job-workspace-v2", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({ job_id: z.string().min(1) }).parse(await c.req.json());
  const { data, error } = await (supabase.rpc as any)("get_technician_job_workspace_v2", { p_job_id: body.job_id });
  if (error) throw error;
  return json({ data: data ?? null });
});

workOrdersRouter.get("/v1/tech-app/technician-id", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await (supabase as any)
    .from("technicians").select("id").eq("auth_user_id", user.id).maybeSingle();
  if (error) throw error;
  return json({ data: (data as { id?: string } | null)?.id ?? null });
});

workOrdersRouter.get("/v1/tech-app/more-data", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const [techResult, clockResult] = await Promise.all([
    (supabase as any)
      .from("technicians")
      .select("id, name, email, status, performance_score, vans(name)")
      .eq("auth_user_id", user.id)
      .single(),
    (supabase as any)
      .from("time_clock_entries")
      .select("id, clock_in, status")
      .eq("user_id", user.id)
      .in("status", ["active", "on_break"])
      .order("clock_in", { ascending: false })
      .limit(1),
  ]);
  if (techResult.error) throw techResult.error;
  if (clockResult.error) throw clockResult.error;
  return json({
    data: {
      tech: techResult.data ?? null,
      clockEntry: (clockResult.data as any[])?.[0] ?? null,
    },
  });
});

workOrdersRouter.get("/v1/tech-app/clock-entries", async (c) => {
  const { supabase } = await requireAuth(c);
  const params = new URL(c.req.url).searchParams;
  const userId = z.string().min(1).parse(params.get("user_id") ?? "");
  const from = z.string().min(1).parse(params.get("from") ?? "");
  const { data, error } = await (supabase as any)
    .from("time_clock_entries")
    .select("clock_in, clock_out")
    .eq("user_id", userId)
    .gte("clock_in", from);
  if (error) throw error;
  return json({ data: data ?? [] });
});

workOrdersRouter.get("/v1/tech-app/inventory", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data: tech, error: techError } = await (supabase as any)
    .from("technicians").select("id").eq("auth_user_id", user.id).maybeSingle();
  if (techError) throw techError;
  if (!tech) return json({ data: { vanId: null, vanName: "", items: [] } });
  const { data: vanData, error: vanError } = await (supabase as any)
    .from("vans").select("id, name").eq("assigned_technician_id", tech.id).limit(1).maybeSingle();
  if (vanError) throw vanError;
  if (!vanData) return json({ data: { vanId: null, vanName: "", items: [] } });
  const { data, error } = await (supabase as any)
    .from("van_inventory")
    .select("id, quantity, min_quantity, inventory_items(id, name, sku, category, unit_cost)")
    .eq("van_id", vanData.id);
  if (error) throw error;
  return json({ data: { vanId: vanData.id, vanName: vanData.name, items: data ?? [] } });
});

workOrdersRouter.get("/v1/tech-app/profile", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data: techData, error: techError } = await (supabase as any)
    .from("technicians")
    .select("id, name, email, phone, status, performance_score, customer_rating_avg, vans(name)")
    .eq("auth_user_id", user.id)
    .single();
  if (techError) throw techError;
  if (!techData) return json({ data: { tech: null, skills: [] } });
  const { data: skillsData, error: skillsError } = await (supabase as any)
    .from("technician_skills")
    .select("id, skill_type, certification_level, is_active")
    .eq("is_active", true)
    .eq("technician_id", techData.id);
  if (skillsError) throw skillsError;
  return json({
    data: {
      tech: { ...techData, total_jobs_completed: null },
      skills: skillsData ?? [],
    },
  });
});

workOrdersRouter.get("/v1/tech-app/notification-settings", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await (supabase as any)
    .from("technician_notification_preferences")
    .select("push_notifications_enabled, dispatch_push_enabled, customer_sms_enabled, customer_email_enabled, offline_cache_enabled")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return json({ data: data ?? null });
});

workOrdersRouter.get("/v1/tech-app/messages-data", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data: techData, error: techError } = await (supabase as any)
    .from("technicians").select("id").eq("auth_user_id", user.id).single();
  if (techError) throw techError;
  if (!techData) {
    return json({
      data: {
        techId: null, humanMessages: [], statusNotes: [], activeJobs: [],
        activeJobsError: null, eventsError: null, notesError: null,
      },
    });
  }
  const [eventsRes, activeJobsRes, notesRes] = await Promise.all([
    (supabase as any)
      .from("dispatch_events")
      .select("id, appointment_id, event_type, notes, created_at, performed_by")
      .eq("technician_id", techData.id)
      .eq("event_type", "note_added")
      .order("created_at", { ascending: false })
      .limit(40),
    (supabase as any)
      .from("appointments")
      .select("id, title, scheduled_date, scheduled_time, dispatch_status, status")
      .eq("assigned_technician_id", techData.id)
      .not("status", "in", "(completed,cancelled)")
      .or("dispatch_status.is.null,dispatch_status.not.in.(completed,cancelled)")
      .order("scheduled_date", { ascending: true })
      .order("scheduled_time", { ascending: true })
      .limit(25),
    (supabase as any)
      .from("appointments")
      .select("id, dispatch_notes, updated_at, dispatch_status, status")
      .eq("assigned_technician_id", techData.id)
      .not("dispatch_notes", "is", null)
      .order("updated_at", { ascending: false })
      .limit(40),
  ]);
  return json({
    data: {
      techId: techData.id,
      humanMessages: eventsRes.data ?? [],
      statusNotes: notesRes.data ?? [],
      activeJobs: activeJobsRes.data ?? [],
      activeJobsError: activeJobsRes.error ? String(activeJobsRes.error.message ?? activeJobsRes.error) : null,
      eventsError: eventsRes.error ? String(eventsRes.error.message ?? eventsRes.error) : null,
      notesError: notesRes.error ? String(notesRes.error.message ?? notesRes.error) : null,
    },
  });
});

workOrdersRouter.get("/v1/tech-app/job-detail", async (c) => {
  const { supabase } = await requireAuth(c);
  const jobId = z.string().min(1).parse(new URL(c.req.url).searchParams.get("job_id") ?? "");

  // The canonical workspace RPC is the ONLY authority for which table a job
  // lives in. A failing RPC surfaces an explicit error instead of silently
  // widening data access.
  const { data: wsData, error: wsError } = await (supabase.rpc as any)(
    "get_technician_job_workspace_v1", { p_job_id: jobId },
  );
  if (wsError) throw wsError;
  const source = (wsData as { source?: string } | null)?.source;
  if (!source) throw new ApiError(404, "Job access could not be resolved for this technician.", "job_unresolved");

  let job: Record<string, unknown> | null = null;
  let services: unknown[] = [];
  let servicesError: string | null = null;
  let photos: unknown[] = [];
  let photosError: string | null = null;

  if (source !== "fleet_work_order") {
    const { data, error } = await (supabase as any)
      .from("appointments")
      .select(`
        id, scheduled_date, scheduled_time, estimated_duration_minutes,
        dispatch_status, job_priority, status, location_address, location_lat, location_lng,
        notes, dispatch_notes, estimated_cost, payment_status,
        user_id, customer_id, vehicle_id,
        customers(name, phone, email),
        vehicles(year, make, model, color, vin, license_plate),
        service_catalog(name),
        technicians(id, name),
        vans(name)
      `)
      .eq("id", jobId)
      .maybeSingle();
    if (!error && data) {
      job = { ...data, is_fleet: false };
      const [servicesResult, photosResult] = await Promise.all([
        (supabase as any)
          .from("appointment_services")
          .select("id, quantity, is_prepaid, service_catalog(name, price)")
          .eq("appointment_id", jobId),
        (supabase as any)
          .from("job_photos")
          .select("id, photo_type, storage_path, file_name, created_at")
          .eq("appointment_id", jobId)
          .order("created_at", { ascending: false }),
      ]);
      services = servicesResult.data ?? [];
      servicesError = servicesResult.error ? String(servicesResult.error.message ?? servicesResult.error) : null;
      photos = photosResult.data ?? [];
      photosError = photosResult.error ? String(photosResult.error.message ?? photosResult.error) : null;
    }
  }

  if (!job && source !== "appointment") {
    const { data: f, error } = await (supabase as any)
      .from("fleet_work_orders")
      .select(`
        id, scheduled_date, scheduled_time, status, priority, service_type, description, notes, technician_notes,
        fleet_client_id, fleet_vehicle_id, fleet_location_id, user_id,
        fleet_clients(company_name, phone),
        fleet_vehicles(year, make, model, color, vin, license_plate, mileage),
        fleet_locations(address, name, latitude, longitude),
        technicians(id, name),
        vans(name)
      `)
      .eq("id", jobId)
      .maybeSingle();
    if (!error && f) {
      job = {
        id: f.id,
        scheduled_date: f.scheduled_date,
        scheduled_time: f.scheduled_time,
        estimated_duration_minutes: 60,
        dispatch_status: f.status,
        status: f.status,
        job_priority: f.priority,
        location_address: f.fleet_locations?.address || f.fleet_locations?.name,
        location_lat: f.fleet_locations?.latitude ?? null,
        location_lng: f.fleet_locations?.longitude ?? null,
        notes: f.technician_notes,
        dispatch_notes: f.description,
        estimated_cost: null,
        payment_status: null,
        user_id: f.user_id,
        customer_id: null,
        vehicle_id: f.fleet_vehicle_id,
        customers: { name: f.fleet_clients?.company_name, phone: f.fleet_clients?.phone, email: null },
        vehicles: f.fleet_vehicles,
        service_catalog: { name: f.service_type || "Fleet Service" },
        technicians: f.technicians,
        vans: f.vans,
        is_fleet: true,
      };
      const { data: lineItems } = await (supabase as any)
        .from("fleet_work_order_line_items")
        .select("id, description, quantity, unit_price")
        .eq("fleet_work_order_id", jobId);
      services = ((lineItems ?? []) as Array<{ id: string; description: string | null; quantity: number | null; unit_price: number | null }>)
        .map((li) => ({
          id: li.id,
          service_catalog: { name: li.description, price: li.unit_price },
          quantity: li.quantity,
          is_prepaid: false,
        }));
    }
  }

  return json({
    data: {
      job,
      jobError: job ? null : "Job not found",
      services,
      servicesError,
      photos,
      photosError,
    },
  });
});

workOrdersRouter.get("/v1/tech-app/fleet-assignments", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const params = new URL(c.req.url).searchParams;
  const techId = params.get("tech_id") || null;
  const isAdmin = params.get("is_admin") === "true";
  const scopeUserId = params.get("user_id") || null;
  let query = (supabase as any)
    .from("fleet_work_orders")
    .select(`id, order_number, scheduled_date, scheduled_time, status, priority, service_type, description, total, fleet_job_id,
       fleet_jobs(job_number),
       fleet_clients(company_name),
       fleet_locations(name, address),
       fleet_vehicles(year, make, model, unit_number, license_plate)`)
    .order("scheduled_date", { ascending: true })
    .order("scheduled_time", { ascending: true })
    .limit(200);
  if (techId && !isAdmin) {
    query = query.eq("assigned_technician_id", techId);
  } else if (scopeUserId) {
    query = query.eq("user_id", scopeUserId);
  } else {
    query = query.eq("user_id", user.id);
  }
  const { data, error } = await query;
  if (error) throw error;
  return json({ data: data ?? [] });
});

// ---------------------------------------------------------------------------
// Technician app commands — POST /v1/tech-app/*
//
// Clock, notification preferences, van inventory ledger, restock requests,
// job transitions, job photos, ETA emails, job notes, recommendations, and
// execution steps. All were direct Supabase RPC/table/storage writes from the
// browser; they are thin authenticated endpoints here.
// ---------------------------------------------------------------------------

workOrdersRouter.post("/v1/tech-app/clock-in", async (c) => {
  const { supabase } = await requireAuth(c);
  const { data, error } = await (supabase.rpc as any)("clock_in");
  if (error) throw error;
  return json({ data: data ?? null });
});

workOrdersRouter.post("/v1/tech-app/clock-out", async (c) => {
  const { supabase } = await requireAuth(c);
  const { data, error } = await (supabase.rpc as any)("clock_out");
  if (error) throw error;
  return json({ data: data ?? null });
});

workOrdersRouter.post("/v1/tech-app/notification-settings", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const body = z.object({
    push_notifications_enabled: z.boolean(),
    dispatch_push_enabled: z.boolean(),
    customer_sms_enabled: z.boolean(),
    customer_email_enabled: z.boolean(),
    offline_cache_enabled: z.boolean(),
  }).parse(await c.req.json());
  const { data, error } = await (supabase as any)
    .from("technician_notification_preferences")
    .upsert({ user_id: user.id, ...body }, { onConflict: "user_id" })
    .select()
    .single();
  if (error) throw error;
  return json({ data: data ?? null });
});

workOrdersRouter.post("/v1/tech-app/van-inventory-movements", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({
    van_inventory_id: z.string().min(1),
    entry_type: z.enum(["consume", "waste", "return", "restock", "adjust"]),
    quantity: z.number(),
    idempotency_key: z.string().min(1),
    job_id: z.string().nullable().optional(),
    job_source: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
  }).parse(await c.req.json());
  const { data, error } = await (supabase.rpc as any)("record_inventory_movement_v1", {
    p_van_inventory_id: body.van_inventory_id,
    p_entry_type: body.entry_type,
    p_quantity: body.quantity,
    p_idempotency_key: body.idempotency_key,
    p_job_id: body.job_id ?? null,
    p_job_source: body.job_source ?? null,
    p_note: body.note ?? null,
  });
  if (error) throw error;
  return json({ data: data ?? null });
});

// Idempotent inventory transfer for offline-outbox replay —
// POST /v1/tech-app/inventory-transfer. Wraps the transfer_inventory_to_van RPC
// (NOT transfer_inventory_stock, which is workspace/location-based and has no
// idempotency key). The caller's idempotency key is passed through so a
// retried replay resolves to the original ledger entry instead of moving
// stock a second time.
workOrdersRouter.post("/v1/tech-app/inventory-transfer", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({
    item_id: z.string().min(1),
    van_id: z.string().min(1),
    quantity: z.number(),
    idempotency_key: z.string().min(1),
  }).parse(await c.req.json());
  const { data, error } = await (supabase.rpc as any)("transfer_inventory_to_van", {
    p_item_id: body.item_id,
    p_van_id: body.van_id,
    p_quantity: body.quantity,
    p_idempotency_key: body.idempotency_key,
  });
  if (error) throw error;
  return json({ data: data ?? null });
});

workOrdersRouter.post("/v1/tech-app/van-restock-requests", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({
    van_id: z.string().min(1),
    items: z.array(z.object({
      van_inventory_id: z.string().min(1),
      name: z.string().min(1),
      quantity: z.number(),
    })),
    note: z.string().nullable().optional(),
  }).parse(await c.req.json());
  const { data, error } = await (supabase.rpc as any)("create_inventory_restock_request_v1", {
    p_van_id: body.van_id,
    p_items: body.items,
    p_note: body.note ?? null,
  });
  if (error) throw error;
  return json({ data: data ?? null });
});

workOrdersRouter.post("/v1/tech-app/job-transition", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({
    job_id: z.string().min(1),
    source: z.enum(["appointment", "fleet_work_order"]),
    next_status: z.string().min(1),
    notes: z.string().nullable().optional(),
    idempotency_key: z.string().min(1),
    expected_updated_at: z.string().nullable().optional(),
  }).parse(await c.req.json());
  const { data, error } = await (supabase.rpc as any)("technician_transition_job_v1", {
    p_job_id: body.job_id,
    p_source: body.source,
    p_next_status: body.next_status,
    p_notes: body.notes ?? null,
    p_idempotency_key: body.idempotency_key,
    p_expected_updated_at: body.expected_updated_at ?? null,
  });
  if (error) throw error;
  return json({ data: data ?? null });
});

workOrdersRouter.post("/v1/tech-app/job-photos", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const form = await c.req.raw.formData();
  const file = form.get("file");
  const appointmentId = typeof form.get("appointment_id") === "string" ? (form.get("appointment_id") as string).trim() : "";
  const businessUserId = typeof form.get("business_user_id") === "string" ? (form.get("business_user_id") as string).trim() : "";
  const photoType = typeof form.get("photo_type") === "string" ? (form.get("photo_type") as string).trim() : "";
  const isRequired = form.get("is_required") === "true";
  if (!(file instanceof File)) throw new ApiError(400, "A file upload is required", "file_required");
  if (!appointmentId || !businessUserId || !photoType) {
    throw new ApiError(400, "appointment_id, business_user_id, and photo_type are required", "job_photo_params_required");
  }
  const { data: tech } = await (supabase as any)
    .from("technicians").select("id").eq("auth_user_id", user.id).maybeSingle();
  const fileExt = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const storagePath = `${businessUserId}/${appointmentId}/${photoType}-${Date.now()}.${fileExt}`;
  const { error: uploadError } = await supabase.storage
    .from("job-photos")
    .upload(storagePath, file, { contentType: file.type });
  if (uploadError) throw uploadError;
  const { data, error } = await (supabase as any)
    .from("job_photos")
    .insert({
      appointment_id: appointmentId,
      user_id: businessUserId,
      technician_id: tech?.id ?? null,
      photo_type: photoType,
      storage_path: storagePath,
      file_name: file.name,
      file_size: file.size,
      is_required: isRequired,
    })
    .select()
    .single();
  if (error) throw error;
  return json({ data }, { status: 201 });
});

workOrdersRouter.post("/v1/tech-app/send-eta", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({
    appointment_id: z.string().min(1),
    eta_minutes: z.number().nullable().optional(),
    eta_label: z.string().nullable().optional(),
    distance_miles: z.number().nullable().optional(),
    notes: z.string().nullable().optional(),
  }).parse(await c.req.json());
  const { data, error } = await supabase.functions.invoke("send-technician-eta", {
    body: {
      appointmentId: body.appointment_id,
      etaMinutes: body.eta_minutes ?? null,
      etaLabel: body.eta_label ?? null,
      distanceMiles: body.distance_miles ?? null,
      notes: body.notes ?? null,
    },
  });
  if (error) {
    let details = error.message;
    const context = (error as { context?: { text?: () => Promise<string> } }).context;
    if (context?.text) {
      try {
        const raw = await context.text();
        const parsed = JSON.parse(raw) as { error?: string };
        if (parsed?.error) details = parsed.error;
      } catch {
        /* keep original message */
      }
    }
    throw new ApiError(502, details, "eta_failed");
  }
  if ((data as { error?: string } | null)?.error) {
    throw new ApiError(502, (data as { error: string }).error, "eta_failed");
  }
  return json({ data: { deduped: Boolean((data as { deduped?: boolean } | null)?.deduped) } });
});

workOrdersRouter.post("/v1/tech-app/job-notes", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({
    job_id: z.string().min(1),
    notes: z.string(),
    is_fleet: z.boolean().default(false),
  }).parse(await c.req.json());
  if (body.is_fleet) {
    const { data, error } = await (supabase.rpc as any)("save_technician_fleet_job_notes_v1", {
      p_job_id: body.job_id,
      p_notes: body.notes,
    });
    if (error) throw error;
    return json({ data: data ?? null });
  }
  const { data, error } = await (supabase as any)
    .from("appointments")
    .update({ notes: body.notes, updated_at: new Date().toISOString() })
    .eq("id", body.job_id)
    .select();
  if (error) throw error;
  return json({ data: data ?? [] });
});

workOrdersRouter.post("/v1/tech-app/recommendations", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({
    user_id: z.string().min(1),
    customer_id: z.string().nullable().optional(),
    vehicle_id: z.string().nullable().optional(),
    appointment_id: z.string().min(1),
    recommended_service: z.string().min(1),
    estimated_cost: z.number().nullable().optional(),
    urgency: z.string().min(1),
    notes: z.string().nullable().optional(),
  }).parse(await c.req.json());
  const { data, error } = await (supabase as any).from("declined_services").insert({
    user_id: body.user_id,
    customer_id: body.customer_id ?? null,
    vehicle_id: body.vehicle_id ?? null,
    appointment_id: body.appointment_id,
    recommended_service: body.recommended_service,
    estimated_cost: body.estimated_cost ?? null,
    urgency: body.urgency,
    decline_notes: body.notes ?? null,
    declined_at: new Date().toISOString(),
    follow_up_status: "pending",
  }).select().single();
  if (error) throw error;
  return json({ data }, { status: 201 });
});

workOrdersRouter.post("/v1/tech-app/execution-steps/advance", async (c) => {
  const { supabase } = await requireAuth(c);
  const body = z.object({
    step_id: z.string().min(1),
    status: z.enum(["pending", "in_progress", "completed", "blocked"]),
    evidence_url: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  }).parse(await c.req.json());
  const { data, error } = await (supabase.rpc as any)("advance_job_execution_step_v1", {
    p_step_id: body.step_id,
    p_status: body.status,
    p_evidence_url: body.evidence_url ?? null,
    p_notes: body.notes ?? null,
  });
  if (error) throw error;
  return json({ data: data ?? null });
});

// ---------------------------------------------------------------------------
// Inline service writer — GET /v1/workspaces/timezone
//                        POST /v1/inline-writer/appointment-items
//
// The inline writer needs the workspace timezone to convert the local
// date/time pickers to UTC, and batch-inserts canonical appointment line
// items after verifying the appointment belongs to the active workspace.
// ---------------------------------------------------------------------------

workOrdersRouter.get("/v1/workspaces/timezone", async (c) => {
  const params = new URL(c.req.url).searchParams;
  const workspaceId = z.string().uuid().parse(params.get("workspace_id") ?? "");
  const { supabase } = await requireWorkspaceAuth(c, workspaceId);
  const { data, error } = await (supabase as any)
    .from("workspaces").select("timezone").eq("id", workspaceId).maybeSingle();
  if (error) throw error;
  return json({ data: { timezone: (data as { timezone?: string } | null)?.timezone ?? "UTC" } });
});

workOrdersRouter.post("/v1/inline-writer/appointment-items", async (c) => {
  const body = z.object({
    workspace_id: z.string().uuid(),
    appointment_id: z.string().min(1),
    items: z.array(z.object({
      service_catalog_id: z.string().min(1),
      name: z.string().min(1),
      price: z.number(),
      quantity: z.number(),
    })).min(1).max(200),
  }).parse(await c.req.json());
  const { supabase } = await requireWorkspaceAuth(c, body.workspace_id);
  const { data: appointment, error: appointmentError } = await (supabase as any)
    .from("appointments").select("id")
    .eq("workspace_id", body.workspace_id).eq("id", body.appointment_id).maybeSingle();
  if (appointmentError) throw appointmentError;
  if (!appointment) throw new ApiError(404, "Appointment was not found in the active workspace.", "appointment_not_found");
  const rows = body.items.map((item, index) => ({
    workspace_id: body.workspace_id,
    appointment_id: body.appointment_id,
    service_catalog_id: item.service_catalog_id,
    item_type: "service",
    description: item.name,
    quantity: Math.max(1, Number(item.quantity || 1)),
    unit_price: Number(item.price || 0),
    sort_order: index,
    metadata: { source: "inline_service_writer" },
  }));
  const { data, error } = await (supabase as any).from("appointment_items").insert(rows).select();
  if (error) throw error;
  return json({ data: data ?? [] }, { status: 201 });
});
