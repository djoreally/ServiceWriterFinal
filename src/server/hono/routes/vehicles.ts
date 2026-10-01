/**
 * VEHICLES domain router (Phase 1 Hono migration).
 *
 * Migrated from:
 * - app/api/v1/vehicles/route.ts (GET, POST)
 * - app/api/v1/vehicles/[id]/route.ts (GET, PATCH, DELETE)
 * - app/api/v1/vehicles/[id]/summary/route.ts (GET)
 * - app/api/v1/service-records/route.ts (GET, POST)
 * - app/api/v1/service-records/[id]/route.ts (GET, PATCH, DELETE)
 * - app/api/v1/service-catalog/route.ts (GET)
 * - service catalog writes (POST /v1/service-catalog, PATCH/DELETE
 *   /v1/service-catalog/:id) — new endpoints for catalog management and
 *   offline outbox replay of service_catalog.* mutations; no Next.js
 *   predecessor, they follow the vehicles write patterns in this router.
 * - app/api/v1/public-vehicle-catalog/route.ts (POST, public — no auth)
 *
 * Paths are registered relative to `/api` (the app-level basePath); do not
 * include the `/api` prefix.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { z } from "zod";
import { ApiError, json, paginationSchema, requireWorkspaceMember } from "@/server/api";
import { requireAuth, requireWorkspaceAuth } from "@/server/hono/middleware/auth";
import type { Context } from "hono";
import { getNextFleetWorkOrderStatus } from "@/domain/fleet/work-order-lifecycle";
import { toDollars } from "@/lib/money";

export const vehiclesRouter = new Hono();

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------

const vehicleSchema = z.object({
  workspace_id: z.string().uuid(),
  customer_id: z.string().uuid().nullable().optional(),
  vin: z.string().trim().max(32).nullable().optional(),
  year: z.number().int().min(1886).max(2200).nullable().optional(),
  make: z.string().trim().max(80).nullable().optional(),
  model: z.string().trim().max(120).nullable().optional(),
  trim: z.string().trim().max(120).nullable().optional(),
  license_plate: z.string().trim().max(30).nullable().optional(),
  plate_state: z.string().trim().max(20).nullable().optional(),
  plate_region: z.string().trim().max(20).nullable().optional(),
  color: z.string().trim().max(50).nullable().optional(),
  mileage: z.number().int().min(0).nullable().optional(),
  mileage_unit: z.enum(["mi", "km"]).default("mi"),
  odometer_measure: z.string().trim().max(20).nullable().optional(),
  engine: z.string().trim().max(120).nullable().optional(),
  oil_type: z.string().trim().max(80).nullable().optional(),
  oil_capacity: z.string().trim().max(40).nullable().optional(),
  oil_filter: z.string().trim().max(100).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

async function assertCustomerInWorkspace(
  supabase: Awaited<ReturnType<typeof requireWorkspaceMember>>["supabase"],
  workspaceId: string,
  customerId: string | null | undefined,
) {
  if (!customerId) return;
  const { data, error } = await supabase
    .from("customers")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("id", customerId)
    .neq("status", "archived")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Customer does not belong to this workspace.");
}

function isArchivedVehicle(row: { metadata?: unknown }): boolean {
  return !!(
    row.metadata &&
    typeof row.metadata === "object" &&
    !Array.isArray(row.metadata) &&
    (row.metadata as Record<string, unknown>).archived_at
  );
}

vehiclesRouter.get("/v1/vehicles", async (c) => {
  const url = new URL(c.req.url);
  const workspaceId = url.searchParams.get("workspace_id");
  if (!workspaceId) throw new Error("workspace_id is required");
  const { supabase } = await requireWorkspaceAuth(c, workspaceId);

  let query = supabase
    .from("vehicles")
    .select("*,customers(id,first_name,last_name),vehicle_service_specs(engine,oil_type,oil_capacity,oil_filter,metadata)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  let pagination: { limit: number; offset: number } | undefined;
  if (url.searchParams.has("limit") || url.searchParams.has("offset")) {
    const { limit, offset } = paginationSchema.parse(Object.fromEntries(url.searchParams));
    query = query.range(offset, offset + limit - 1);
    pagination = { limit, offset };
  }

  const { data, error } = await query;
  if (error) throw error;
  const visibleVehicles = (data ?? []).filter((row) => !isArchivedVehicle(row));
  return json({
    data: visibleVehicles,
    pagination: pagination ?? { limit: visibleVehicles.length, offset: 0 },
  });
});

vehiclesRouter.post("/v1/vehicles", async (c) => {
  const body = vehicleSchema.parse(await c.req.json());
  const { supabase } = await requireWorkspaceAuth(c, body.workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist", "technician"]);
  await assertCustomerInWorkspace(supabase, body.workspace_id, body.customer_id);

  const { engine, oil_type, oil_capacity, oil_filter, odometer_measure, plate_state, ...vehicleInput } = body;
  const { data: vehicle, error } = await supabase.from("vehicles").insert({
    ...vehicleInput,
    plate_region: body.plate_region ?? plate_state ?? null,
    metadata: odometer_measure ? { odometer_measure } : {},
  } as never).select().single();
  if (error) throw error;

  if (engine || oil_type || oil_capacity || oil_filter) {
    const { error: specsError } = await supabase.from("vehicle_service_specs").upsert({
      workspace_id: body.workspace_id,
      vehicle_id: vehicle.id,
      engine: engine ?? null,
      oil_type: oil_type ?? null,
      oil_capacity: oil_capacity ?? null,
      oil_filter: oil_filter ?? null,
      source: "service_writer",
      metadata: {},
    } as never, { onConflict: "workspace_id,vehicle_id" });
    if (specsError) throw specsError;
  }

  return json({ data: vehicle }, { status: 201 });
});

const vehicleUpdateSchema = z.object({
  workspace_id: z.string().uuid(),
  customer_id: z.string().uuid().nullable().optional(),
  vin: z.string().trim().max(32).nullable().optional(),
  year: z.number().int().min(1886).max(2200).nullable().optional(),
  make: z.string().trim().max(80).nullable().optional(),
  model: z.string().trim().max(120).nullable().optional(),
  trim: z.string().trim().max(120).nullable().optional(),
  license_plate: z.string().trim().max(30).nullable().optional(),
  plate_state: z.string().trim().max(20).nullable().optional(),
  plate_region: z.string().trim().max(20).nullable().optional(),
  color: z.string().trim().max(50).nullable().optional(),
  mileage: z.number().int().min(0).nullable().optional(),
  mileage_unit: z.enum(["mi", "km"]).optional(),
  odometer_measure: z.string().trim().max(20).nullable().optional(),
  engine: z.string().trim().max(120).nullable().optional(),
  oil_type: z.string().trim().max(80).nullable().optional(),
  oil_capacity: z.string().trim().max(40).nullable().optional(),
  oil_filter: z.string().trim().max(100).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
}).refine((body) => Object.keys(body).some((key) => key !== "workspace_id"), {
  message: "At least one vehicle field is required",
});

const writeRoles = ["owner", "admin", "manager", "service_advisor", "receptionist", "technician"] as const;

vehiclesRouter.get("/v1/vehicles/:id", async (c) => {
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id"));
  const id = z.string().uuid().parse(c.req.param("id"));
  const { supabase } = await requireWorkspaceAuth(c, workspaceId);
  const { data, error } = await supabase
    .from("vehicles")
    .select("*,customers(id,first_name,last_name,email,phone),vehicle_service_specs(engine,oil_type,oil_capacity,oil_filter,metadata)")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .single();
  if (error) throw error;
  return json({ data });
});

vehiclesRouter.patch("/v1/vehicles/:id", async (c) => {
  const body = vehicleUpdateSchema.parse(await c.req.json());
  const id = z.string().uuid().parse(c.req.param("id"));
  const { supabase } = await requireWorkspaceAuth(c, body.workspace_id, [...writeRoles]);

  if (Object.prototype.hasOwnProperty.call(body, "customer_id") && body.customer_id) {
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("id")
      .eq("workspace_id", body.workspace_id)
      .eq("id", body.customer_id)
      .neq("status", "archived")
      .maybeSingle();
    if (customerError) throw customerError;
    if (!customer) throw new Error("Customer does not belong to this workspace.");
  }

  const { workspace_id, engine, oil_type, oil_capacity, oil_filter, odometer_measure, plate_state, ...vehicleInput } = body;
  const patch: Record<string, unknown> = { ...vehicleInput };

  if (Object.prototype.hasOwnProperty.call(body, "plate_state") && !Object.prototype.hasOwnProperty.call(body, "plate_region")) {
    patch.plate_region = plate_state ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "odometer_measure")) {
    const { data: current, error: currentError } = await supabase
      .from("vehicles")
      .select("metadata")
      .eq("workspace_id", workspace_id)
      .eq("id", id)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) throw new Error("Vehicle does not belong to this workspace.");
    const metadata = current.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
      ? current.metadata as Record<string, unknown>
      : {};
    patch.metadata = { ...metadata, odometer_measure: odometer_measure ?? null };
  }

  let vehicle: unknown;
  if (Object.keys(patch).length > 0) {
    const { data, error } = await supabase
      .from("vehicles")
      .update(patch as never)
      .eq("id", id)
      .eq("workspace_id", workspace_id)
      .select()
      .single();
    if (error) throw error;
    vehicle = data;
  } else {
    const { data, error } = await supabase
      .from("vehicles")
      .select("*")
      .eq("id", id)
      .eq("workspace_id", workspace_id)
      .single();
    if (error) throw error;
    vehicle = data;
  }

  if ([engine, oil_type, oil_capacity, oil_filter].some((value) => value !== undefined)) {
    const { data: currentSpecs, error: currentSpecsError } = await supabase
      .from("vehicle_service_specs")
      .select("engine,oil_type,oil_capacity,oil_filter,metadata")
      .eq("workspace_id", workspace_id)
      .eq("vehicle_id", id)
      .maybeSingle();
    if (currentSpecsError) throw currentSpecsError;
    const { error: specsError } = await supabase.from("vehicle_service_specs").upsert({
      workspace_id,
      vehicle_id: id,
      engine: engine !== undefined ? engine : currentSpecs?.engine ?? null,
      oil_type: oil_type !== undefined ? oil_type : currentSpecs?.oil_type ?? null,
      oil_capacity: oil_capacity !== undefined ? oil_capacity : currentSpecs?.oil_capacity ?? null,
      oil_filter: oil_filter !== undefined ? oil_filter : currentSpecs?.oil_filter ?? null,
      source: "service_writer",
      metadata: currentSpecs?.metadata ?? {},
    } as never, { onConflict: "workspace_id,vehicle_id" });
    if (specsError) throw specsError;
  }

  return json({ data: vehicle });
});

vehiclesRouter.delete("/v1/vehicles/:id", async (c) => {
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id"));
  const id = z.string().uuid().parse(c.req.param("id"));
  const { supabase, user } = await requireWorkspaceAuth(c, workspaceId, [...writeRoles]);
  const { data: current, error: currentError } = await supabase
    .from("vehicles")
    .select("id,metadata")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current) throw new Error("Vehicle does not belong to this workspace.");
  const metadata = current.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
    ? current.metadata as Record<string, unknown>
    : {};
  const archivedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("vehicles")
    .update({ metadata: { ...metadata, archived_at: archivedAt, archived_by: user.id } } as never)
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select("id,metadata")
    .single();
  if (error) throw error;
  return json({ data });
});

vehiclesRouter.get("/v1/vehicles/:id/summary", async (c) => {
  const vehicleId = z.string().uuid().parse(c.req.param("id"));
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id"));
  const { supabase } = await requireWorkspaceAuth(c, workspaceId);

  const { data: vehicle, error: vehicleError } = await supabase
    .from("vehicles")
    .select("*,customers(id,first_name,last_name,email,phone),vehicle_service_specs(engine,oil_type,oil_capacity,oil_filter,metadata)")
    .eq("workspace_id", workspaceId)
    .eq("id", vehicleId)
    .single();
  if (vehicleError || !vehicle) throw vehicleError ?? new Error("Vehicle not found");

  const [services, appointments, workOrders, invoices] = await Promise.all([
    supabase.from("service_records").select("*")
      .eq("workspace_id", workspaceId).eq("vehicle_id", vehicleId).order("completed_at", { ascending: false, nullsFirst: false }),
    supabase.from("appointments").select("*")
      .eq("workspace_id", workspaceId).eq("vehicle_id", vehicleId).order("starts_at", { ascending: false }),
    supabase.from("work_orders").select("*")
      .eq("workspace_id", workspaceId).eq("vehicle_id", vehicleId).order("created_at", { ascending: false }),
    supabase.from("invoices").select("*")
      .eq("workspace_id", workspaceId).eq("vehicle_id", vehicleId).order("created_at", { ascending: false }),
  ]);

  for (const result of [services, appointments, workOrders, invoices]) {
    if (result.error) throw result.error;
  }

  return json({
    data: {
      vehicle,
      service_records: services.data ?? [],
      appointments: appointments.data ?? [],
      work_orders: workOrders.data ?? [],
      invoices: invoices.data ?? [],
    },
  });
});

// ---------------------------------------------------------------------------
// Service records
// ---------------------------------------------------------------------------

const serviceRecordSchema = z.object({
  workspace_id: z.string().uuid(),
  appointment_id: z.string().uuid().nullable().optional(),
  work_order_id: z.string().uuid().nullable().optional(),
  customer_id: z.string().uuid().nullable().optional(),
  vehicle_id: z.string().uuid().nullable().optional(),
  technician_id: z.string().uuid().nullable().optional(),
  quote_id: z.string().uuid().nullable().optional(),
  status: z.enum(["draft", "in_progress", "completed", "voided"]).default("completed"),
  complaint: z.string().max(10000).nullable().optional(),
  diagnosis: z.string().max(10000).nullable().optional(),
  work_performed: z.string().max(20000).nullable().optional(),
  oil_quarts_used: z.number().finite().min(0).max(1000).nullable().optional(),
  customer_notes: z.string().max(10000).nullable().optional(),
  internal_notes: z.string().max(10000).nullable().optional(),
  subtotal: z.number().nonnegative().nullable().optional(),
  tax_rate: z.number().min(0).max(100).nullable().optional(),
  tax_amount: z.number().nonnegative().nullable().optional(),
  discount_amount: z.number().nonnegative().nullable().optional(),
  total_amount: z.number().nonnegative().nullable().optional(),
  currency_code: z.string().trim().length(3).toUpperCase().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  started_at: z.string().datetime().nullable().optional(),
  completed_at: z.string().datetime().nullable().optional(),
}).strict();

type RefBody = z.infer<typeof serviceRecordSchema>;

function uuidFromMetadata(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
}
function numberFromMetadata(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function mergeMetadata(current: unknown, incoming: Record<string, unknown>): Record<string, unknown> {
  const base = current && typeof current === "object" && !Array.isArray(current) ? current as Record<string, unknown> : {};
  return { ...base, ...incoming };
}

async function resolveReferences(supabase: any, body: RefBody): Promise<{ customerId: string | null; vehicleId: string | null } | { error: Response }> {
  let customerId = body.customer_id ?? uuidFromMetadata(body.metadata.customer_id);
  let vehicleId = body.vehicle_id ?? uuidFromMetadata(body.metadata.vehicle_id);
  const sourceRefs = [
    body.appointment_id ? ["appointments", body.appointment_id, "appointment"] as const : null,
    body.work_order_id ? ["work_orders", body.work_order_id, "work_order"] as const : null,
    body.quote_id ? ["quotes", body.quote_id, "quote"] as const : null,
  ].filter(Boolean) as Array<readonly [string, string, string]>;

  for (const [table, id, label] of sourceRefs) {
    const { data, error } = await supabase.from(table).select("id,customer_id,vehicle_id").eq("workspace_id", body.workspace_id).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return { error: json({ error: { code: `${label}_not_found`, message: `Referenced ${label.replace("_", " ")} does not belong to this workspace.` } }, { status: 409 }) };
    if (customerId && data.customer_id && customerId !== data.customer_id) return { error: json({ error: { code: "source_customer_mismatch", message: "Referenced source belongs to a different customer." } }, { status: 409 }) };
    if (vehicleId && data.vehicle_id && vehicleId !== data.vehicle_id) return { error: json({ error: { code: "source_vehicle_mismatch", message: "Referenced source belongs to a different vehicle." } }, { status: 409 }) };
    customerId ??= data.customer_id ?? null;
    vehicleId ??= data.vehicle_id ?? null;
  }

  if (customerId) {
    const { data, error } = await supabase.from("customers").select("id,status").eq("workspace_id", body.workspace_id).eq("id", customerId).maybeSingle();
    if (error) throw error;
    if (!data || data.status === "archived") return { error: json({ error: { code: "customer_not_found", message: "Customer does not belong to this workspace." } }, { status: 409 }) };
  }
  if (vehicleId) {
    const { data, error } = await supabase.from("vehicles").select("id,customer_id,status").eq("workspace_id", body.workspace_id).eq("id", vehicleId).maybeSingle();
    if (error) throw error;
    if (!data || data.status === "archived") return { error: json({ error: { code: "vehicle_not_found", message: "Vehicle does not belong to this workspace." } }, { status: 409 }) };
    if (customerId && data.customer_id && data.customer_id !== customerId) return { error: json({ error: { code: "vehicle_customer_mismatch", message: "Vehicle does not belong to the selected customer." } }, { status: 409 }) };
  }
  if (body.technician_id) {
    const { data, error } = await supabase.from("workspace_members").select("user_id,is_active").eq("workspace_id", body.workspace_id).eq("user_id", body.technician_id).maybeSingle();
    if (error) throw error;
    if (!data?.is_active) return { error: json({ error: { code: "technician_not_found", message: "Technician is not an active member of this workspace." } }, { status: 409 }) };
  }
  return { customerId, vehicleId };
}

vehiclesRouter.get("/v1/service-records", async (c) => {
  const url = new URL(c.req.url);
  const workspaceId = z.string().uuid().parse(url.searchParams.get("workspace_id"));
  const { supabase } = await requireWorkspaceAuth(c, workspaceId);
  const { limit, offset } = paginationSchema.parse(Object.fromEntries(url.searchParams));
  const { data, error } = await supabase.from("service_records").select("*").eq("workspace_id", workspaceId).order("completed_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw error;
  return json({ data: data ?? [], pagination: { limit, offset } });
});

vehiclesRouter.post("/v1/service-records", async (c) => {
  const body = serviceRecordSchema.parse(await c.req.json());
  const { supabase, user } = await requireWorkspaceAuth(c, body.workspace_id, ["owner", "admin", "manager", "service_advisor", "dispatcher", "technician"]);
  const refs = await resolveReferences(supabase, body);
  if ("error" in refs) return refs.error;

  const meta = body.metadata ?? {};
  const laborCost = numberFromMetadata(meta.labor_cost) ?? 0;
  const partsCost = numberFromMetadata(meta.parts_cost) ?? 0;
  const shopSupplies = numberFromMetadata(meta.shop_supplies) ?? 0;
  const subtotal = body.subtotal ?? Number((laborCost + partsCost + shopSupplies).toFixed(2));
  const discount = body.discount_amount ?? numberFromMetadata(meta.discount_amount) ?? 0;
  if (discount > subtotal) return json({ error: { code: "discount_exceeds_subtotal", message: "Discount cannot exceed subtotal." } }, { status: 400 });
  const taxRate = body.tax_rate ?? numberFromMetadata(meta.tax_rate);
  const taxAmount = body.tax_amount ?? numberFromMetadata(meta.tax_amount) ?? (taxRate == null ? 0 : Number(((subtotal - discount) * taxRate / 100).toFixed(2)));
  const expectedTotal = Number((subtotal - discount + taxAmount).toFixed(2));
  const total = body.total_amount ?? numberFromMetadata(meta.total_cost) ?? expectedTotal;
  if (Math.abs(total - expectedTotal) > 0.01) return json({ error: { code: "financial_math_mismatch", message: "Service record total does not match subtotal, discount, and tax." } }, { status: 400 });

  const now = new Date().toISOString();
  const payload = { ...body, customer_id: refs.customerId, vehicle_id: refs.vehicleId, subtotal, tax_rate: taxRate, tax_amount: taxAmount, discount_amount: discount, total_amount: total, completed_by: body.status === "completed" ? user.id : null, completed_at: body.status === "completed" ? body.completed_at ?? now : body.completed_at ?? null };

  if (body.appointment_id) {
    const { data: existing, error: existingError } = await supabase.from("service_records").select("id,metadata").eq("workspace_id", body.workspace_id).eq("appointment_id", body.appointment_id).neq("status", "voided").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      const { data, error } = await (supabase.from("service_records") as any).update({ ...payload, metadata: mergeMetadata(existing.metadata, meta) }).eq("workspace_id", body.workspace_id).eq("id", existing.id).select().single();
      if (error) throw error;
      return json({ data, reused: true });
    }
  }
  const { data, error } = await supabase.from("service_records").insert(payload).select().single();
  if (error) throw error;
  return json({ data }, { status: 201 });
});

const idSchema = z.string().uuid();
const updateSchema = z.object({
  workspace_id: z.string().uuid(),
  customer_id: z.string().uuid().nullable().optional(),
  vehicle_id: z.string().uuid().nullable().optional(),
  work_order_id: z.string().uuid().nullable().optional(),
  technician_id: z.string().uuid().nullable().optional(),
  quote_id: z.string().uuid().nullable().optional(),
  status: z.enum(["draft", "in_progress", "completed", "voided"]).optional(),
  complaint: z.string().max(10000).nullable().optional(),
  diagnosis: z.string().max(10000).nullable().optional(),
  work_performed: z.string().max(20000).nullable().optional(),
  oil_quarts_used: z.number().finite().min(0).max(1000).nullable().optional(),
  customer_notes: z.string().max(10000).nullable().optional(),
  internal_notes: z.string().max(10000).nullable().optional(),
  subtotal: z.number().nonnegative().nullable().optional(),
  tax_rate: z.number().min(0).max(100).nullable().optional(),
  tax_amount: z.number().nonnegative().nullable().optional(),
  discount_amount: z.number().nonnegative().nullable().optional(),
  total_amount: z.number().nonnegative().nullable().optional(),
  currency_code: z.string().trim().length(3).toUpperCase().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  started_at: z.string().datetime().nullable().optional(),
  completed_at: z.string().datetime().nullable().optional(),
}).strict();

function hasOwn(value: object, key: string) { return Object.prototype.hasOwnProperty.call(value, key); }

async function validateTargetReferences(supabase: any, workspaceId: string, target: { customer_id: string | null; vehicle_id: string | null; work_order_id: string | null; quote_id: string | null; technician_id: string | null }) {
  if (target.customer_id) {
    const { data, error } = await supabase.from("customers").select("id,status").eq("workspace_id", workspaceId).eq("id", target.customer_id).maybeSingle();
    if (error) throw error;
    if (!data || data.status === "archived") return json({ error: { code: "customer_not_found", message: "Customer does not belong to this workspace." } }, { status: 409 });
  }
  if (target.vehicle_id) {
    const { data, error } = await supabase.from("vehicles").select("id,customer_id,status").eq("workspace_id", workspaceId).eq("id", target.vehicle_id).maybeSingle();
    if (error) throw error;
    if (!data || data.status === "archived") return json({ error: { code: "vehicle_not_found", message: "Vehicle does not belong to this workspace." } }, { status: 409 });
    if (target.customer_id && data.customer_id && data.customer_id !== target.customer_id) return json({ error: { code: "vehicle_customer_mismatch", message: "Vehicle does not belong to the selected customer." } }, { status: 409 });
  }
  for (const [table, id, label] of [["work_orders", target.work_order_id, "work_order"], ["quotes", target.quote_id, "quote"]] as const) {
    if (!id) continue;
    const { data, error } = await supabase.from(table).select("id,customer_id,vehicle_id").eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return json({ error: { code: `${label}_not_found`, message: `Referenced ${label.replace("_", " ")} does not belong to this workspace.` } }, { status: 409 });
    if (target.customer_id && data.customer_id && data.customer_id !== target.customer_id) return json({ error: { code: "source_customer_mismatch", message: "Referenced source belongs to a different customer." } }, { status: 409 });
    if (target.vehicle_id && data.vehicle_id && data.vehicle_id !== target.vehicle_id) return json({ error: { code: "source_vehicle_mismatch", message: "Referenced source belongs to a different vehicle." } }, { status: 409 });
  }
  if (target.technician_id) {
    const { data, error } = await supabase.from("workspace_members").select("user_id,is_active").eq("workspace_id", workspaceId).eq("user_id", target.technician_id).maybeSingle();
    if (error) throw error;
    if (!data?.is_active) return json({ error: { code: "technician_not_found", message: "Technician is not an active member of this workspace." } }, { status: 409 });
  }
  return null;
}

vehiclesRouter.get("/v1/service-records/:id", async (c) => {
  const id = idSchema.parse(c.req.param("id"));
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id"));
  const { supabase } = await requireWorkspaceAuth(c, workspaceId);
  const { data, error } = await supabase.from("service_records").select("*").eq("workspace_id", workspaceId).eq("id", id).single();
  if (error) throw error;
  return json({ data });
});

// ---------------------------------------------------------------------------
// Service record detail bundle — GET /v1/service-records/:id/detail-full
//
// Server-side translation of the legacy client composition in
// `src/application/queries/service-detail.query.ts` (which fetched the
// service row, customer, vehicle, line items, workspace settings/name,
// appointment, vehicle specs, fallback customer, and first appointment item
// in parallel via the browser Supabase client). The client now expects this
// bundle from a single endpoint; without it the ServiceDetail page renders
// empty.
// ---------------------------------------------------------------------------
vehiclesRouter.get("/v1/service-records/:id/detail-full", async (c) => {
  const id = idSchema.parse(c.req.param("id"));
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id"));
  const { supabase } = await requireWorkspaceAuth(c, workspaceId);
  const db = supabase as any;

  const { data: service, error: serviceError } = await supabase
    .from("service_records")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .single();
  if (serviceError) throw serviceError;

  const [customerRes, vehicleRes, linesRes, settingsRes, workspaceRes, appointmentRes] = await Promise.all([
    service.customer_id
      ? db.from("customers").select("*").eq("workspace_id", workspaceId).eq("id", service.customer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    service.vehicle_id
      ? db.from("vehicles").select("*").eq("workspace_id", workspaceId).eq("id", service.vehicle_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db.from("service_record_line_items")
      .select("id,item_type,description,quantity,unit_price,total_price,labor_hours,labor_rate,metadata,created_at")
      .eq("workspace_id", workspaceId)
      .eq("service_record_id", id)
      .order("sort_order"),
    db.from("workspace_settings").select("email").eq("workspace_id", workspaceId).maybeSingle(),
    db.from("workspaces").select("name").eq("id", workspaceId).maybeSingle(),
    service.appointment_id
      ? db.from("appointments").select("id,customer_id,vehicle_id,metadata,notes,starts_at").eq("workspace_id", workspaceId).eq("id", service.appointment_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  for (const res of [customerRes, vehicleRes, linesRes, settingsRes, workspaceRes, appointmentRes]) {
    if (res.error) throw res.error;
  }

  const appointment = appointmentRes.data ?? null;
  const customer = customerRes.data ?? null;

  let vehicleSpecs = null;
  if (service.vehicle_id) {
    const { data: spec, error: specError } = await db.from("vehicle_service_specs")
      .select("engine,oil_type,oil_capacity,oil_filter,metadata")
      .eq("workspace_id", workspaceId)
      .eq("vehicle_id", service.vehicle_id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (specError) throw specError;
    vehicleSpecs = spec ?? null;
  }

  let fallbackCustomer = null;
  if (!customer && appointment?.customer_id) {
    const { data: fallback, error: fallbackError } = await db.from("customers").select("*")
      .eq("workspace_id", workspaceId).eq("id", appointment.customer_id).maybeSingle();
    if (fallbackError) throw fallbackError;
    fallbackCustomer = fallback ?? null;
  }

  let firstAppointmentItem = null;
  if (service.appointment_id) {
    const { data: items, error: itemsError } = await db.from("appointment_items")
      .select("service_catalog_id,description,quantity,unit_price,service_catalog(name,description,estimated_duration)")
      .eq("workspace_id", workspaceId)
      .eq("appointment_id", service.appointment_id)
      .order("created_at")
      .limit(1);
    if (itemsError) throw itemsError;
    firstAppointmentItem = items?.[0] ?? null;
  }

  return json({
    data: {
      service,
      customer,
      vehicle: vehicleRes.data ?? null,
      line_items: linesRes.data ?? [],
      workspace_email: settingsRes.data?.email ?? "",
      workspace_name: workspaceRes.data?.name ?? "",
      appointment,
      fallback_customer: fallbackCustomer,
      vehicle_specs: vehicleSpecs,
      first_appointment_item: firstAppointmentItem,
    },
  });
});

vehiclesRouter.patch("/v1/service-records/:id", async (c) => {
  const id = idSchema.parse(c.req.param("id"));
  const body = updateSchema.parse(await c.req.json());
  const { supabase, user } = await requireWorkspaceAuth(c, body.workspace_id, ["owner", "admin", "manager", "service_advisor", "dispatcher", "technician"]);
  const { workspace_id, ...updates } = body;

  const { data: current, error: currentError } = await supabase.from("service_records").select("id,customer_id,vehicle_id,work_order_id,quote_id,technician_id,subtotal,tax_amount,discount_amount,total_amount,status,metadata").eq("workspace_id", workspace_id).eq("id", id).single();
  if (currentError) throw currentError;

  const target = {
    customer_id: hasOwn(updates, "customer_id") ? updates.customer_id ?? null : current.customer_id ?? null,
    vehicle_id: hasOwn(updates, "vehicle_id") ? updates.vehicle_id ?? null : current.vehicle_id ?? null,
    work_order_id: hasOwn(updates, "work_order_id") ? updates.work_order_id ?? null : current.work_order_id ?? null,
    quote_id: hasOwn(updates, "quote_id") ? updates.quote_id ?? null : current.quote_id ?? null,
    technician_id: hasOwn(updates, "technician_id") ? updates.technician_id ?? null : current.technician_id ?? null,
  };
  const refError = await validateTargetReferences(supabase, workspace_id, target);
  if (refError) return refError;

  const subtotal = updates.subtotal ?? current.subtotal;
  const discount = updates.discount_amount ?? current.discount_amount ?? 0;
  const taxAmount = updates.tax_amount ?? current.tax_amount ?? 0;
  const total = updates.total_amount ?? current.total_amount;
  if (subtotal != null && discount > subtotal) return json({ error: { code: "discount_exceeds_subtotal", message: "Discount cannot exceed subtotal." } }, { status: 400 });
  if (subtotal != null && total != null) {
    const expected = Number((Number(subtotal) - Number(discount) + Number(taxAmount)).toFixed(2));
    if (Math.abs(Number(total) - expected) > 0.01) return json({ error: { code: "financial_math_mismatch", message: "Service record total does not match subtotal, discount, and tax." } }, { status: 400 });
  }

  const payload = {
    ...updates,
    ...(updates.status === "completed" ? { completed_by: user.id, completed_at: updates.completed_at ?? new Date().toISOString() } : {}),
    ...(updates.status && updates.status !== "completed" && hasOwn(updates, "completed_at") ? {} : {}),
  };
  const { data, error } = await supabase.from("service_records").update(payload).eq("workspace_id", workspace_id).eq("id", id).select().single();
  if (error) throw error;
  return json({ data });
});

vehiclesRouter.delete("/v1/service-records/:id", async (c) => {
  const id = idSchema.parse(c.req.param("id"));
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id"));
  const { supabase, user } = await requireWorkspaceAuth(c, workspaceId, ["owner", "admin", "manager", "service_advisor"]);
  const { data: current, error: currentError } = await supabase.from("service_records").select("id,status,metadata").eq("workspace_id", workspaceId).eq("id", id).single();
  if (currentError || !current) throw currentError ?? new Error("Service record not found");
  const metadata = current.metadata && typeof current.metadata === "object" ? current.metadata as Record<string, unknown> : {};
  const { data, error } = await (supabase.from("service_records") as any).update({ status: "voided", metadata: { ...metadata, voided_at: new Date().toISOString(), voided_by: user.id } }).eq("workspace_id", workspaceId).eq("id", id).select("id,status").single();
  if (error) throw error;
  return json({ data });
});

// ---------------------------------------------------------------------------
// Service catalog
// ---------------------------------------------------------------------------

vehiclesRouter.get("/v1/service-catalog", async (c) => {
  const url = new URL(c.req.url);
  const workspaceId = url.searchParams.get("workspace_id");
  if (!workspaceId) {
    return json({ error: { code: "missing_workspace", message: "workspace_id is required" } }, { status: 400 });
  }

  const { supabase } = await requireWorkspaceAuth(c, workspaceId);
  const { data, error } = await supabase
    .from("service_catalog")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) throw error;
  return json({ data: data ?? [] });
});

// ---------------------------------------------------------------------------
// Service catalog writes (create/update/delete for catalog management and
// offline outbox replay of service_catalog.* mutations)
// ---------------------------------------------------------------------------

const serviceCatalogItemSchema = z.object({
  workspace_id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  category: z.string().trim().max(120).nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  default_price: z.number().min(0).nullable().optional(),
  labor_rate: z.number().min(0).nullable().optional(),
  pricing_mode: z.string().trim().max(60).optional(),
  estimated_duration: z.number().int().min(0).nullable().optional(),
  is_active: z.boolean().optional(),
  is_upsell: z.boolean().optional(),
  service_vertical: z.string().trim().max(120).optional(),
  service_intent: z.string().trim().max(120).nullable().optional(),
  skill_level: z.string().trim().max(60).nullable().optional(),
  requires_inventory_selection: z.boolean().optional(),
  requires_fitment_lookup: z.boolean().optional(),
  requires_tire_quantity: z.boolean().optional(),
  allows_manual_fitment: z.boolean().optional(),
  sort_order: z.number().int().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  parts_required: z.string().max(2000).nullable().optional(),
  inspection_template_id: z.string().uuid().nullable().optional(),
  template_id: z.string().uuid().nullable().optional(),
});

const serviceCatalogUpdateSchema = serviceCatalogItemSchema
  .partial()
  .extend({ workspace_id: z.string().uuid() })
  .refine((body) => Object.keys(body).some((key) => key !== "workspace_id"), {
    message: "At least one service catalog field is required",
  });

async function assertServiceCatalogItemInWorkspace(
  supabase: Awaited<ReturnType<typeof requireWorkspaceAuth>>["supabase"],
  workspaceId: string,
  id: string,
) {
  const { data, error } = await supabase
    .from("service_catalog")
    .select("id")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, "Service catalog item not found.", "not_found");
}

vehiclesRouter.post("/v1/service-catalog", async (c) => {
  const body = serviceCatalogItemSchema.parse(await c.req.json());
  const { workspace_id, ...itemInput } = body;
  const { supabase } = await requireWorkspaceAuth(c, workspace_id, [...writeRoles]);

  const { data, error } = await supabase
    .from("service_catalog")
    .insert({ workspace_id, ...itemInput } as never)
    .select()
    .single();
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new ApiError(409, "A service catalog item with this name already exists.", "duplicate_service_catalog_item");
    }
    throw error;
  }
  return json({ data }, { status: 201 });
});

vehiclesRouter.patch("/v1/service-catalog/:id", async (c) => {
  const body = serviceCatalogUpdateSchema.parse(await c.req.json());
  const id = z.string().uuid().parse(c.req.param("id"));
  const { workspace_id, ...patchInput } = body;
  const { supabase } = await requireWorkspaceAuth(c, workspace_id, [...writeRoles]);
  await assertServiceCatalogItemInWorkspace(supabase, workspace_id, id);

  const { data, error } = await supabase
    .from("service_catalog")
    .update(patchInput as never)
    .eq("id", id)
    .eq("workspace_id", workspace_id)
    .select()
    .single();
  if (error) throw error;
  return json({ data });
});

vehiclesRouter.delete("/v1/service-catalog/:id", async (c) => {
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id"));
  const id = z.string().uuid().parse(c.req.param("id"));
  const { supabase } = await requireWorkspaceAuth(c, workspaceId, [...writeRoles]);
  await assertServiceCatalogItemInWorkspace(supabase, workspaceId, id);

  // Soft delete: the GET read model only returns is_active items, and catalog
  // rows are referenced by historical records, so deactivation preserves history.
  const { data, error } = await supabase
    .from("service_catalog")
    .update({ is_active: false } as never)
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select()
    .single();
  if (error) throw error;
  return json({ data });
});

// ---------------------------------------------------------------------------
// Public vehicle catalog (no auth)
// ---------------------------------------------------------------------------

const currentYear = new Date().getUTCFullYear();
const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("years") }),
  z.object({ action: z.literal("makes"), year: z.number().int().min(1990).max(currentYear + 2) }),
  z.object({ action: z.literal("models"), year: z.number().int().min(1990).max(currentYear + 2), make: z.string().trim().min(1).max(120) }),
  z.object({ action: z.literal("specs"), year: z.number().int().min(1990).max(currentYear + 2), make: z.string().trim().min(1).max(120), model: z.string().trim().min(1).max(160) }),
]);

const VEHICLE_SPEC_FILE = path.join(
  process.cwd(),
  "data/vehicle-catalog-staging/vehicle_specifications_import_eligible_verified.csv",
);

const SELECTOR_SOURCE_MARKERS = [
  "autolubespecsymm.xlsx",
  "autolube_ymm_workbook",
  "release_2022_2027_final_audit",
  "release_audit_workbook",
] as const;

interface VehicleCatalogRow {
  record_id: string;
  year: number;
  make: string;
  model: string;
  engine: string | null;
  oil_type: string | null;
  oil_capacity: string | null;
  oil_filter: string | null;
  transmission_fluid: string | null;
  source: string;
  additional_specs: Record<string, unknown>;
}

interface VehicleCatalogIndex {
  years: number[];
  makesByYear: Map<number, string[]>;
  modelsByYearMake: Map<string, string[]>;
  specsByYmm: Map<string, VehicleCatalogRow[]>;
}

let catalogPromise: Promise<VehicleCatalogIndex> | null = null;

const normalize = (value: string) => value.trim().toLowerCase();
const ymmKey = (year: number, make: string, model?: string) =>
  [String(year), normalize(make), model ? normalize(model) : ""].join("|");

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function nullable(value: string | undefined): string | null {
  const cleaned = value?.trim() ?? "";
  return cleaned.length > 0 ? cleaned : null;
}

function parseAdditionalSpecs(value: string | undefined): Record<string, unknown> {
  if (!value?.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function isCustomerSelectorSource(source: string, additionalSpecs: Record<string, unknown>): boolean {
  // Vehicle identity is intentionally narrower than the consolidated reference
  // catalog. Auto Lube YMM and the reviewed 2022-2027 oil audit define the
  // customer-facing passenger/light-duty selector. FRAM/full filter catalogs,
  // generic YMM lists and filter cross references may enrich a selected vehicle,
  // but they must never create a Make/Model option by themselves.
  const provenance = `${source} ${JSON.stringify(additionalSpecs.source_files ?? "")}`.toLowerCase();
  return SELECTOR_SOURCE_MARKERS.some((marker) => provenance.includes(marker));
}

async function loadCatalog(): Promise<VehicleCatalogIndex> {
  const text = await readFile(VEHICLE_SPEC_FILE, "utf8");
  const parsed = parseCsv(text);
  const header = parsed.shift();
  if (!header) throw new Error("Vehicle specification catalog is empty");

  const column = new Map(header.map((name, index) => [name.trim(), index]));
  const required = ["record_id", "year", "make", "model", "engine", "oil_type", "oil_capacity", "oil_filter", "transmission_fluid", "source", "additional_specs"];
  for (const name of required) {
    if (!column.has(name)) throw new Error(`Vehicle specification catalog missing ${name}`);
  }

  const rows: VehicleCatalogRow[] = [];
  for (const values of parsed) {
    const year = Number(values[column.get("year")!]);
    const make = values[column.get("make")!]?.trim() ?? "";
    const model = values[column.get("model")!]?.trim() ?? "";
    if (!Number.isInteger(year) || !make || !model) continue;

    const source = values[column.get("source")!]?.trim() ?? "consolidated";
    const additionalSpecs = parseAdditionalSpecs(values[column.get("additional_specs")!]);
    if (!isCustomerSelectorSource(source, additionalSpecs)) continue;

    rows.push({
      record_id: values[column.get("record_id")!]?.trim() ?? "",
      year,
      make,
      model,
      engine: nullable(values[column.get("engine")!]),
      oil_type: nullable(values[column.get("oil_type")!]),
      oil_capacity: nullable(values[column.get("oil_capacity")!]),
      oil_filter: nullable(values[column.get("oil_filter")!]),
      transmission_fluid: nullable(values[column.get("transmission_fluid")!]),
      source,
      additional_specs: additionalSpecs,
    });
  }

  if (rows.length === 0) throw new Error("Vehicle selector catalog has no eligible oil-service rows");

  const years = Array.from(new Set(rows.map((row) => row.year))).sort((a, b) => b - a);
  const makes = new Map<number, Set<string>>();
  const models = new Map<string, Set<string>>();
  const specsByYmm = new Map<string, VehicleCatalogRow[]>();

  for (const row of rows) {
    if (!makes.has(row.year)) makes.set(row.year, new Set());
    makes.get(row.year)!.add(row.make);

    const makeKey = ymmKey(row.year, row.make);
    if (!models.has(makeKey)) models.set(makeKey, new Set());
    models.get(makeKey)!.add(row.model);

    const specKey = ymmKey(row.year, row.make, row.model);
    const group = specsByYmm.get(specKey) ?? [];
    group.push(row);
    specsByYmm.set(specKey, group);
  }

  return {
    years,
    makesByYear: new Map(Array.from(makes, ([year, values]) => [year, Array.from(values).sort((a, b) => a.localeCompare(b))])),
    modelsByYearMake: new Map(Array.from(models, ([key, values]) => [key, Array.from(values).sort((a, b) => a.localeCompare(b))])),
    specsByYmm,
  };
}

function getCatalog() {
  catalogPromise ??= loadCatalog().catch((error) => {
    catalogPromise = null;
    throw error;
  });
  return catalogPromise;
}

vehiclesRouter.post("/v1/public-vehicle-catalog", async (c) => {
  try {
    const parsed = requestSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: { code: "invalid_input", message: "Invalid vehicle lookup request" } }, 400);
    const input = parsed.data;
    const catalog = await getCatalog();

    if (input.action === "years") {
      return c.json({ years: catalog.years }, 200, { "Cache-Control": "public, s-maxage=86400" });
    }

    if (input.action === "makes") {
      return c.json({ makes: catalog.makesByYear.get(input.year) ?? [] }, 200, { "Cache-Control": "public, s-maxage=86400" });
    }

    if (input.action === "models") {
      return c.json({ models: catalog.modelsByYearMake.get(ymmKey(input.year, input.make)) ?? [] }, 200, { "Cache-Control": "public, s-maxage=86400" });
    }

    const rows = (catalog.specsByYmm.get(ymmKey(input.year, input.make, input.model)) ?? []).map((row) => ({
      id: row.record_id || undefined,
      year: row.year,
      make: row.make,
      model: row.model,
      engine: row.engine,
      oil_type: row.oil_type,
      oil_capacity: row.oil_capacity,
      oil_filter: row.oil_filter,
      tire_size: null,
      rear_tire_size: null,
      transmission_fluid: row.transmission_fluid,
      additional_specs: row.additional_specs,
      source: row.source,
    }));

    return c.json({ rows }, 200, { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" });
  } catch (error) {
    console.error("public_vehicle_catalog_api_failed", error instanceof Error ? error.message : String(error));
    return c.json({ error: { code: "catalog_lookup_failed", message: "Vehicle catalog lookup failed" } }, 502);
  }
});

// ---------------------------------------------------------------------------
// VEHICLES domain — Phase 2 migration helpers
//
// Fleet tables are user_id-scoped (see src/integrations/supabase/types.ts);
// the request client is created with the caller's bearer token so RLS
// applies exactly as it did for browser-side Supabase access. Endpoints below
// scope fleet data by the authenticated user id and mirror the original
// client queries verbatim.
// ---------------------------------------------------------------------------

type FleetDbClient = Awaited<ReturnType<typeof requireAuth>>["supabase"];
type FleetUser = Awaited<ReturnType<typeof requireAuth>>["user"];

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

/** Resolve the workspace for a user; the selected id is a UI hint only. */
async function resolveWorkspaceIdForUser(
  supabase: FleetDbClient,
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

function selectedWorkspaceHint(c: Context): string | undefined {
  const fromQuery = new URL(c.req.url).searchParams.get("selected_workspace_id");
  return fromQuery ?? undefined;
}

/**
 * Authenticate the caller and, when a workspace hint is supplied, gate on
 * workspace membership. Fleet data itself stays user_id-scoped, mirroring
 * the pre-migration browser queries.
 */
async function requireFleetScope(
  c: Context,
  hint?: string | null,
): Promise<{ supabase: FleetDbClient; user: FleetUser; workspaceId: string | null }> {
  const { supabase, user } = await requireAuth(c);
  let workspaceId: string | null = null;
  if (hint) {
    workspaceId = await resolveWorkspaceIdForUser(supabase, user.id, hint);
    if (!workspaceId) throw new ApiError(403, "You are not a member of this workspace", "forbidden");
  }
  return { supabase, user, workspaceId };
}

/** Dead provider integrations (removed edge functions) keep their unavailable contract. */
function providerUnavailable(name: string): never {
  throw new ApiError(501, `${name} provider is not configured`, "provider_not_configured");
}

/** Server-side audit log insert; fails silently like the client helper. */
async function logFleetAudit(
  supabase: FleetDbClient,
  input: { action: string; userId: string; tableName: string; recordId: string; newData?: unknown },
): Promise<void> {
  try {
    await supabase.from("audit_logs").insert({
      action: input.action,
      user_id: input.userId,
      table_name: input.tableName,
      record_id: input.recordId,
      new_data: (input.newData ?? {}) as never,
    });
  } catch {
    // Audit logging must never break the primary write.
  }
}

// ---------------------------------------------------------------------------
// CARFAX
// ---------------------------------------------------------------------------

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

vehiclesRouter.get("/v1/carfax/settings", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const hint = selectedWorkspaceHint(c);
  const workspaceId = await resolveWorkspaceIdForUser(supabase, user.id, hint);
  if (!workspaceId) return json({ data: null });
  const client = supabase as any;
  const [{ data: workspace }, { data: settings }] = await Promise.all([
    client.from("workspaces").select("name").eq("id", workspaceId).maybeSingle(),
    client
      .from("workspace_settings")
      .select("phone,address_line1,address_line2,city,region,postal_code,website_url,operational_settings")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
  ]);
  if (!workspace) return json({ data: null });
  const operational = asObject(settings?.operational_settings);
  const carfax = asObject(operational.carfax);
  return json({
    data: {
      carfax_location_id: typeof carfax.location_id === "string" ? carfax.location_id : "",
      city: settings?.city || "",
      state: settings?.region || "",
      postal_code: settings?.postal_code || "",
      website_url: settings?.website_url || "",
      business_name: workspace.name || "",
      address: [settings?.address_line1, settings?.address_line2].filter(Boolean).join(", "),
      phone: settings?.phone || "",
      carfax_activated: Boolean(carfax.location_id),
      carfax_activation_date: typeof carfax.activation_date === "string" ? carfax.activation_date : null,
    },
  });
});

vehiclesRouter.put("/v1/carfax/settings", async (c) => {
  const body = await c.req.json();
  const hint = typeof body.selected_workspace_id === "string" ? body.selected_workspace_id : undefined;
  const { supabase, user } = await requireAuth(c);
  const workspaceId = await resolveWorkspaceIdForUser(supabase, user.id, hint);
  if (!workspaceId) throw new ApiError(403, "Select a workspace before saving CARFAX settings.", "forbidden");
  const client = supabase as any;
  const { data: current, error: readError } = await client
    .from("workspace_settings")
    .select("operational_settings")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (readError) throw readError;
  const operational = asObject(current?.operational_settings);
  const existingCarfax = asObject(operational.carfax);
  const nextCarfax = {
    ...existingCarfax,
    location_id: body.carfax_location_id || null,
    activation_date: body.carfax_location_id
      ? existingCarfax.activation_date || new Date().toISOString()
      : null,
  };
  const { error } = await client
    .from("workspace_settings")
    .update({
      city: body.city || null,
      region: body.state || null,
      postal_code: body.postal_code || null,
      website_url: body.website_url || null,
      operational_settings: { ...operational, carfax: nextCarfax },
    })
    .eq("workspace_id", workspaceId);
  if (error) throw new Error("Failed to save CARFAX settings");
  return json({ data: { ok: true } });
});

vehiclesRouter.get("/v1/carfax/export-services", async (c) => {
  const url = new URL(c.req.url);
  const hint = url.searchParams.get("selected_workspace_id");
  const { supabase, user } = await requireAuth(c);
  const workspaceId = await resolveWorkspaceIdForUser(supabase, user.id, hint ?? undefined);
  if (!workspaceId) throw new ApiError(403, "Select a workspace before exporting CARFAX service history.", "forbidden");
  const client = supabase as any;
  const { data, error } = await client
    .from("service_records")
    .select(
      "id,vehicle_id,work_performed,metadata,completed_at,created_at,vehicles(vin,make,model,year,license_plate,plate_region,mileage,mileage_unit),service_record_line_items(id,item_type,description,quantity,labor_hours)",
    )
    .eq("workspace_id", workspaceId)
    .eq("status", "completed")
    .not("vehicle_id", "is", null)
    .order("completed_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.get("/v1/carfax/data-stats", async (c) => {
  const url = new URL(c.req.url);
  const hint = url.searchParams.get("selected_workspace_id");
  const { supabase, user } = await requireAuth(c);
  const workspaceId = await resolveWorkspaceIdForUser(supabase, user.id, hint ?? undefined);
  if (!workspaceId) {
    return json({ data: { totalServices: 0, validVins: 0, missingData: 0 } });
  }
  const { data, error } = await (supabase.from("service_records") as any)
    .select("id,vehicle_id,vehicles(vin)")
    .eq("workspace_id", workspaceId)
    .eq("status", "completed");
  if (error) throw error;
  const rows = (data ?? []) as Array<{ id: string; vehicle_id: string | null; vehicles: { vin?: string | null } | null }>;
  const totalServices = rows.length;
  const validVins = rows.filter((service) => service.vehicles?.vin?.length === 17).length;
  return json({ data: { totalServices, validVins, missingData: totalServices - validVins } });
});

vehiclesRouter.get("/v1/carfax/exports/history", async (c) => {
  const url = new URL(c.req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 20) || 20, 1), 100);
  const { supabase, user } = await requireFleetScope(c, url.searchParams.get("selected_workspace_id"));
  const { data, error } = await (supabase as any)
    .from("carfax_exports")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.get("/v1/carfax/exports/stats", async (c) => {
  const url = new URL(c.req.url);
  const { supabase, user } = await requireFleetScope(c, url.searchParams.get("selected_workspace_id"));
  const { data, error } = await (supabase as any)
    .from("carfax_exports")
    .select("*")
    .eq("user_id", user.id);
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.get("/v1/carfax/exports/today", async (c) => {
  const url = new URL(c.req.url);
  const { supabase, user } = await requireFleetScope(c, url.searchParams.get("selected_workspace_id"));
  const today = new Date().toISOString().split("T")[0];
  const { data, error } = await (supabase as any)
    .from("carfax_exports")
    .select("*")
    .eq("user_id", user.id)
    .eq("export_type", "PROD")
    .gte("created_at", `${today}T00:00:00`)
    .lte("created_at", `${today}T23:59:59`)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.get("/v1/carfax/exports/latest", async (c) => {
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("carfax_exports")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return json({ data: data ?? null });
});

/** The carfax-service-history edge function was removed; keep the unavailable contract. */
vehiclesRouter.post("/v1/carfax/service-history", async (c) => {
  await requireAuth(c);
  return providerUnavailable("CARFAX service history");
});

vehiclesRouter.get("/v1/admin/carfax/settings", async (c) => {
  const { supabase } = await requireAuth(c);
  const { data } = await (supabase as any)
    .from("platform_settings")
    .select("value")
    .eq("key", "carfax")
    .maybeSingle();
  return json({ data: data?.value ? data.value : null });
});

vehiclesRouter.put("/v1/admin/carfax/settings", async (c) => {
  const body = await c.req.json();
  const { supabase } = await requireAuth(c);
  const { error } = await (supabase as any)
    .from("platform_settings")
    .update({ value: body.config as never })
    .eq("key", "carfax");
  if (error) throw error;
  return json({ data: { ok: true } });
});

vehiclesRouter.get("/v1/admin/carfax/export-stats", async (c) => {
  const { supabase } = await requireAuth(c);
  const [{ count }, { data: lastExport }] = await Promise.all([
    (supabase as any).from("carfax_exports").select("*", { count: "exact", head: true }),
    (supabase as any)
      .from("carfax_exports")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return json({ data: { total: count || 0, lastExport: lastExport?.created_at || null } });
});

// ---------------------------------------------------------------------------
// Tire pricing
// ---------------------------------------------------------------------------

const TIRE_PRICING_COLUMNS =
  "service_catalog_id,base_installation_price,mount_balance_price,tpms_service_price,disposal_price,alignment_price,minimum_quantity,maximum_quantity,requires_inventory_selection,requires_fitment_lookup,allows_manual_fitment,allows_staggered_fitment,duration_minutes_per_tire";

vehiclesRouter.get("/v1/tire-pricing/rules", async (c) => {
  const url = new URL(c.req.url);
  const hint = url.searchParams.get("selected_workspace_id");
  const { supabase, user } = await requireAuth(c);
  const workspaceId = await resolveWorkspaceIdForUser(supabase, user.id, hint ?? undefined);
  if (!workspaceId) throw new ApiError(403, "Select a workspace before viewing tire pricing.", "forbidden");
  const { data, error } = await (supabase as any)
    .from("tire_service_pricing_rules")
    .select(TIRE_PRICING_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("created_at");
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.put("/v1/tire-pricing/rules", async (c) => {
  const body = await c.req.json();
  const rule = body.rule ?? body;
  const hint = typeof body.selected_workspace_id === "string" ? body.selected_workspace_id : undefined;
  const { supabase, user } = await requireAuth(c);
  const workspaceId = await resolveWorkspaceIdForUser(supabase, user.id, hint);
  if (!workspaceId) throw new ApiError(403, "Select a workspace before saving tire pricing.", "forbidden");
  const row = {
    workspace_id: workspaceId,
    service_catalog_id: rule.serviceCatalogId,
    base_installation_price: rule.baseInstallationPrice,
    mount_balance_price: rule.mountBalancePrice,
    tpms_service_price: rule.tpmsServicePrice,
    disposal_price: rule.disposalPrice,
    alignment_price: rule.alignmentPrice,
    minimum_quantity: rule.minimumQuantity,
    maximum_quantity: rule.maximumQuantity,
    requires_inventory_selection: rule.requiresInventorySelection,
    requires_fitment_lookup: rule.requiresFitmentLookup,
    allows_manual_fitment: rule.allowsManualFitment,
    allows_staggered_fitment: rule.allowsStaggeredFitment,
    duration_minutes_per_tire: rule.durationMinutesPerTire,
    updated_at: new Date().toISOString(),
  };
  const { error } = await (supabase as any)
    .from("tire_service_pricing_rules")
    .upsert(row, { onConflict: "workspace_id,service_catalog_id" });
  if (error) throw error;
  return json({ data: { ok: true } });
});

vehiclesRouter.post("/v1/tire-pricing/public-inventory", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any).rpc("get_public_tire_inventory", {
    p_business_user_id: body.business_user_id ?? body.businessUserId ?? null,
    p_tire_size: body.tire_size ?? body.tireSize ?? null,
  });
  if (error) throw error;
  return json({ data: data ?? [] });
});

// ---------------------------------------------------------------------------
// VIN (dead provider edge functions keep their unavailable contract)
// ---------------------------------------------------------------------------

vehiclesRouter.post("/v1/vin/ocr", async (c) => {
  await requireAuth(c);
  return providerUnavailable("vin-ocr");
});

vehiclesRouter.post("/v1/vin/decode", async (c) => {
  await requireAuth(c);
  return providerUnavailable("vin-decode");
});

vehiclesRouter.post("/v1/vin/plate-lookup", async (c) => {
  await requireAuth(c);
  return providerUnavailable("carfax-quickvin");
});

// ---------------------------------------------------------------------------
// Mileage (workspace-scoped)
// ---------------------------------------------------------------------------

vehiclesRouter.get("/v1/mileage/candidates", async (c) => {
  const url = new URL(c.req.url);
  const hint = url.searchParams.get("selected_workspace_id");
  const { supabase, user } = await requireAuth(c);
  const workspaceId = await resolveWorkspaceIdForUser(supabase, user.id, hint ?? undefined);
  if (!workspaceId) throw new ApiError(403, "No active workspace.", "forbidden");
  const { data, error } = await (supabase as any)
    .from("appointments")
    .select("id,starts_at,location_address,location_lat,location_lng,status")
    .eq("workspace_id", workspaceId)
    .eq("status", "completed")
    .not("location_lat", "is", null)
    .not("location_lng", "is", null)
    .order("starts_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.get("/v1/mileage/trips", async (c) => {
  const url = new URL(c.req.url);
  const hint = url.searchParams.get("selected_workspace_id");
  const { supabase, user } = await requireAuth(c);
  const workspaceId = await resolveWorkspaceIdForUser(supabase, user.id, hint ?? undefined);
  if (!workspaceId) throw new ApiError(403, "No active workspace.", "forbidden");
  const { data, error } = await (supabase as any)
    .from("mileage_trips")
    .select("id,appointment_id,trip_date,purpose,origin_address,destination_address,one_way_miles,total_miles,mileage_rate,deductible_value,calculation_method,status")
    .eq("workspace_id", workspaceId)
    .order("trip_date", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.get("/v1/mileage/bookkeeping-settings", async (c) => {
  const url = new URL(c.req.url);
  const hint = url.searchParams.get("selected_workspace_id");
  const { supabase, user } = await requireAuth(c);
  const workspaceId = await resolveWorkspaceIdForUser(supabase, user.id, hint ?? undefined);
  if (!workspaceId) throw new ApiError(403, "No active workspace.", "forbidden");
  const { data, error } = await (supabase as any)
    .from("bookkeeping_settings")
    .select("mileage_enabled,mileage_round_trip,mileage_rate_per_mile,minimum_cash_reserve")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  return json({ data: data ?? null });
});

vehiclesRouter.put("/v1/mileage/bookkeeping-settings", async (c) => {
  const body = await c.req.json();
  const hint = typeof body.selected_workspace_id === "string" ? body.selected_workspace_id : undefined;
  const { supabase, user } = await requireAuth(c);
  const workspaceId = await resolveWorkspaceIdForUser(supabase, user.id, hint);
  if (!workspaceId) throw new ApiError(403, "No active workspace.", "forbidden");
  const { error } = await (supabase as any).from("bookkeeping_settings").upsert({
    workspace_id: workspaceId,
    mileage_enabled: body.mileage_enabled,
    mileage_round_trip: body.mileage_round_trip,
    mileage_rate_per_mile: body.mileage_rate_per_mile,
    minimum_cash_reserve: body.minimum_cash_reserve,
    updated_at: new Date().toISOString(),
  }, { onConflict: "workspace_id" });
  if (error) throw error;
  return json({ data: { ok: true } });
});

vehiclesRouter.post("/v1/mileage/trips", async (c) => {
  const body = await c.req.json();
  const hint = typeof body.selected_workspace_id === "string" ? body.selected_workspace_id : undefined;
  const { supabase, user } = await requireAuth(c);
  const workspaceId = await resolveWorkspaceIdForUser(supabase, user.id, hint);
  if (!workspaceId) throw new ApiError(403, "No active workspace.", "forbidden");
  const deductible = Math.round(Number(body.totalMiles) * Number(body.mileageRate) * 100) / 100;
  const { error } = await (supabase as any).from("mileage_trips").upsert({
    workspace_id: workspaceId,
    appointment_id: body.appointmentId,
    trip_date: body.tripDate,
    purpose: "Customer service appointment",
    origin_address: body.originAddress || null,
    destination_address: body.destinationAddress || null,
    origin_lat: body.origin?.lat,
    origin_lng: body.origin?.lng,
    destination_lat: body.destination?.lat,
    destination_lng: body.destination?.lng,
    one_way_miles: Math.round(Number(body.oneWayMiles) * 100) / 100,
    total_miles: Math.round(Number(body.totalMiles) * 100) / 100,
    mileage_rate: body.mileageRate,
    deductible_value: deductible,
    calculation_method: body.method,
    status: body.method === "mapbox_route" ? "tracked" : "review",
    created_by: user.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "workspace_id,appointment_id" });
  if (error) throw error;
  return json({ data: { ok: true } });
});

// ---------------------------------------------------------------------------
// Vehicle specs admin tooling (reference tables are global, not user-scoped)
// ---------------------------------------------------------------------------

vehiclesRouter.get("/v1/vehicle-specs/count", async (c) => {
  const { supabase } = await requireAuth(c);
  const { count, error } = await (supabase as any)
    .from("vehicle_specifications")
    .select("*", { count: "exact", head: true });
  if (error) throw error;
  return json({ data: { count: count ?? 0 } });
});

vehiclesRouter.get("/v1/filter-applications/count", async (c) => {
  const { supabase } = await requireAuth(c);
  const { count, error } = await (supabase as any)
    .from("filter_applications")
    .select("*", { count: "exact", head: true });
  if (error) throw error;
  return json({ data: { count: count ?? 0 } });
});

vehiclesRouter.get("/v1/vehicle-specs/search", async (c) => {
  const url = new URL(c.req.url);
  const { supabase } = await requireAuth(c);
  let query = (supabase as any).from("vehicle_specifications").select("*");
  const year = url.searchParams.get("year");
  const make = url.searchParams.get("make");
  const model = url.searchParams.get("model");
  if (year) query = query.eq("year", Number(year));
  if (make) query = query.ilike("make", make);
  if (model) query = query.ilike("model", `%${model}%`);
  const { data, error } = await query.order("year", { ascending: false }).limit(100);
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.get("/v1/filter-cross-refs/search", async (c) => {
  const url = new URL(c.req.url);
  const partNumber = url.searchParams.get("part_number") ?? "";
  const { supabase } = await requireAuth(c);
  const { data, error } = await (supabase as any)
    .from("filter_cross_references")
    .select("*")
    .or(`source_part_number.ilike.%${partNumber}%,target_part_number.ilike.%${partNumber}%`)
    .limit(50);
  if (error) throw error;
  return json({ data: data ?? [] });
});

/** The vehicle-maintenance edge function was removed; keep the unavailable contract. */
vehiclesRouter.post("/v1/vehicle-maintenance/schedule", async (c) => {
  await requireAuth(c);
  return providerUnavailable("vehicle-maintenance");
});

/** The ymmt-specs edge function was removed; keep the unavailable contract. */
vehiclesRouter.post("/v1/ymmt-specs", async (c) => {
  await requireAuth(c);
  return providerUnavailable("ymmt-specs");
});

/** The seed-vehicle-specs edge function was removed; keep the unavailable contract. */
vehiclesRouter.post("/v1/vehicle-specs/seed", async (c) => {
  await requireAuth(c);
  return providerUnavailable("seed-vehicle-specs");
});

/** The seed-filters edge function was removed; keep the unavailable contract. */
vehiclesRouter.post("/v1/filter-applications/seed", async (c) => {
  await requireAuth(c);
  return providerUnavailable("seed-filters");
});

// ---------------------------------------------------------------------------
// Vehicle parts lookup & registry
// ---------------------------------------------------------------------------

vehiclesRouter.post("/v1/vehicle-parts/lookup", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any).rpc("lookup_vehicle_parts", {
    p_year: body.year,
    p_make: body.make,
    p_model: body.model,
  });
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.get("/v1/vehicle-part-assignments", async (c) => {
  const url = new URL(c.req.url);
  const kind = url.searchParams.get("kind");
  const vehicleId = url.searchParams.get("vehicle_id");
  if (kind !== "fleet" && kind !== "retail") throw new ApiError(400, "kind must be fleet or retail", "invalid_input");
  if (!vehicleId) throw new ApiError(400, "vehicle_id is required", "invalid_input");
  const { supabase } = await requireFleetScope(c, url.searchParams.get("selected_workspace_id"));
  const column = kind === "fleet" ? "fleet_vehicle_id" : "vehicle_id";
  const { data, error } = await (supabase as any)
    .from("vehicle_part_assignments")
    .select("*")
    .eq(column, vehicleId)
    .order("part_category");
  if (error) throw new Error(error.message);
  return json({ data: data ?? [] });
});

vehiclesRouter.post("/v1/vehicle-part-suggestions", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any).rpc("get_vehicle_part_suggestions_v1", {
    p_vehicle_kind: body.kind,
    p_vehicle_id: body.vehicle_id,
  });
  if (error) throw new Error(error.message);
  return json({ data: data ?? [] });
});

vehiclesRouter.post("/v1/vehicle-part-assignments", async (c) => {
  const body = await c.req.json();
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const kind = body.kind;
  const vehicleId = body.vehicle_id;
  if (kind !== "fleet" && kind !== "retail") throw new ApiError(400, "kind must be fleet or retail", "invalid_input");
  if (!vehicleId) throw new ApiError(400, "vehicle_id is required", "invalid_input");
  // Resolve the workspace owner that owns the vehicle row, so team members write valid rows.
  const ownerQuery =
    kind === "fleet"
      ? (supabase as any).from("fleet_vehicles").select("user_id").eq("id", vehicleId).maybeSingle()
      : (supabase as any).from("vehicles").select("user_id").eq("id", vehicleId).maybeSingle();
  const { data: vehicle, error: vehicleError } = await ownerQuery;
  if (vehicleError) throw new Error(vehicleError.message);
  if (!vehicle?.user_id) throw new ApiError(404, "Vehicle not found", "not_found");
  const input = body.input ?? {};
  const row = {
    user_id: vehicle.user_id,
    vehicle_kind: kind,
    fleet_vehicle_id: kind === "fleet" ? vehicleId : null,
    vehicle_id: kind === "retail" ? vehicleId : null,
    part_category: input.part_category,
    part_number: String(input.part_number ?? "").trim(),
    brand: input.brand?.trim() || null,
    oem_number: input.oem_number?.trim() || null,
    quantity: input.quantity ?? 1,
    unit: input.unit || null,
    inventory_item_id: input.inventory_item_id || null,
    is_required: input.is_required ?? true,
    notes: input.notes?.trim() || null,
    verified_by: user.id,
    verified_at: new Date().toISOString(),
  };
  const { error } = await (supabase as any).from("vehicle_part_assignments").insert(row);
  if (error) {
    if (error.code === "23505") {
      throw new ApiError(409, "That part number is already assigned to this vehicle", "duplicate_part");
    }
    throw new Error(error.message);
  }
  return json({ data: { ok: true } });
});

vehiclesRouter.patch("/v1/vehicle-part-assignments/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const input = body.input ?? body;
  const { error } = await (supabase as any)
    .from("vehicle_part_assignments")
    .update({
      part_category: input.part_category,
      part_number: String(input.part_number ?? "").trim(),
      brand: input.brand?.trim() || null,
      oem_number: input.oem_number?.trim() || null,
      quantity: input.quantity ?? 1,
      unit: input.unit || null,
      inventory_item_id: input.inventory_item_id || null,
      is_required: input.is_required ?? true,
      notes: input.notes?.trim() || null,
      verified_by: user.id,
      verified_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  return json({ data: { ok: true } });
});

vehiclesRouter.delete("/v1/vehicle-part-assignments/:id", async (c) => {
  const id = c.req.param("id");
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { error } = await (supabase as any).from("vehicle_part_assignments").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return json({ data: { ok: true } });
});

vehiclesRouter.post("/v1/vehicle-specs/promote-parts", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { year, make, model, engine, parts } = body;
  if (!year || !make || !model) return json({ data: { ok: true, skipped: true } });
  const map: Record<string, string> = {
    oil_filter: "oil_filter",
    air_filter: "air_filter",
    cabin_filter: "cabin_filter",
    fuel_filter: "fuel_filter",
    wiper_blade_driver: "wiper_blade_driver",
    wiper_blade_passenger: "wiper_blade_passenger",
    wiper_blade_rear: "wiper_blade_rear",
  };
  const payload: Record<string, string> = {};
  for (const p of parts ?? []) {
    const col = map[p.part_category];
    if (col && p.part_number) payload[col] = p.part_number;
  }
  if (Object.keys(payload).length === 0) return json({ data: { ok: true, skipped: true } });
  const client = supabase as any;
  const { data: existing } = await client
    .from("vehicle_specifications")
    .select("id")
    .eq("year", year)
    .ilike("make", make)
    .ilike("model", model)
    .maybeSingle();
  if (existing?.id) {
    const { error } = await client.from("vehicle_specifications").update(payload).eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await client
      .from("vehicle_specifications")
      .insert({ year, make, model, engine: engine || null, source: "shop_confirmed", ...payload });
    if (error) throw error;
  }
  return json({ data: { ok: true } });
});

vehiclesRouter.get("/v1/inventory/stock-options", async (c) => {
  const url = new URL(c.req.url);
  const { supabase, user } = await requireFleetScope(c, url.searchParams.get("selected_workspace_id"));
  const { data, error } = await (supabase as any)
    .from("inventory_items")
    .select("id, name, sku, category, unit, quantity, sell_price, unit_cost")
    .eq("user_id", user.id)
    .order("name");
  if (error) throw new Error(error.message);
  return json({ data: data ?? [] });
});

vehiclesRouter.get("/v1/vans/stock", async (c) => {
  const url = new URL(c.req.url);
  const { supabase, user } = await requireFleetScope(c, url.searchParams.get("selected_workspace_id"));
  const { data: vans } = await (supabase as any)
    .from("vans")
    .select("id, name")
    .eq("user_id", user.id)
    .eq("is_active", true);
  const vanIds = (vans ?? []).map((v: { id: string }) => v.id);
  if (vanIds.length === 0) return json({ data: [] });
  const { data: rows, error } = await (supabase as any)
    .from("van_inventory")
    .select("van_id, inventory_item_id, quantity, min_quantity")
    .in("van_id", vanIds);
  if (error) throw new Error(error.message);
  const nameById = new Map((vans ?? []).map((v: { id: string; name: string }) => [v.id, v.name]));
  return json({
    data: (rows ?? []).map((r: { van_id: string; inventory_item_id: string; quantity: unknown; min_quantity: unknown }) => ({
      van_id: r.van_id,
      van_name: nameById.get(r.van_id) ?? "Van",
      inventory_item_id: r.inventory_item_id,
      quantity: Number(r.quantity ?? 0),
      min_quantity: r.min_quantity == null ? null : Number(r.min_quantity),
    })),
  });
});

vehiclesRouter.get("/v1/work-orders/:id/part-lines", async (c) => {
  const id = c.req.param("id");
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("fleet_work_order_line_items")
    .select("id, description, part_number, quantity, unit_price, total, inventory_item_id, van_id, fleet_vehicle_id")
    .eq("fleet_work_order_id", id)
    .eq("line_type", "part")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return json({ data: data ?? [] });
});

vehiclesRouter.get("/v1/work-orders/:id/part-reservations", async (c) => {
  const id = c.req.param("id");
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("inventory_reservations")
    .select("id, inventory_item_id, quantity, status, van_id, notes")
    .eq("work_order_id", id)
    .eq("source", "fleet_work_order_parts");
  if (error) throw new Error(error.message);
  return json({ data: data ?? [] });
});

vehiclesRouter.post("/v1/work-orders/:id/parts/apply", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any).rpc("apply_work_order_parts_v1", {
    p_work_order_id: id,
    p_lines: body.lines ?? [],
  });
  if (error) throw new Error(error.message);
  const result = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  return json({
    data: {
      lines: typeof result.lines === "number" ? result.lines : 0,
      reservations: typeof result.reservations === "number" ? result.reservations : 0,
    },
  });
});

vehiclesRouter.post("/v1/work-orders/:id/parts/consume", async (c) => {
  const id = c.req.param("id");
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any).rpc("consume_work_order_parts_v1", {
    p_work_order_id: id,
  });
  if (error) throw new Error(error.message);
  const result = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  return json({
    data: { consumed: typeof result.consumed === "number" ? result.consumed : 0 },
  });
});

/** The vehicle-repairs edge function was removed; keep the unavailable contract. */
vehiclesRouter.post("/v1/vehicles/repairs/estimate", async (c) => {
  await requireAuth(c);
  return providerUnavailable("vehicle-repairs");
});

// ---------------------------------------------------------------------------
// Vehicle recommendations
// ---------------------------------------------------------------------------

vehiclesRouter.get("/v1/vehicle-recommendations", async (c) => {
  const url = new URL(c.req.url);
  const vehicleId = url.searchParams.get("vehicle_id");
  if (!vehicleId) throw new ApiError(400, "vehicle_id is required", "invalid_input");
  const { supabase, user } = await requireFleetScope(c, url.searchParams.get("selected_workspace_id"));
  const { data, error } = await (supabase as any)
    .from("vehicle_recommendations")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .eq("user_id", user.id)
    .eq("is_dismissed", false)
    .order("priority", { ascending: true });
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.get("/v1/maintenance-intervals", async (c) => {
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("maintenance_intervals")
    .select("*")
    .order("title");
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.patch("/v1/vehicle-recommendations/:id/dismiss", async (c) => {
  const id = c.req.param("id");
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { error } = await (supabase as any)
    .from("vehicle_recommendations")
    .update({ is_dismissed: true, dismissed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error("Failed to dismiss");
  return json({ data: { ok: true } });
});

vehiclesRouter.delete("/v1/vehicle-recommendations/:id", async (c) => {
  const id = c.req.param("id");
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { error } = await (supabase as any).from("vehicle_recommendations").delete().eq("id", id);
  if (error) throw new Error("Failed to mark complete");
  return json({ data: { ok: true } });
});

vehiclesRouter.post("/v1/vehicle-recommendations", async (c) => {
  const body = await c.req.json();
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { error } = await (supabase as any).from("vehicle_recommendations").insert([{
    ...(body.rec ?? body),
    user_id: user.id,
  }]);
  if (error) throw new Error("Failed to add recommendation");
  return json({ data: { ok: true } });
});

vehiclesRouter.post("/v1/vehicle-recommendations/generate", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const vehicleId = body.vehicle_id;
  const currentMileage = body.current_mileage ?? null;
  const intervals = body.intervals ?? [];
  if (!vehicleId) return json({ data: { count: 0 } });
  const client = supabase as any;
  const [servicesRes, existingRes] = await Promise.all([
    client.from("services").select("*").eq("vehicle_id", vehicleId).eq("user_id", user.id).order("service_date", { ascending: false }),
    client.from("vehicle_recommendations").select("recommendation_type").eq("vehicle_id", vehicleId).eq("user_id", user.id).eq("is_dismissed", false),
  ]);
  const services = servicesRes.data || [];
  const existingTypes = new Set((existingRes.data || []).map((r: { recommendation_type: string }) => r.recommendation_type));
  const { addMonths, format, isBefore, addDays } = await import("date-fns");
  const newRecs: Record<string, unknown>[] = [];
  for (const interval of intervals) {
    if (existingTypes.has(interval.service_type)) continue;
    const lastService = services.find((s: Record<string, unknown>) =>
      String(s.service_type ?? "").toLowerCase().includes(String(interval.service_type).replace("_", " ")) ||
      String(s.description ?? "").toLowerCase().includes(String(interval.service_type).replace("_", " "))
    );
    let dueMileage: number | null = null;
    let dueDate: string | null = null;
    let shouldAdd = false;
    if (lastService) {
      if (interval.default_interval_miles && currentMileage) {
        const lastMileage = currentMileage - interval.default_interval_miles;
        dueMileage = lastMileage + interval.default_interval_miles;
        if (currentMileage >= dueMileage - 500) shouldAdd = true;
      }
      if (interval.default_interval_months) {
        dueDate = format(addMonths(new Date(lastService.service_date as string), interval.default_interval_months), "yyyy-MM-dd");
        if (isBefore(new Date(dueDate), addDays(new Date(), 30))) shouldAdd = true;
      }
    } else {
      if (interval.default_interval_miles && currentMileage) {
        dueMileage = Math.ceil(currentMileage / interval.default_interval_miles) * interval.default_interval_miles;
        if (currentMileage >= dueMileage - 500) shouldAdd = true;
      }
    }
    if (shouldAdd) {
      newRecs.push({
        vehicle_id: vehicleId,
        recommendation_type: interval.service_type,
        title: interval.title,
        description: interval.description,
        priority: interval.priority,
        due_mileage: dueMileage,
        due_date: dueDate,
        interval_miles: interval.default_interval_miles,
        interval_months: interval.default_interval_months,
        last_service_mileage: null,
        last_service_date: lastService?.service_date || null,
        user_id: user.id,
      });
    }
  }
  if (newRecs.length > 0) {
    const { error } = await client.from("vehicle_recommendations").insert(newRecs);
    if (error) throw new Error("Failed to generate recommendations");
  }
  return json({ data: { count: newRecs.length } });
});

// ---------------------------------------------------------------------------
// Vehicle filters
// ---------------------------------------------------------------------------

vehiclesRouter.post("/v1/vehicles/filter-resolution", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any).rpc("resolve_vehicle_filters_v1", {
    p_year: body.year,
    p_make: body.make,
    p_model: body.model,
    p_engine: body.engine || null,
    p_vehicle_kind: body.vehicleKind || null,
    p_vehicle_id: body.vehicleId || null,
  });
  if (error) throw new Error(error.message);
  return json({ data: data ?? [] });
});

vehiclesRouter.post("/v1/vehicles/oil-reset-procedure", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any).rpc("resolve_oil_reset_procedure_v1", {
    p_year: body.year,
    p_make: body.make,
    p_model: body.model,
  });
  if (error) throw new Error(error.message);
  return json({ data: data ?? [] });
});

// ---------------------------------------------------------------------------
// Vans
// ---------------------------------------------------------------------------

vehiclesRouter.get("/v1/vans/:id/detail", async (c) => {
  const vanId = c.req.param("id");
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const client = supabase as any;
  const [vanRes, terrRes, invRes, apptsRes, techRes, whRes] = await Promise.all([
    client.from("vans").select("*").eq("id", vanId).eq("user_id", user.id).single(),
    client.from("van_territories").select("*").eq("van_id", vanId).order("zip_code"),
    client.from("van_inventory").select("*, inventory_items(name, sku, quantity)").eq("van_id", vanId),
    client.from("appointments")
      .select("id, title, scheduled_date, scheduled_time, status, guest_name")
      .eq("assigned_van_id", vanId)
      .order("scheduled_date", { ascending: false })
      .limit(50),
    client.from("technicians").select("id, name").eq("user_id", user.id).eq("is_active", true).order("name"),
    client.from("inventory_items").select("id, name, sku, quantity").eq("user_id", user.id).order("name"),
  ]);
  for (const res of [vanRes, terrRes, invRes, apptsRes, techRes, whRes]) {
    if (res.error) throw res.error;
  }
  return json({
    data: {
      van: vanRes.data ?? null,
      territories: terrRes.data ?? [],
      inventory: invRes.data ?? [],
      appointments: apptsRes.data ?? [],
      technicians: techRes.data ?? [],
      warehouseItems: whRes.data ?? [],
    },
  });
});

vehiclesRouter.patch("/v1/vans/:id", async (c) => {
  const vanId = c.req.param("id");
  const body = await c.req.json();
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { error } = await (supabase as any).from("vans").update(body.payload ?? body).eq("id", vanId);
  if (error) throw new Error(error.message);
  return json({ data: { ok: true } });
});

vehiclesRouter.post("/v1/vans/:id/territories", async (c) => {
  const vanId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { error } = await (supabase as any)
    .from("van_territories")
    .insert([{ van_id: vanId, zip_code: body.zip_code ?? body.zipCode }]);
  if (error) {
    if (error.code === "23505") {
      throw new ApiError(409, "Zip code already assigned to this van", "duplicate_territory");
    }
    throw new Error(error.message);
  }
  return json({ data: { ok: true } });
});

vehiclesRouter.post("/v1/vans/:id/territories/bulk", async (c) => {
  const vanId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const zipCodes: string[] = body.zip_codes ?? body.zipCodes ?? [];
  const inserts = zipCodes.map((zip_code) => ({ van_id: vanId, zip_code }));
  const { error } = await (supabase as any).from("van_territories").insert(inserts);
  if (error) throw new Error("Some zip codes may already exist");
  return json({ data: { ok: true } });
});

vehiclesRouter.delete("/v1/van-territories/:id", async (c) => {
  const id = c.req.param("id");
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { error } = await (supabase as any).from("van_territories").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return json({ data: { ok: true } });
});

vehiclesRouter.patch("/v1/van-territories/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const isPrimary = body.is_primary ?? body.isPrimary ?? body.current_value ?? body.currentValue;
  const { error } = await (supabase as any)
    .from("van_territories")
    .update({ is_primary: !isPrimary })
    .eq("id", id);
  if (error) throw new Error(error.message);
  return json({ data: { ok: true } });
});

vehiclesRouter.post("/v1/vans/:id/restock", async (c) => {
  const vanId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { error } = await (supabase as any).rpc("restock_van", {
    p_van_id: vanId,
    p_item_id: body.item_id ?? body.itemId,
    p_quantity: body.quantity,
  });
  if (error) throw new Error(error.message);
  return json({ data: { ok: true } });
});

vehiclesRouter.post("/v1/vans/:id/inventory", async (c) => {
  const vanId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { error } = await (supabase as any).from("van_inventory").insert([{
    van_id: vanId,
    inventory_item_id: body.item_id ?? body.itemId,
    quantity: body.quantity,
    min_quantity: body.min_quantity ?? body.minQuantity,
  }]);
  if (error) {
    if (error.code === "23505") {
      throw new ApiError(409, "Item already on this van", "duplicate_inventory_item");
    }
    throw new Error(error.message);
  }
  return json({ data: { ok: true } });
});

// ---------------------------------------------------------------------------
// Fleet clients & contacts
// ---------------------------------------------------------------------------

vehiclesRouter.get("/v1/fleet/clients/options", async (c) => {
  const url = new URL(c.req.url);
  const { supabase, user } = await requireFleetScope(c, url.searchParams.get("selected_workspace_id"));
  const { data } = await (supabase as any)
    .from("fleet_clients")
    .select("id, company_name")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("company_name");
  return json({ data: data ?? [] });
});

vehiclesRouter.get("/v1/fleet/registration-options", async (c) => {
  const url = new URL(c.req.url);
  const { supabase, user } = await requireFleetScope(c, url.searchParams.get("selected_workspace_id"));
  const client = supabase as any;
  const [clients, contracts] = await Promise.all([
    client
      .from("fleet_clients")
      .select("id, company_name")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("company_name"),
    client
      .from("fleet_contracts")
      .select("id, name, fleet_client_id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("name"),
  ]);
  return json({
    data: {
      clients: clients.data ?? [],
      contracts: contracts.data ?? [],
    },
  });
});

vehiclesRouter.post("/v1/fleet/clients", async (c) => {
  const body = await c.req.json();
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const client = supabase as any;
  const { data: created, error: clientErr } = await client
    .from("fleet_clients")
    .insert({ ...body.form, user_id: user.id })
    .select("id")
    .single();
  if (clientErr) throw clientErr;
  const validContacts = (body.contacts ?? []).filter((ct: { name: string }) => ct.name.trim());
  if (validContacts.length > 0) {
    const { error: contactErr } = await client.from("fleet_contacts").insert(
      validContacts.map((ct: Record<string, unknown>) => ({
        ...ct,
        fleet_client_id: created.id,
        user_id: user.id,
      })),
    );
    if (contactErr) throw contactErr;
  }
  return json({ data: created });
});

vehiclesRouter.get("/v1/fleet/clients/:id", async (c) => {
  const id = c.req.param("id");
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("fleet_clients")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (error) throw error;
  return json({ data });
});

vehiclesRouter.patch("/v1/fleet/clients/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("fleet_clients")
    .update(body.data ?? body)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return json({ data });
});

vehiclesRouter.get("/v1/fleet/clients/:id/counts", async (c) => {
  const clientId = c.req.param("id");
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const client = supabase as any;
  const [v, wo, loc, con, ct] = await Promise.all([
    client.from("fleet_vehicles").select("id", { count: "exact", head: true }).eq("fleet_client_id", clientId),
    client.from("fleet_work_orders").select("id", { count: "exact", head: true }).eq("fleet_client_id", clientId),
    client.from("fleet_locations").select("id", { count: "exact", head: true }).eq("fleet_client_id", clientId),
    client.from("fleet_contacts").select("id", { count: "exact", head: true }).eq("fleet_client_id", clientId),
    client.from("fleet_contracts").select("id", { count: "exact", head: true }).eq("fleet_client_id", clientId),
  ]);
  return json({
    data: {
      vehicles: v.count ?? 0,
      workOrders: wo.count ?? 0,
      locations: loc.count ?? 0,
      contacts: con.count ?? 0,
      contracts: ct.count ?? 0,
    },
  });
});

vehiclesRouter.get("/v1/fleet/clients/:id/readiness-counts", async (c) => {
  const clientId = c.req.param("id");
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const client = supabase as any;
  const [contacts, locations, contracts, purchaseOrders, vehicles, incompleteVehicles] = await Promise.all([
    client.from("fleet_contacts").select("id", { count: "exact", head: true }).eq("fleet_client_id", clientId),
    client.from("fleet_locations").select("id", { count: "exact", head: true }).eq("fleet_client_id", clientId),
    client.from("fleet_contracts").select("id", { count: "exact", head: true }).eq("fleet_client_id", clientId).eq("is_active", true),
    client.from("fleet_purchase_orders").select("id", { count: "exact", head: true }).eq("fleet_client_id", clientId).in("status", ["open", "partially_used"]),
    client.from("fleet_vehicles").select("id", { count: "exact", head: true }).eq("fleet_client_id", clientId),
    client.from("fleet_vehicles").select("id", { count: "exact", head: true }).eq("fleet_client_id", clientId)
      .or("vin.is.null,mileage.is.null,fleet_location_id.is.null,fleet_contract_id.is.null"),
  ]);
  return json({
    data: {
      contacts: contacts.count ?? 0,
      locations: locations.count ?? 0,
      contracts: contracts.count ?? 0,
      purchaseOrders: purchaseOrders.count ?? 0,
      vehicles: vehicles.count ?? 0,
      incompleteVehicles: incompleteVehicles.count ?? 0,
    },
  });
});

vehiclesRouter.get("/v1/fleet/clients/:id/vehicles", async (c) => {
  const clientId = c.req.param("id");
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("fleet_vehicles")
    .select("*, fleet_locations(name), fleet_contracts(name)")
    .eq("fleet_client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.get("/v1/fleet/clients/:id/work-orders", async (c) => {
  const clientId = c.req.param("id");
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("fleet_work_orders")
    .select("*, fleet_vehicles(year, make, model, unit_number)")
    .eq("fleet_client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return json({ data: data ?? [] });
});

/**
 * Dispatcher board — the current user's open fleet work orders. Previously
 * read directly from the browser Supabase client; now served here so RLS +
 * auth stay server-enforced. Filter set mirrors the legacy client query.
 */
vehiclesRouter.get("/v1/fleet/dispatch/work-orders", async (c) => {
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("fleet_work_orders")
    .select(
      "id, order_number, status, total, scheduled_date, completed_at, po_number, fleet_client_id, fleet_contract_id, fleet_clients(company_name, payment_terms, tax_exempt, billing_email, ap_contact_email), fleet_contracts(name, invoice_frequency, pricing_rules), fleet_vehicles(year, make, model, unit_number, mileage)",
    )
    .eq("user_id", user.id)
    .in("status", ["scheduled", "assigned", "en_route", "arrived", "in_progress", "completed"])
    .order("scheduled_date", { ascending: false });
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.get("/v1/fleet/clients/:id/locations", async (c) => {
  const clientId = c.req.param("id");
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("fleet_locations")
    .select("*")
    .eq("fleet_client_id", clientId)
    .order("name");
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.get("/v1/fleet/clients/:id/contracts", async (c) => {
  const clientId = c.req.param("id");
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("fleet_contracts")
    .select("*")
    .eq("fleet_client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.get("/v1/fleet/clients/:id/invoices", async (c) => {
  const clientId = c.req.param("id");
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("fleet_work_orders")
    .select("*, fleet_vehicles(year, make, model, unit_number)")
    .eq("fleet_client_id", clientId)
    .in("status", ["completed", "invoiced", "paid"])
    .order("completed_at", { ascending: false });
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.get("/v1/fleet/clients/:id/purchase-orders", async (c) => {
  const clientId = c.req.param("id");
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("fleet_purchase_orders")
    .select("*")
    .eq("fleet_client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.get("/v1/fleet/clients/:id/report-stats", async (c) => {
  const clientId = c.req.param("id");
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const client = supabase as any;
  const [vRes, woRes] = await Promise.all([
    client.from("fleet_vehicles").select("id", { count: "exact", head: true }).eq("fleet_client_id", clientId),
    client.from("fleet_work_orders").select("id, total, status").eq("fleet_client_id", clientId),
  ]);
  if (vRes.error) throw vRes.error;
  if (woRes.error) throw woRes.error;
  const completed = (woRes.data ?? []).filter((order: { status: string }) =>
    ["completed", "invoiced", "paid"].includes(order.status),
  );
  const totalSpend = completed.reduce((sum: number, order: { total: number }) => sum + (order.total || 0), 0);
  return json({
    data: { totalSpend, vehicleCount: vRes.count ?? 0, woCount: (woRes.data ?? []).length },
  });
});

vehiclesRouter.get("/v1/fleet/clients/:id/contacts", async (c) => {
  const clientId = c.req.param("id");
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("fleet_contacts")
    .select("*")
    .eq("fleet_client_id", clientId)
    .order("name");
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.post("/v1/fleet/contacts", async (c) => {
  const body = await c.req.json();
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { error } = await (supabase as any).from("fleet_contacts").insert({
    user_id: user.id,
    ...(body.payload ?? body),
  });
  if (error) throw error;
  return json({ data: { ok: true } });
});

vehiclesRouter.patch("/v1/fleet/contacts/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { error } = await (supabase as any)
    .from("fleet_contacts")
    .update(body.payload ?? body)
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
  return json({ data: { ok: true } });
});

vehiclesRouter.delete("/v1/fleet/contacts/:id", async (c) => {
  const id = c.req.param("id");
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { error } = await (supabase as any)
    .from("fleet_contacts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
  return json({ data: { ok: true } });
});

// ---------------------------------------------------------------------------
// Fleet contracts & contract services
// ---------------------------------------------------------------------------

function validateContractRulePayload(payload: Record<string, any>) {
  if (!payload.fleet_client_id || !payload.name) throw new ApiError(400, "Client and contract name are required.", "invalid_input");
  if (!payload.start_date || !payload.end_date) throw new ApiError(400, "Contract start and end dates are required.", "invalid_input");
  if (payload.start_date > payload.end_date) throw new ApiError(400, "Contract end date must be after start date.", "invalid_input");
  const ruleEngine = payload.rule_engine ?? {};
  if (!ruleEngine.sla_hours || ruleEngine.sla_hours <= 0) throw new ApiError(400, "SLA hours must be greater than zero.", "invalid_input");
  if (!ruleEngine.service_scope?.allowed_service_classes?.length) throw new ApiError(400, "At least one service class is required.", "invalid_input");
  if (!ruleEngine.billing?.invoice_group) throw new ApiError(400, "Billing invoice group is required.", "invalid_input");
  if (payload.is_active) {
    if (ruleEngine.approval?.mode === "hybrid" && ruleEngine.approval?.threshold_amount <= 0) {
      throw new ApiError(400, "Hybrid approval mode requires a positive threshold.", "invalid_input");
    }
    if (ruleEngine.po?.requires_po && !ruleEngine.po?.validate_remaining_balance) {
      throw new ApiError(400, "PO-required contracts must validate remaining balance.", "invalid_input");
    }
  }
}

vehiclesRouter.get("/v1/fleet/contracts", async (c) => {
  const url = new URL(c.req.url);
  const { supabase, user } = await requireFleetScope(c, url.searchParams.get("selected_workspace_id"));
  const { data } = await (supabase as any)
    .from("fleet_contracts")
    .select("*, fleet_clients(company_name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  return json({ data: data ?? [] });
});

vehiclesRouter.post("/v1/fleet/contracts", async (c) => {
  const body = await c.req.json();
  const payload = body.payload ?? body;
  validateContractRulePayload(payload);
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const versionMeta = {
    engine: "contract_rule_engine_v1",
    revision: 1,
    created_at: new Date().toISOString(),
    created_by: user.id,
    change_summary: payload.change_summary || "Initial contract rule set",
  };
  const pricing_rules = { ...payload.rule_engine, version_meta: versionMeta };
  const { data, error } = await (supabase as any).from("fleet_contracts").insert({
    user_id: user.id,
    fleet_client_id: payload.fleet_client_id,
    name: payload.name,
    sla_hours: payload.rule_engine.sla_hours,
    approval_threshold: payload.rule_engine.approval.threshold_amount || null,
    invoice_frequency: payload.rule_engine.billing.invoice_frequency,
    start_date: payload.start_date,
    end_date: payload.end_date,
    notes: JSON.stringify({ version_history: [versionMeta] }),
    is_active: payload.is_active,
    pricing_rules,
  }).select("id").single();
  if (error) throw new Error(error.message);
  await logFleetAudit(supabase, {
    action: "settings.updated",
    userId: user.id,
    tableName: "fleet_contracts",
    recordId: data.id,
    newData: {
      event: "contract_created",
      version_meta: versionMeta,
      approval_mode: payload.rule_engine.approval.mode,
      billing_model: payload.rule_engine.billing.model,
      requires_po: payload.rule_engine.po.requires_po,
      service_scope: payload.rule_engine.service_scope.allowed_service_classes,
    },
  });
  return json({ data: { id: data.id } });
});

vehiclesRouter.patch("/v1/fleet/contracts/:id", async (c) => {
  const contractId = c.req.param("id");
  const body = await c.req.json();
  const payload = body.payload ?? body;
  validateContractRulePayload(payload);
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const client = supabase as any;
  const { data: existing } = await client
    .from("fleet_contracts")
    .select("pricing_rules, notes")
    .eq("id", contractId)
    .eq("user_id", user.id)
    .maybeSingle();
  const currentRules = (existing?.pricing_rules as Record<string, unknown> | null) ?? {};
  const currentRevision = Number((currentRules.version_meta as Record<string, unknown> | undefined)?.revision || 0);
  const nextRevision = currentRevision + 1;
  const revisionMeta = {
    engine: "contract_rule_engine_v1",
    revision: nextRevision,
    updated_at: new Date().toISOString(),
    updated_by: user.id,
    change_summary: payload.change_summary || "Contract rules updated",
  };
  const nextRules = { ...payload.rule_engine, version_meta: revisionMeta };
  let history: Array<Record<string, unknown>> = [];
  try {
    const parsed = existing?.notes ? JSON.parse(existing.notes) : {};
    history = Array.isArray(parsed?.version_history) ? parsed.version_history : [];
  } catch {
    history = [];
  }
  const { error } = await client
    .from("fleet_contracts")
    .update({
      fleet_client_id: payload.fleet_client_id,
      name: payload.name,
      sla_hours: payload.rule_engine.sla_hours,
      approval_threshold: payload.rule_engine.approval.threshold_amount || null,
      invoice_frequency: payload.rule_engine.billing.invoice_frequency,
      start_date: payload.start_date,
      end_date: payload.end_date,
      is_active: payload.is_active,
      pricing_rules: nextRules,
      notes: JSON.stringify({ version_history: [...history, revisionMeta] }),
    })
    .eq("id", contractId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  await logFleetAudit(supabase, {
    action: "settings.updated",
    userId: user.id,
    tableName: "fleet_contracts",
    recordId: contractId,
    newData: {
      event: "contract_updated",
      revision: nextRevision,
      approval_mode: payload.rule_engine.approval.mode,
      billing_model: payload.rule_engine.billing.model,
      requires_po: payload.rule_engine.po.requires_po,
      service_scope: payload.rule_engine.service_scope.allowed_service_classes,
    },
  });
  return json({ data: { ok: true } });
});

vehiclesRouter.delete("/v1/fleet/contracts/:id", async (c) => {
  const contractId = c.req.param("id");
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("fleet_contracts")
    .delete()
    .eq("id", contractId)
    .eq("user_id", user.id)
    .select();
  if (error) throw error;
  return json({ data: data ?? [] });
});

const CONTRACT_SERVICE_SELECT =
  "*, service_catalog(id, name, description, category, default_price, estimated_duration)";

vehiclesRouter.get("/v1/fleet/contracts/billing", async (c) => {
  const url = new URL(c.req.url);
  const workspaceId = url.searchParams.get("selected_workspace_id");
  if (!workspaceId) throw new ApiError(400, "selected_workspace_id is required", "invalid_input");
  const { supabase } = await requireFleetScope(c, workspaceId);
  const db = supabase as any;
  const { data: ownerId, error: ownerError } = await db.rpc("current_workspace_owner_user_id");
  if (ownerError || !ownerId) throw ownerError ?? new Error("No active Fleet workspace.");
  const workspaceOwnerUserId = String(ownerId);
  const { data, error } = await (supabase as any)
    .from("fleet_contracts")
    .select("id, name, contract_number, fleet_client_id, invoice_frequency, pricing_rules, fleet_contract_services(*)")
    .eq("user_id", workspaceOwnerUserId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.get("/v1/fleet/contract-services", async (c) => {
  const url = new URL(c.req.url);
  const contractId = url.searchParams.get("contract_id");
  if (!contractId) throw new ApiError(400, "contract_id is required", "invalid_input");
  const { supabase } = await requireFleetScope(c, url.searchParams.get("selected_workspace_id"));
  const { data, error } = await (supabase as any)
    .from("fleet_contract_services")
    .select(CONTRACT_SERVICE_SELECT)
    .eq("fleet_contract_id", contractId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.get("/v1/fleet/contract-services/for-client", async (c) => {
  const url = new URL(c.req.url);
  const clientId = url.searchParams.get("client_id");
  if (!clientId) throw new ApiError(400, "client_id is required", "invalid_input");
  const { supabase, user } = await requireFleetScope(c, url.searchParams.get("selected_workspace_id"));
  const client = supabase as any;
  const { data: contracts } = await client
    .from("fleet_contracts")
    .select("id")
    .eq("fleet_client_id", clientId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1);
  if (!contracts?.length) return json({ data: [] });
  const { data, error } = await client
    .from("fleet_contract_services")
    .select(CONTRACT_SERVICE_SELECT)
    .eq("fleet_contract_id", contracts[0].id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return json({ data: data ?? [] });
});

class ContractServiceValidationError extends Error {
  field: "service_catalog_id" | "custom_price" | "custom_label" | "estimated_duration";
  constructor(field: ContractServiceValidationError["field"], message: string) {
    super(message);
    this.name = "ContractServiceValidationError";
    this.field = field;
  }
}

function validateContractServiceInput(input: Record<string, unknown>): void {
  if (!input.service_catalog_id || String(input.service_catalog_id).trim() === "") {
    throw new ContractServiceValidationError(
      "service_catalog_id",
      "A platform service must be selected for every contract pricing tier.",
    );
  }
  if (input.custom_price != null && input.custom_price !== "") {
    const priceNum = typeof input.custom_price === "string" ? Number(input.custom_price) : input.custom_price;
    if (!Number.isFinite(priceNum)) {
      throw new ContractServiceValidationError("custom_price", "Contract price must be a number.");
    }
    if ((priceNum as number) < 0) {
      throw new ContractServiceValidationError("custom_price", "Contract price cannot be negative.");
    }
  }
  if (input.custom_label != null && String(input.custom_label).length > 0 && String(input.custom_label).trim().length === 0) {
    throw new ContractServiceValidationError("custom_label", "Custom label cannot be blank whitespace.");
  }
  if (input.estimated_duration != null && input.estimated_duration !== "") {
    const durNum = typeof input.estimated_duration === "string" ? Number(input.estimated_duration) : input.estimated_duration;
    if (!Number.isFinite(durNum)) {
      throw new ContractServiceValidationError("estimated_duration", "Estimated duration must be a number of minutes.");
    }
    if ((durNum as number) < 0) {
      throw new ContractServiceValidationError("estimated_duration", "Estimated duration cannot be negative.");
    }
  }
}

function translateContractServiceError(error: { code?: string; message: string }): never {
  if (error.code === "23505") {
    throw new ApiError(409, "This service is already attached to the contract.", "duplicate_contract_service");
  }
  if (error.code === "23514") {
    if (/custom_price/i.test(error.message)) {
      throw new ApiError(400, "Contract price cannot be negative.", "contract_service_check_violation");
    }
    if (/custom_label/i.test(error.message)) {
      throw new ApiError(400, "Custom label cannot be blank whitespace.", "contract_service_check_violation");
    }
    throw new ApiError(400, error.message, "contract_service_check_violation");
  }
  throw new Error(error.message);
}

vehiclesRouter.post("/v1/fleet/contract-services", async (c) => {
  const body = await c.req.json();
  const payload = body.payload ?? body;
  try {
    validateContractServiceInput({
      service_catalog_id: payload.service_catalog_id,
      custom_price: payload.custom_price,
      custom_label: payload.custom_label,
      estimated_duration: payload.estimated_duration,
    });
  } catch (error) {
    if (error instanceof ContractServiceValidationError) throw new ApiError(400, error.message, "invalid_input");
    throw error;
  }
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { error } = await (supabase as any).from("fleet_contract_services").insert({
    user_id: user.id,
    fleet_contract_id: payload.fleet_contract_id,
    service_catalog_id: payload.service_catalog_id,
    custom_price: payload.custom_price ?? null,
    custom_label: payload.custom_label ?? null,
    pricing_model: payload.pricing_model || "fixed",
    notes: payload.notes ?? null,
    billing_frequency: payload.billing_frequency ?? null,
  });
  if (error) translateContractServiceError(error);
  return json({ data: { ok: true } });
});

vehiclesRouter.patch("/v1/fleet/contract-services/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const updates = body.updates ?? body;
  if ("custom_price" in updates || "custom_label" in updates) {
    try {
      validateContractServiceInput({
        service_catalog_id: "__update__",
        custom_price: updates.custom_price,
        custom_label: updates.custom_label,
      });
    } catch (error) {
      if (error instanceof ContractServiceValidationError) throw new ApiError(400, error.message, "invalid_input");
      throw error;
    }
  }
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { error } = await (supabase as any)
    .from("fleet_contract_services")
    .update(updates)
    .eq("id", id);
  if (error) translateContractServiceError(error);
  return json({ data: { ok: true } });
});

vehiclesRouter.delete("/v1/fleet/contract-services/:id", async (c) => {
  const id = c.req.param("id");
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { error } = await (supabase as any).from("fleet_contract_services").delete().eq("id", id);
  if (error) throw error;
  return json({ data: { ok: true } });
});

vehiclesRouter.post("/v1/fleet/contract-services/bulk", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const contractId = body.contract_id;
  const services = body.services ?? [];
  if (!contractId) throw new ApiError(400, "contract_id is required", "invalid_input");
  if (!services.length) return json({ data: { ok: true } });
  services.forEach((s: Record<string, unknown>, idx: number) => {
    try {
      validateContractServiceInput(s);
    } catch (err) {
      if (err instanceof ContractServiceValidationError) {
        throw new ApiError(400, `Row ${idx + 1}: ${err.message}`, "invalid_input");
      }
      throw err;
    }
  });
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const rows = services.map((s: Record<string, unknown>, idx: number) => ({
    user_id: user.id,
    fleet_contract_id: contractId,
    service_catalog_id: s.service_catalog_id,
    custom_price: s.custom_price ?? null,
    custom_label: s.custom_label ?? null,
    pricing_model: "fixed",
    sort_order: idx,
  }));
  const { error } = await (supabase as any)
    .from("fleet_contract_services")
    .upsert(rows, { onConflict: "fleet_contract_id,service_catalog_id" });
  if (error) translateContractServiceError(error);
  return json({ data: { ok: true } });
});

// ---------------------------------------------------------------------------
// Fleet work orders
// ---------------------------------------------------------------------------

function parsePoLedgerPolicy(notes: string | null) {
  try {
    const parsed = notes ? JSON.parse(notes) : {};
    const policy = (parsed?.ledger_policy ?? parsed ?? {}) as Record<string, unknown>;
    return {
      maxPerJob: Number(policy.max_per_job || 0) || null,
      maxPerVehicle: Number(policy.max_per_vehicle || 0) || null,
      blockWorkWhenExceeded: policy.block_work_when_exceeded !== false,
      blockInvoicingWhenExceeded: policy.block_invoicing_when_exceeded !== false,
    };
  } catch {
    return {
      maxPerJob: null as number | null,
      maxPerVehicle: null as number | null,
      blockWorkWhenExceeded: true,
      blockInvoicingWhenExceeded: true,
    };
  }
}

function computePoRemaining(po: { amount_limit: unknown; amount_authorized: unknown; amount_consumed: unknown; amount_used: unknown }) {
  const limit = Number(po.amount_limit ?? 0);
  const authorized = Number(po.amount_authorized ?? 0);
  const consumed = Number(po.amount_consumed ?? po.amount_used ?? 0);
  return {
    limit,
    reserved: Math.max(0, authorized - consumed),
    consumed,
    remaining: Math.max(0, limit - authorized),
  };
}

function computeLedgerNetForEntries(entries: Array<{ entry_type: string; amount: unknown }>) {
  let netReserved = 0;
  let consumed = 0;
  for (const entry of entries) {
    const amount = Number(entry.amount || 0);
    if (entry.entry_type === "authorized") {
      netReserved += amount;
    } else if (entry.entry_type === "released") {
      netReserved -= amount;
    } else if (["consumed", "adjusted"].includes(entry.entry_type)) {
      consumed += amount;
      netReserved -= amount;
    }
  }
  return { netReserved: Math.max(0, netReserved), consumed };
}

async function assertPoLedgerWithinLimits(
  db: any,
  input: {
    userId: string;
    poId: string;
    workOrderId: string;
    vehicleId: string | null;
    orderTotal: number;
    stage: "work" | "invoice";
  },
): Promise<void> {
  const [{ data: po }, { data: orderLedger }, { data: vehicleLedger }] = await Promise.all([
    db
      .from("fleet_purchase_orders")
      .select("id,po_number,notes,amount_limit,amount_authorized,amount_consumed,amount_used,status")
      .eq("id", input.poId)
      .eq("user_id", input.userId)
      .maybeSingle(),
    db
      .from("fleet_po_ledger_entries")
      .select("entry_type,amount")
      .eq("fleet_work_order_id", input.workOrderId)
      .eq("user_id", input.userId),
    input.vehicleId
      ? db
          .from("fleet_po_ledger_entries")
          .select("entry_type,amount")
          .eq("fleet_purchase_order_id", input.poId)
          .eq("user_id", input.userId)
          .contains("metadata", { vehicle_id: input.vehicleId })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (!po) throw new Error("Linked PO not found.");
  if (!["open", "partially_used"].includes(String(po.status || ""))) {
    throw new Error("PO is not active for authorization.");
  }

  const policy = parsePoLedgerPolicy(po.notes);
  const poState = computePoRemaining(po);
  const orderNet = computeLedgerNetForEntries(orderLedger || []);
  const vehicleNet = computeLedgerNetForEntries(vehicleLedger || []);

  if (policy.maxPerJob && input.orderTotal > policy.maxPerJob) {
    throw new Error(`PO max-per-job limit exceeded (${policy.maxPerJob.toFixed(2)}).`);
  }
  if (policy.maxPerVehicle && vehicleNet.netReserved > policy.maxPerVehicle) {
    throw new Error(`PO max-per-vehicle limit exceeded (${policy.maxPerVehicle.toFixed(2)}).`);
  }

  if (input.stage === "work" && !policy.blockWorkWhenExceeded) return;
  if (input.stage === "invoice" && !policy.blockInvoicingWhenExceeded) return;

  if (orderNet.netReserved <= 0) {
    throw new Error(input.stage === "invoice"
      ? "Invoicing blocked: no PO authorization reserved for this work order."
      : "Work is blocked: no PO authorization reserved for this work order.");
  }
  if (input.orderTotal > orderNet.netReserved) {
    throw new Error(input.stage === "invoice"
      ? "Invoicing blocked: invoice total exceeds reserved PO authorization for this work order."
      : "Work is blocked: total exceeds reserved PO authorization for this work order.");
  }
  if (poState.remaining < 0) {
    throw new Error("PO ledger balance is over-authorized.");
  }
}

async function transitionFleetWorkOrderStatus(
  db: any,
  userId: string,
  input: {
    workOrderId: string;
    targetStatus: string;
    actorRole?: string;
    reasonCode?: string;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await db.rpc("transition_fleet_work_order", {
    p_work_order_id: input.workOrderId,
    p_target_status: input.targetStatus,
    p_actor_role: input.actorRole || "provider",
    p_reason_code: input.reasonCode || "manual",
    p_details: input.details || {},
  });
  if (error) {
    // Compatibility for environments where the lifecycle RPC was deployed before
    // fleet_work_orders.po_authorization_status. Completion does not use PO
    // authorization, so retain the owner completion path while the additive
    // schema migration rolls out. Never use this fallback for invoicing.
    const missingPoAuthorizationField = error.message?.includes('record "v_order" has no field "po_authorization_status"');
    if (missingPoAuthorizationField && ["in_progress", "completed"].includes(input.targetStatus)) {
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = {
        status: input.targetStatus,
        updated_at: now,
      };
      if (input.targetStatus === "completed") patch.completed_at = now;
      const { error: fallbackError } = await db
        .from("fleet_work_orders")
        .update(patch)
        .eq("id", input.workOrderId)
        .eq("user_id", userId);
      if (fallbackError) throw new Error(fallbackError.message || "Failed lifecycle transition");
      return;
    }
    throw new Error(error.message || "Failed lifecycle transition");
  }
}

function buildDeterministicIdempotencyKey(parts: string[]): string {
  let hash = 2166136261;
  for (const part of parts) {
    for (let i = 0; i < part.length; i += 1) {
      hash ^= part.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
  }
  return `idemp_${(hash >>> 0).toString(36)}`;
}

async function acquireOperationLock(
  db: any,
  input: {
    userId: string;
    operationType: string;
    idempotencyKey: string;
    context?: Record<string, unknown>;
  },
): Promise<{ batchId: string | null; duplicateCompleted: boolean }> {
  const { data: existing } = await db
    .from("fleet_operation_batches")
    .select("id,status")
    .eq("user_id", input.userId)
    .eq("operation_type", input.operationType)
    .eq("idempotency_key", input.idempotencyKey)
    .in("status", ["running", "completed"])
    .maybeSingle();
  if (existing?.status === "completed") {
    return { batchId: null, duplicateCompleted: true };
  }
  if (existing?.status === "running") {
    throw new Error("A matching operation is already in progress. Please retry after it completes.");
  }
  const { data: batch, error: insertError } = await db
    .from("fleet_operation_batches")
    .insert({
      user_id: input.userId,
      operation_type: input.operationType,
      status: "running",
      idempotency_key: input.idempotencyKey,
      context: input.context || {},
    })
    .select("id")
    .maybeSingle();
  if (insertError) {
    if (insertError.code !== "23505") {
      throw new Error(insertError.message || "Failed to acquire operation lock.");
    }
    const { data: collision } = await db
      .from("fleet_operation_batches")
      .select("id,status")
      .eq("user_id", input.userId)
      .eq("operation_type", input.operationType)
      .eq("idempotency_key", input.idempotencyKey)
      .in("status", ["running", "completed"])
      .maybeSingle();
    if (collision?.status === "completed") {
      return { batchId: null, duplicateCompleted: true };
    }
    throw new Error("A matching operation is already in progress. Please retry after it completes.");
  }
  return { batchId: String(batch?.id || ""), duplicateCompleted: false };
}

async function finalizeOperationLock(
  db: any,
  input: {
    userId: string;
    batchId: string | null;
    failed?: boolean;
    errorMessage?: string | null;
  },
): Promise<void> {
  if (!input.batchId) return;
  await db
    .from("fleet_operation_batches")
    .update({
      status: input.failed ? "failed" : "completed",
      completed_at: new Date().toISOString(),
      error_message: input.errorMessage || null,
    })
    .eq("id", input.batchId)
    .eq("user_id", input.userId);
}

type RuntimeOverrideAction =
  | "completion_gate"
  | "status_transition_exception"
  | "po_policy_exception"
  | "invoice_adjustment_exception";

type RuntimeOverrideReasonCode =
  | "vin_mismatch"
  | "location_window_exception"
  | "contract_rule_exception"
  | "service_package_missing"
  | "service_profile_missing"
  | "po_limit_exception"
  | "invoice_delta_exception"
  | "other";

const OVERRIDE_GOVERNANCE: Record<
  RuntimeOverrideAction,
  {
    allowedRoles: string[];
    allowedReasonCodes: RuntimeOverrideReasonCode[];
    requireApprovalChain: boolean;
    approvalMin: number;
  }
> = {
  completion_gate: {
    allowedRoles: ["admin", "provider_owner", "ops_manager", "fleet_manager"],
    allowedReasonCodes: [
      "vin_mismatch",
      "location_window_exception",
      "contract_rule_exception",
      "service_package_missing",
      "service_profile_missing",
      "other",
    ],
    requireApprovalChain: false,
    approvalMin: 0,
  },
  status_transition_exception: {
    allowedRoles: ["admin", "provider_owner", "ops_manager"],
    allowedReasonCodes: ["contract_rule_exception", "other"],
    requireApprovalChain: true,
    approvalMin: 1,
  },
  po_policy_exception: {
    allowedRoles: ["admin", "provider_owner", "finance_manager"],
    allowedReasonCodes: ["po_limit_exception", "other"],
    requireApprovalChain: true,
    approvalMin: 1,
  },
  invoice_adjustment_exception: {
    allowedRoles: ["admin", "provider_owner", "finance_manager"],
    allowedReasonCodes: ["invoice_delta_exception", "other"],
    requireApprovalChain: true,
    approvalMin: 1,
  },
};

function assertRuntimeOverrideGovernance(input: {
  request: { action: RuntimeOverrideAction; reasonCode: RuntimeOverrideReasonCode; approvalChain?: Array<{ approverUserId: string; approverRole: string; approvedAt: string }> };
  actorRole: string;
}): void {
  const policy = OVERRIDE_GOVERNANCE[input.request.action];
  if (!policy) {
    throw new Error("Override action is not recognized by governance policy.");
  }
  if (!policy.allowedRoles.includes(input.actorRole)) {
    throw new Error(`Override action '${input.request.action}' is not permitted for role '${input.actorRole}'.`);
  }
  if (!policy.allowedReasonCodes.includes(input.request.reasonCode)) {
    throw new Error(`Reason code '${input.request.reasonCode}' is not allowed for '${input.request.action}'.`);
  }
  if (policy.requireApprovalChain) {
    const chain = input.request.approvalChain || [];
    if (chain.length < policy.approvalMin) {
      throw new Error(`Override action '${input.request.action}' requires an approval chain.`);
    }
  }
}

function assertOptimisticWorkOrderGuard(
  workOrder: { status?: string | null; updated_at?: string | null },
  options?: { expectedStatus?: string | null; expectedUpdatedAt?: string | null } | null,
): void {
  if (!options) return;
  if (options.expectedStatus && workOrder.status && workOrder.status !== options.expectedStatus) {
    throw new Error(`Stale action rejected: expected status '${options.expectedStatus}' but found '${workOrder.status}'.`);
  }
  if (options.expectedUpdatedAt && workOrder.updated_at && workOrder.updated_at !== options.expectedUpdatedAt) {
    throw new Error("Stale action rejected: work order changed since last read. Refresh and retry.");
  }
}

function resolveIntegrityIdempotencyKey(
  parts: string[],
  options?: { idempotencyKey?: string | null; replayToken?: string | null } | null,
): string {
  if (options?.idempotencyKey && options.idempotencyKey.trim()) {
    return options.idempotencyKey.trim();
  }
  if (options?.replayToken && options.replayToken.trim()) {
    return buildDeterministicIdempotencyKey([...parts, options.replayToken.trim()]);
  }
  return buildDeterministicIdempotencyKey(parts);
}

async function getFleetWorkOrderStatusForUser(db: any, workOrderId: string, userId: string): Promise<string> {
  const { data, error } = await db
    .from("fleet_work_orders")
    .select("status")
    .eq("id", workOrderId)
    .eq("user_id", userId)
    .single();
  if (error || !data) throw new Error("Work order not found");
  return data.status;
}

function assertFleetWorkOrderEditableForAction(
  status: string,
  action: "full" | "limited" | "restricted",
): void {
  const full = status === "draft" || status === "pending_review";
  const limited = status === "scheduled" || status === "assigned";
  const restricted = status === "in_progress";
  const locked = status === "completed" || status === "invoiced";

  if (locked) throw new Error("Work order is locked at this lifecycle stage.");
  if (action === "full" && !full) throw new Error("This action is only allowed in draft status.");
  if (action === "limited" && !(full || limited)) throw new Error("This action is not allowed for current status.");
  if (action === "restricted" && !(full || limited || restricted)) {
    throw new Error("This action is not allowed for current status.");
  }
}

// ---------------------------------------------------------------------------
// Fleet vehicles & vans
// ---------------------------------------------------------------------------

vehiclesRouter.post("/v1/vans", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const payload = body.payload ?? body;
  if (!payload.name) throw new ApiError(400, "Van name is required.", "invalid_input");
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { error } = await (supabase as any).from("vans").insert([
    {
      user_id: user.id,
      name: payload.name,
      vin: payload.vin || null,
      license_plate: payload.license_plate || null,
      make: payload.make || null,
      model: payload.model || null,
      year: payload.year ?? null,
      assigned_technician_id: payload.assigned_technician_id || null,
    },
  ]);
  if (error) throw new Error("Failed to create van");
  return json({ data: { ok: true } });
});

vehiclesRouter.post("/v1/fleet/vehicles", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const payload = body.payload ?? body;
  const { validateFleetVehicle, assertValid } = await import("@/application/validation/fleet-validation");
  assertValid(
    validateFleetVehicle(payload),
    "Cannot create vehicle",
  );
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any).from("fleet_vehicles").insert([
    {
      user_id: user.id,
      fleet_client_id: payload.fleet_client_id,
      fleet_location_id: payload.fleet_location_id || null,
      fleet_contract_id: payload.fleet_contract_id || null,
      year: payload.year,
      make: payload.make,
      model: payload.model,
      unit_number: payload.unit_number || null,
      vin: payload.vin ? String(payload.vin).trim().toUpperCase() : null,
      license_plate: payload.license_plate || null,
      mileage: payload.mileage ?? null,
      status: payload.status,
      notes: payload.notes || null,
      engine: payload.engine ?? null,
      color: payload.color ?? null,
      fuel_type: payload.fuel_type ?? null,
      last_service_date: payload.last_service_date ?? null,
      last_service_mileage: payload.last_service_mileage ?? null,
      next_service_date: payload.next_service_date ?? null,
      next_service_mileage: payload.next_service_mileage ?? null,
    },
  ]).select("id").single();
  if (error || !data) throw new Error("Failed to create fleet vehicle");
  return json({ data: { id: String(data.id) } });
});

vehiclesRouter.patch("/v1/fleet/vehicles/:id", async (c) => {
  const vehicleId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const payload = body.payload ?? body;
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;
  const { error } = await db
    .from("fleet_vehicles")
    .update(payload)
    .eq("id", vehicleId)
    .eq("user_id", user.id);
  if (error) throw new Error("Failed to update fleet vehicle");

  // VIN/YMM/engine changes invalidate the old fitment snapshot. Resolve from the
  // saved canonical vehicle and refresh every active job without disturbing its
  // other parts_used context.
  if (["vin", "year", "make", "model", "engine"].some((field) => field in payload)) {
    try {
      const { data: vehicle } = await db
        .from("fleet_vehicles")
        .select("id,vin,year,make,model,engine")
        .eq("id", vehicleId)
        .eq("user_id", user.id)
        .single();
      if (vehicle?.year && vehicle.make && vehicle.model) {
        const { data: filters } = await db.rpc("resolve_vehicle_filters_v1", {
          p_year: vehicle.year,
          p_make: vehicle.make,
          p_model: vehicle.model,
          p_engine: vehicle.engine || null,
          p_vehicle_kind: "fleet",
          p_vehicle_id: vehicleId,
        });
        const resolved = filters ?? [];
        const filterMatch = {
          status: resolved.length > 0 ? "resolved" : "no_match",
          resolved_at: new Date().toISOString(),
          vehicle: {
            id: vehicle.id,
            vin: vehicle.vin,
            year: vehicle.year,
            make: vehicle.make,
            model: vehicle.model,
            engine: vehicle.engine,
          },
          filters: resolved.map((filter: { part_category: string; brand: string; part_number: string; quantity: number; source: string }) => ({
            part_category: filter.part_category,
            brand: filter.brand,
            part_number: filter.part_number,
            quantity: filter.quantity,
            source: filter.source,
          })),
        };
        const { data: activeOrders } = await db
          .from("fleet_work_orders")
          .select("id,parts_used")
          .eq("fleet_vehicle_id", vehicleId)
          .eq("user_id", user.id)
          .in("status", ["draft", "pending_review", "scheduled", "assigned", "in_progress"]);
        await Promise.all((activeOrders ?? []).map((order: { id: string; parts_used: unknown }) => {
          const current = order.parts_used && typeof order.parts_used === "object" && !Array.isArray(order.parts_used)
            ? order.parts_used as Record<string, unknown>
            : {};
          return db
            .from("fleet_work_orders")
            .update({ parts_used: { ...current, vehicle_filter_match: filterMatch } })
            .eq("id", order.id)
            .eq("user_id", user.id);
        }));
      }
    } catch {
      // Vehicle edits remain available if reference lookup is temporarily down;
      // the work-order UI will show its explicit unavailable/no-match state.
    }
  }
  return json({ data: { ok: true } });
});

vehiclesRouter.delete("/v1/fleet/vehicles/:id", async (c) => {
  const vehicleId = c.req.param("id");
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { error } = await (supabase as any)
    .from("fleet_vehicles")
    .delete()
    .eq("id", vehicleId)
    .eq("user_id", user.id);
  if (error) throw new Error("Failed to delete fleet vehicle");
  return json({ data: { ok: true } });
});

vehiclesRouter.post("/v1/fleet/work-orders", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const payload = body.payload ?? body;
  const { validateFleetWorkOrder, assertValid } = await import("@/application/validation/fleet-validation");
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;

  const { data: vehicle } = await db
    .from("fleet_vehicles")
    .select("id, fleet_client_id, fleet_location_id, fleet_contract_id")
    .eq("id", payload.vehicleId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!vehicle) {
    throw new Error("Selected vehicle is invalid.");
  }

  // Validate (block on DB+linkage+finance gaps; warnings are emitted for the UI).
  assertValid(
    validateFleetWorkOrder({
      vehicleId: payload.vehicleId,
      vehicleClientId: vehicle.fleet_client_id,
      servicePackage: payload.servicePackage ?? null,
      description: payload.description ?? null,
      scheduledDate: payload.scheduledDate ?? null,
      priority: payload.priority ?? null,
    }),
    "Cannot create work order",
  );

  // DB+linkage rule: vehicle must reference a client. Location/contract are optional.
  if (!vehicle.fleet_client_id) {
    throw new Error("Vehicle is not linked to a fleet client — fix the vehicle first.");
  }

  // Soft consistency: warn if payload diverges from vehicle linkage, but don't block.
  const divergedClient = payload.clientId && payload.clientId !== vehicle.fleet_client_id;
  if (divergedClient) {
    throw new Error("Work order client must match the vehicle's fleet client.");
  }

  const clientId = vehicle.fleet_client_id;
  const locationId = vehicle.fleet_location_id ?? payload.locationId ?? null;
  const contractId = vehicle.fleet_contract_id ?? payload.contractId ?? null;

  // Contract is optional — only enforce contract-driven rules when one is linked.
  let contract: { id: string; sla_hours: number | null; approval_threshold: number | null; pricing_rules: unknown } | null = null;
  if (contractId) {
    const { data: found } = await db
      .from("fleet_contracts")
      .select("id, sla_hours, approval_threshold, pricing_rules")
      .eq("id", contractId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!found) throw new Error("Vehicle-linked contract is invalid.");
    contract = found;
  }

  const pricingRules = (contract?.pricing_rules as Record<string, unknown> | null) ?? null;
  const approvalRules = (pricingRules?.approval as Record<string, unknown> | null) ?? null;
  const poRules = (pricingRules?.po as Record<string, unknown> | null) ?? null;
  const serviceScopeRules = (pricingRules?.service_scope as Record<string, unknown> | null) ?? null;
  const schedulingRules = (pricingRules?.scheduling as Record<string, unknown> | null) ?? null;
  const poRequiredByContract =
    Boolean(poRules?.requires_po) ||
    Boolean(pricingRules?.requires_po) ||
    Boolean(pricingRules?.po_required) ||
    Boolean(pricingRules?.poRequired);

  if (poRequiredByContract && !payload.poNumber) {
    throw new Error("A valid PO is required by the selected contract.");
  }

  let selectedPo: Record<string, unknown> | null = null;
  const reserveAmount = Math.max(0, Number(payload.servicePackage?.estimatedAmount ?? 0));

  if (payload.poNumber) {
    const { data: po } = await db
      .from("fleet_purchase_orders")
      .select("id, po_number, status, amount_limit, amount_authorized, amount_consumed, amount_used, notes, fleet_client_id")
      .eq("user_id", user.id)
      .eq("po_number", payload.poNumber)
      .maybeSingle();

    if (!po || po.fleet_client_id !== clientId || !["open", "partially_used"].includes(String(po.status || ""))) {
      throw new Error("PO is missing, invalid, or has no remaining available amount.");
    }

    const poState = computePoRemaining(po);
    const policy = parsePoLedgerPolicy(po.notes);
    if (poState.remaining <= 0) {
      throw new Error("PO has no remaining available balance.");
    }
    if (policy.maxPerJob && reserveAmount > policy.maxPerJob) {
      throw new Error(`PO max-per-job limit exceeded (${policy.maxPerJob.toFixed(2)}).`);
    }

    if (policy.maxPerVehicle && reserveAmount > 0) {
      const { data: vehicleLedger } = await db
        .from("fleet_po_ledger_entries")
        .select("amount, entry_type, metadata")
        .eq("fleet_purchase_order_id", po.id)
        .eq("user_id", user.id);

      const vehicleAuthorized = (vehicleLedger || [])
        .filter((entry: { entry_type: string; metadata: { vehicle_id?: string } | null }) =>
          String(entry.metadata?.vehicle_id || "") === payload.vehicleId && entry.entry_type === "authorized")
        .reduce((acc: number, entry: { amount: unknown }) => acc + Number(entry.amount || 0), 0);

      if (vehicleAuthorized + reserveAmount > policy.maxPerVehicle) {
        throw new Error(`PO max-per-vehicle limit exceeded (${policy.maxPerVehicle.toFixed(2)}).`);
      }
    }

    if (reserveAmount > 0 && reserveAmount > poState.remaining) {
      throw new Error("PO remaining balance is insufficient for this work order reservation.");
    }
    selectedPo = po;
  }

  const status = payload.asDraft ? "draft" : "scheduled";
  const now = new Date().toISOString();

  if (!payload.asDraft) {
    if (!payload.scheduledDate || !payload.scheduledTime) {
      throw new Error("Scheduled date and time are required.");
    }
    if (!payload.servicePackage || !payload.serviceType) {
      throw new Error("Structured service package selection is required.");
    }

    // Contract scope: if the contract has explicitly attached services
    // (fleet_contract_services), those define the scope — any service on the
    // contract is in-scope by definition. Only fall back to the legacy
    // pricing_rules.service_scope.allowed_service_classes list when no
    // services are attached to the contract.
    let contractScopedIn = false;
    if (contractId && payload.servicePackage?.code) {
      const { data: attachedServices } = await db
        .from("fleet_contract_services")
        .select("id, service_catalog_id, custom_label, service_catalog:service_catalog_id(name)")
        .eq("user_id", user.id)
        .eq("fleet_contract_id", contractId)
        .eq("is_active", true);
      const attached = (attachedServices ?? []) as Array<{
        id: string;
        service_catalog_id: string;
        custom_label: string | null;
        service_catalog: { name: string } | null;
      }>;
      if (attached.length > 0) {
        const pkgCode = String(payload.servicePackage.code);
        const pkgLabel = String(payload.servicePackage.label ?? payload.serviceType ?? "").toLowerCase();
        contractScopedIn = attached.some((row) => {
          if (row.id === pkgCode) return true;
          if (row.service_catalog_id === pkgCode) return true;
          const candidates = [row.custom_label, row.service_catalog?.name]
            .filter(Boolean)
            .map((v) => String(v).toLowerCase());
          return candidates.includes(pkgLabel);
        });
        if (!contractScopedIn) {
          throw new Error("Selected service is not on this contract — attach it in Contract Services or pick a contract service.");
        }
      }
    }

    if (!contractScopedIn) {
      const allowedServiceClasses = Array.isArray(serviceScopeRules?.allowed_service_classes)
        ? (serviceScopeRules!.allowed_service_classes as unknown[]).map((entry) => String(entry))
        : [];
      if (allowedServiceClasses.length > 0 && !allowedServiceClasses.includes(payload.serviceType ?? "")) {
        throw new Error("Service type is outside the contract scope.");
      }
    }

    const { data: location } = await db
      .from("fleet_locations")
      .select("service_window_start, service_window_end")
      .eq("id", locationId)
      .eq("user_id", user.id)
      .maybeSingle();

    const proposedMinutes = Number.parseInt(String(payload.scheduledTime).slice(0, 2), 10) * 60 + Number.parseInt(String(payload.scheduledTime).slice(3, 5), 10);
    const startWindow = location?.service_window_start || "08:00";
    const endWindow = location?.service_window_end || "17:00";
    const startMinutes = Number.parseInt(String(startWindow).slice(0, 2), 10) * 60 + Number.parseInt(String(startWindow).slice(3, 5), 10);
    const endMinutes = Number.parseInt(String(endWindow).slice(0, 2), 10) * 60 + Number.parseInt(String(endWindow).slice(3, 5), 10);

    const enforceLocationWindows = schedulingRules?.enforce_location_windows !== false;
    if (enforceLocationWindows && (proposedMinutes < startMinutes || proposedMinutes >= endMinutes)) {
      throw new Error("Selected time is outside the location service window.");
    }

    const enforceSlaWindow = schedulingRules?.enforce_sla_window !== false;
    if (enforceSlaWindow && contract?.sla_hours) {
      const proposedDateTime = new Date(`${payload.scheduledDate}T${payload.scheduledTime}:00`);
      const maxSlaDateTime = new Date(Date.now() + contract.sla_hours * 60 * 60 * 1000);
      if (proposedDateTime > maxSlaDateTime) {
        throw new Error(`Scheduled slot exceeds contract SLA (${contract.sla_hours}h).`);
      }
    }
  }

  const insertData: Record<string, unknown> = {
    user_id: user.id,
    fleet_client_id: clientId,
    fleet_vehicle_id: payload.vehicleId,
    fleet_contract_id: contractId || null,
    fleet_location_id: locationId || null,
    status,
    priority: payload.priority,
    service_type: payload.serviceType || null,
    description: payload.description || null,
    scheduled_date: payload.scheduledDate || null,
    scheduled_time: payload.scheduledTime || null,
    po_number: payload.poNumber || null,
    fleet_purchase_order_id: selectedPo?.id || null,
    notes: payload.notes || null,
    parts_used: payload.serviceDefaults || payload.servicePackage
      ? {
          selected_service_profile_id: payload.serviceProfileId || null,
          selected_service_package: payload.servicePackage || null,
          contract_rule_snapshot: {
            approval: approvalRules,
            po: poRules,
            service_scope: serviceScopeRules,
            scheduling: schedulingRules,
          },
          service_defaults: payload.serviceDefaults,
        }
      : null,
    source_schedule_id: payload.sourceScheduleId || null,
  };

  if (!payload.asDraft) {
    insertData.submitted_at = now;
    const approvalMode = String(approvalRules?.mode || "hybrid");
    const approvalThreshold = Number(approvalRules?.threshold_amount ?? contract?.approval_threshold ?? 0);
    insertData.approval_threshold = approvalThreshold || null;
    insertData.approval_required = approvalMode === "manual" || (approvalMode === "hybrid" && approvalThreshold > 0);
    if (contract?.sla_hours) {
      const slaMs = contract.sla_hours * 60 * 60 * 1000;
      insertData.sla_deadline = new Date(Date.now() + slaMs).toISOString();
    }
  }

  const { data, error } = await db
    .from("fleet_work_orders")
    .insert(insertData)
    .select("id, order_number")
    .single();

  if (error || !data) {
    throw new Error(error?.message ? `Failed to create work order: ${error.message}` : "Failed to create work order");
  }

  if (selectedPo && reserveAmount > 0) {
    const projectedAuthorized = Number(selectedPo.amount_authorized || 0) + reserveAmount;
    const { data: updatedPo, error: poUpdateError } = await db
      .from("fleet_purchase_orders")
      .update({
        amount_authorized: projectedAuthorized,
        status: projectedAuthorized >= Number(selectedPo.amount_limit || 0) ? "partially_used" : selectedPo.status,
      })
      .eq("id", selectedPo.id)
      .eq("user_id", user.id)
      .eq("amount_authorized", Number(selectedPo.amount_authorized || 0))
      .select("id")
      .maybeSingle();

    if (poUpdateError || !updatedPo) {
      await db.from("fleet_work_orders").delete().eq("id", data.id).eq("user_id", user.id);
      throw new Error("Failed to reserve PO authorization due to concurrent ledger update. Please retry.");
    }

    const { error: reserveLedgerError } = await db.from("fleet_po_ledger_entries").insert({
      user_id: user.id,
      fleet_purchase_order_id: selectedPo.id,
      fleet_work_order_id: data.id,
      entry_type: "authorized",
      amount: reserveAmount,
      reason_code: "work_order_created_reserved",
      metadata: {
        vehicle_id: payload.vehicleId,
        po_number: selectedPo.po_number,
      },
    });
    if (reserveLedgerError) {
      await db
        .from("fleet_purchase_orders")
        .update({
          amount_authorized: Number(selectedPo.amount_authorized || 0),
          status: selectedPo.status,
        })
        .eq("id", selectedPo.id)
        .eq("user_id", user.id);
      await db.from("fleet_work_orders").delete().eq("id", data.id).eq("user_id", user.id);
      throw new Error("Failed to write PO ledger reservation. Work order creation was rolled back.");
    }
  }

  // ── Auto-apply contract services as line items ──
  if (contractId) {
    const { data: existingItems } = await db
      .from("fleet_work_order_line_items")
      .select("id")
      .eq("fleet_work_order_id", data.id)
      .limit(1);

    if (!existingItems?.length) {
      const { data: contractServices } = await db
        .from("fleet_contract_services")
        .select("id, custom_price, custom_label, pricing_model, sort_order, service_catalog_id, service_catalog(id, name, description, default_price)")
        .eq("fleet_contract_id", contractId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (contractServices?.length) {
        const lineItems = contractServices.map((cs: {
          id: string;
          custom_price: number | null;
          custom_label: string | null;
          sort_order: number | null;
          service_catalog_id: string;
          service_catalog: { name: string; default_price: number } | null;
        }, idx: number) => {
          const unitPrice = cs.custom_price ?? cs.service_catalog?.default_price ?? 0;
          return {
            user_id: user.id,
            fleet_work_order_id: data.id,
            fleet_contract_service_id: cs.id,
            service_catalog_id: cs.service_catalog_id,
            description: cs.custom_label || cs.service_catalog?.name || "Service",
            unit_price: unitPrice,
            quantity: 1,
            total: unitPrice,
            price_source: "contract",
            line_type: "service",
            taxable: true,
            sort_order: cs.sort_order ?? idx,
          };
        });

        await db.from("fleet_work_order_line_items").insert(lineItems);

        const totalAmount = lineItems.reduce((sum: number, li: { total: number }) => sum + Number(li.total), 0);
        await db
          .from("fleet_work_orders")
          .update({ total: totalAmount })
          .eq("id", data.id)
          .eq("user_id", user.id);
      }
    }
  }

  await db.from("fleet_activity_logs").insert({
    fleet_work_order_id: data.id,
    user_id: user.id,
    action: "created",
    actor_role: "provider",
    details: { message: `Work order ${data.order_number} created` },
  });

  if (!payload.asDraft) {
    await db.from("fleet_activity_logs").insert({
      fleet_work_order_id: data.id,
      user_id: user.id,
      action: "submitted",
      actor_role: "provider",
      details: { message: "Submitted and scheduled" },
    });
  }

  if (payload.poNumber) {
    await db.from("fleet_activity_logs").insert({
      fleet_work_order_id: data.id,
      user_id: user.id,
      action: "po_attached",
      actor_role: "provider",
      details: { po_number: payload.poNumber },
    });
  }

  return json({ data: { id: String(data.id), orderNumber: data.order_number ?? null } });
});

vehiclesRouter.post("/v1/fleet/work-orders/generate-from-schedules", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const limit = Number(body.limit ?? 100);
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;

  const { data: schedules } = await db
    .from("fleet_service_schedules")
    .select("id,fleet_client_id,fleet_vehicle_id,service_class,base_labor_package,proposed_scheduled_date,proposed_scheduled_time,draft_work_order_id")
    .eq("user_id", user.id)
    .in("queue_status", ["approved", "scheduled"])
    .is("draft_work_order_id", null)
    .limit(limit);

  const idempotencyKey = buildDeterministicIdempotencyKey([
    user.id,
    "work_order_generation",
    ...(schedules || []).map((schedule: { id: string }) => String(schedule.id)).sort(),
  ]);

  const operationLock = await acquireOperationLock(db, {
    userId: user.id,
    operationType: "work_order_generation",
    idempotencyKey,
    context: { limit, schedule_count: (schedules || []).length },
  });
  if (operationLock.duplicateCompleted) {
    return json({ data: { generatedCount: 0, skippedCount: (schedules || []).length } });
  }

  const batchId = operationLock.batchId || undefined;
  let generatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  try {
    for (const schedule of schedules || []) {
      if (batchId) {
        await db.from("fleet_operation_batch_items").upsert({
          batch_id: batchId,
          item_key: String(schedule.id),
          status: "pending",
          payload: { fleet_vehicle_id: schedule.fleet_vehicle_id },
        });
      }

      const { data: existing } = await db
        .from("fleet_work_orders")
        .select("id")
        .eq("user_id", user.id)
        .eq("source_schedule_id", schedule.id)
        .maybeSingle();
      if (existing?.id) {
        await db
          .from("fleet_service_schedules")
          .update({ queue_status: "work_order_generated", draft_work_order_id: existing.id })
          .eq("id", schedule.id)
          .eq("user_id", user.id);
        skippedCount += 1;
        if (batchId) {
          await db.from("fleet_operation_batch_items").upsert({
            batch_id: batchId,
            item_key: String(schedule.id),
            status: "skipped",
            compensation_action: "existing_work_order_linked",
          });
        }
        continue;
      }

      const { data: vehicle } = await db
        .from("fleet_vehicles")
        .select("fleet_client_id,fleet_location_id,fleet_contract_id")
        .eq("id", schedule.fleet_vehicle_id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!vehicle || (schedule.fleet_client_id && vehicle.fleet_client_id !== schedule.fleet_client_id)) {
        skippedCount += 1;
        failedCount += 1;
        if (batchId) {
          await db.from("fleet_operation_batch_items").upsert({
            batch_id: batchId,
            item_key: String(schedule.id),
            status: "failed",
            error_message: "Vehicle lookup/context mismatch",
          });
        }
        continue;
      }

      const asDraft = !schedule.proposed_scheduled_date;
      const { data: workOrder, error: workOrderError } = await db
        .from("fleet_work_orders")
        .insert({
          user_id: user.id,
          fleet_client_id: schedule.fleet_client_id,
          fleet_vehicle_id: schedule.fleet_vehicle_id,
          fleet_contract_id: vehicle.fleet_contract_id,
          fleet_location_id: vehicle.fleet_location_id,
          status: asDraft ? "draft" : "scheduled",
          priority: "normal",
          service_type: schedule.service_class,
          description: schedule.base_labor_package ?? "Scheduled fleet service",
          scheduled_date: schedule.proposed_scheduled_date,
          scheduled_time: schedule.proposed_scheduled_time || null,
          source_schedule_id: schedule.id,
          submitted_at: asDraft ? null : new Date().toISOString(),
        })
        .select("id")
        .maybeSingle();

      if (!workOrder || workOrderError) {
        skippedCount += 1;
        failedCount += 1;
        if (batchId) {
          await db.from("fleet_operation_batch_items").upsert({
            batch_id: batchId,
            item_key: String(schedule.id),
            status: "failed",
            error_message: workOrderError?.message || "work order insert failed",
          });
        }
        continue;
      }

      await db
        .from("fleet_service_schedules")
        .update({
          queue_status: "work_order_generated",
          draft_work_order_id: workOrder.id,
          status: schedule.proposed_scheduled_date ? "scheduled" : "generated",
        })
        .eq("id", schedule.id)
        .eq("user_id", user.id);

      generatedCount += 1;
      if (batchId) {
        await db.from("fleet_operation_batch_items").upsert({
          batch_id: batchId,
          item_key: String(schedule.id),
          status: "succeeded",
          payload: { work_order_id: workOrder.id },
        });
      }
    }
  } catch (error) {
    await finalizeOperationLock(db, {
      userId: user.id,
      batchId: operationLock.batchId,
      failed: true,
      errorMessage: error instanceof Error ? error.message : "Generation run failed",
    });
    throw error;
  }

  await db
    .from("fleet_operation_batches")
    .update({
      context: { generatedCount, skippedCount, failedCount },
    })
    .eq("id", operationLock.batchId)
    .eq("user_id", user.id);

  await finalizeOperationLock(db, {
    userId: user.id,
    batchId: operationLock.batchId,
    failed: failedCount > 0,
    errorMessage: failedCount > 0 ? `${failedCount} schedule items failed` : null,
  });

  return json({ data: { generatedCount, skippedCount } });
});

vehiclesRouter.get("/v1/fleet/work-orders/:id/dispatch-score", async (c) => {
  const workOrderId = c.req.param("id");
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;

  const [{ data: order }, { data: technicians }, { data: activeAssignments }] = await Promise.all([
    db
      .from("fleet_work_orders")
      .select("id,fleet_client_id,priority")
      .eq("id", workOrderId)
      .eq("user_id", user.id)
      .maybeSingle(),
    db.from("technicians").select("id,name").eq("is_active", true),
    db
      .from("fleet_work_orders")
      .select("assigned_technician_id,fleet_client_id,status")
      .eq("user_id", user.id)
      .in("status", ["assigned", "scheduled", "en_route", "in_progress"]),
  ]);

  if (!order) return json({ data: [] });

  const loadByTech = new Map<string, number>();
  const groupingByTech = new Map<string, number>();
  for (const item of activeAssignments || []) {
    const techId = String(item.assigned_technician_id || "");
    if (!techId) continue;
    loadByTech.set(techId, (loadByTech.get(techId) || 0) + 1);
    if (item.fleet_client_id && item.fleet_client_id === order.fleet_client_id) {
      groupingByTech.set(techId, (groupingByTech.get(techId) || 0) + 1);
    }
  }

  const priorityWeight = order.priority === "urgent" ? 1 : order.priority === "high" ? 0.85 : 0.7;

  const breakdown = (technicians || [])
    .map((tech: { id: string; name: string }) => {
      const currentLoad = loadByTech.get(tech.id) || 0;
      const groupingHits = groupingByTech.get(tech.id) || 0;
      const load = Math.max(0, 100 - currentLoad * 20);
      const grouping = Math.min(100, 40 + groupingHits * 30);
      const distance = Math.max(40, 95 - currentLoad * 10);
      const timeFit = Math.max(35, 90 - currentLoad * 15);
      const priority = Math.round(priorityWeight * 100);
      const totalScore = Math.round(load * 0.2 + grouping * 0.25 + distance * 0.25 + timeFit * 0.2 + priority * 0.1);
      return {
        technicianId: tech.id,
        technicianName: tech.name,
        totalScore,
        factors: { distance, timeFit, priority, grouping, load },
        rationale: [
          `${currentLoad} active assignment(s)`,
          `${groupingHits} same-fleet grouping match(es)`,
          `priority weight ${priority}%`,
        ],
      };
    })
    .sort((a: { totalScore: number }, b: { totalScore: number }) => b.totalScore - a.totalScore);

  return json({ data: breakdown });
});

vehiclesRouter.post("/v1/fleet/work-orders/:id/advance", async (c) => {
  const workOrderId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const options = body.options ?? null;
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;

  const { data: order, error } = await db
    .from("fleet_work_orders")
    .select("*,updated_at, fleet_contracts(sla_hours)")
    .eq("id", workOrderId)
    .eq("user_id", user.id)
    .single();

  if (error || !order) {
    throw new Error("Failed to load work order");
  }

  const nextStatus = getNextFleetWorkOrderStatus(order.status);
  if (!nextStatus) throw new Error(`Unsupported work order transition from '${order.status}'.`);
  if (["draft", "pending_review"].includes(order.status) && nextStatus === "scheduled" && (!order.scheduled_date || !order.scheduled_time)) {
    throw new Error("Work order must have a scheduled date and time before submission.");
  }
  if (nextStatus === "invoiced" && Number(order.total || 0) <= 0) {
    throw new Error("Cannot invoice a work order with zero total.");
  }
  if (["in_progress", "completed", "invoiced"].includes(nextStatus) && order.fleet_purchase_order_id) {
    await assertPoLedgerWithinLimits(db, {
      userId: user.id,
      poId: order.fleet_purchase_order_id,
      workOrderId,
      vehicleId: order.fleet_vehicle_id,
      orderTotal: Number(order.total || 0),
      stage: nextStatus === "invoiced" ? "invoice" : "work",
    });
  }

  await transitionFleetWorkOrderStatus(db, user.id, {
    workOrderId,
    targetStatus: nextStatus,
    actorRole: "provider",
    reasonCode: "manual_advance",
    details: { old_status: order.status, next_status: nextStatus },
  });

  if (nextStatus === "scheduled" && order.fleet_contracts?.sla_hours) {
    const slaMs = order.fleet_contracts.sla_hours * 60 * 60 * 1000;
    await db
      .from("fleet_work_orders")
      .update({ sla_deadline: new Date(Date.now() + slaMs).toISOString() })
      .eq("id", workOrderId)
      .eq("user_id", user.id);
  }
  return json({ data: { status: nextStatus } });
});

vehiclesRouter.post("/v1/fleet/work-orders/:id/complete", async (c) => {
  const workOrderId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const payload = body.payload ?? body;
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;

  if (!Number.isFinite(payload.mileageAtService) || payload.mileageAtService <= 0) {
    throw new Error("Mileage at completion is required.");
  }

  const { data: order, error } = await db
    .from("fleet_work_orders")
    .select("id, fleet_vehicle_id, fleet_location_id, fleet_contract_id, status, parts_used")
    .eq("id", workOrderId)
    .eq("user_id", user.id)
    .single();

  if (error || !order) {
    throw new Error("Failed to load work order");
  }

  const [{ data: vehicle }, { data: location }, { data: contract }] = await Promise.all([
    db
      .from("fleet_vehicles")
      .select("vin")
      .eq("id", order.fleet_vehicle_id)
      .eq("user_id", user.id)
      .maybeSingle(),
    order.fleet_location_id
      ? db
          .from("fleet_locations")
          .select("service_window_start,service_window_end")
          .eq("id", order.fleet_location_id)
          .eq("user_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    order.fleet_contract_id
      ? db
          .from("fleet_contracts")
          .select("pricing_rules")
          .eq("id", order.fleet_contract_id)
          .eq("user_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const normalizeVin = (vin: string | null | undefined) => (vin || "").trim().toUpperCase();
  const storedVin = normalizeVin(vehicle?.vin);
  const capturedVin = normalizeVin(payload.capturedVin);
  const vinMatched = !storedVin || (capturedVin && storedVin === capturedVin);

  const allowedStatuses = ["scheduled", "assigned", "en_route", "arrived", "in_progress"];
  if (!allowedStatuses.includes(order.status)) {
    throw new Error("Work order must be scheduled or in-progress before completion.");
  }

  // 1. Progress state machine through valid transitions if needed
  if (["assigned", "en_route", "arrived"].includes(order.status)) {
    await transitionFleetWorkOrderStatus(db, user.id, {
      workOrderId,
      targetStatus: "in_progress",
      actorRole: "provider",
      reasonCode: "manual_complete_flow",
    });
  }

  // 2. Perform target state transition to 'completed'
  await transitionFleetWorkOrderStatus(db, user.id, {
    workOrderId,
    targetStatus: "completed",
    actorRole: "provider",
    reasonCode: "manual_complete",
    details: { mileage_at_service: payload.mileageAtService, technician_notes: payload.technicianNotes },
  });

  // 3. Update the completion-specific details
  const updates: Record<string, unknown> = {
    mileage_at_service: payload.mileageAtService,
    completion_status: vinMatched ? "passed" : "vin_mismatch",
    completion_vin_captured: capturedVin || null,
    completion_vin_matched: vinMatched,
  };
  if (payload.technicianNotes) {
    updates.technician_notes = payload.technicianNotes;
  }

  const { error: updateError } = await db
    .from("fleet_work_orders")
    .update(updates)
    .eq("id", workOrderId)
    .eq("user_id", user.id)
    .eq("status", "completed");

  if (updateError) {
    throw new Error("Failed to persist completion details after status transition.");
  }

  if (order.fleet_vehicle_id) {
    await db
      .from("fleet_vehicles")
      .update({ mileage: payload.mileageAtService, vin: capturedVin || vehicle?.vin || null })
      .eq("id", order.fleet_vehicle_id);
  }
  return json({ data: { ok: true } });
});

vehiclesRouter.post("/v1/fleet/work-orders/:id/authorize-po", async (c) => {
  const workOrderId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const purchaseOrderId = body.purchase_order_id ?? body.purchaseOrderId;
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;

  const [{ data: order }, { data: po }, { data: orderLedger }] = await Promise.all([
    db.from("fleet_work_orders").select("id,total,status,fleet_client_id,fleet_vehicle_id,fleet_purchase_order_id").eq("id", workOrderId).eq("user_id", user.id).maybeSingle(),
    db.from("fleet_purchase_orders").select("id,po_number,status,amount_limit,amount_authorized,amount_consumed,amount_used,fleet_client_id,notes").eq("id", purchaseOrderId).eq("user_id", user.id).maybeSingle(),
    db.from("fleet_po_ledger_entries").select("entry_type,amount,fleet_purchase_order_id,reason_code").eq("fleet_work_order_id", workOrderId).eq("user_id", user.id),
  ]);

  if (!order || !po) throw new Error("Work order or purchase order not found");
  if (!["scheduled", "en_route", "arrived", "in_progress", "completed", "invoiced"].includes(String(order.status || ""))) {
    throw new Error("PO authorization is only allowed for active or billable work orders.");
  }
  if (order.fleet_purchase_order_id && order.fleet_purchase_order_id !== purchaseOrderId) {
    throw new Error("Work order is already linked to a different PO.");
  }
  if (order.fleet_client_id !== po.fleet_client_id) throw new Error("PO must match work order fleet account");
  if (!["open", "partially_used"].includes(po.status || "")) throw new Error("PO is not available for authorization");

  const alreadyAuthorizedForOrder = (orderLedger || [])
    .filter((entry: { fleet_purchase_order_id: string; reason_code: string }) =>
      entry.fleet_purchase_order_id === purchaseOrderId && entry.reason_code === "work_order_po_authorized")
    .reduce((acc: number, entry: { amount: unknown }) => acc + Number(entry.amount || 0), 0);
  const targetAuthorization = Number(order.total || 0);
  const authorizationDelta = Math.max(0, targetAuthorization - alreadyAuthorizedForOrder);

  const policy = parsePoLedgerPolicy(po.notes);
  if (policy.maxPerJob && targetAuthorization > policy.maxPerJob) {
    throw new Error(`PO max-per-job limit exceeded (${policy.maxPerJob.toFixed(2)}).`);
  }
  if (policy.maxPerVehicle && order.fleet_vehicle_id && authorizationDelta > 0) {
    const { data: vehicleLedger } = await db
      .from("fleet_po_ledger_entries")
      .select("entry_type,amount")
      .eq("fleet_purchase_order_id", po.id)
      .eq("user_id", user.id)
      .contains("metadata", { vehicle_id: order.fleet_vehicle_id });
    const vehicleNet = computeLedgerNetForEntries(vehicleLedger || []);
    if (vehicleNet.netReserved + authorizationDelta > policy.maxPerVehicle) {
      throw new Error(`PO max-per-vehicle limit exceeded (${policy.maxPerVehicle.toFixed(2)}).`);
    }
  }
  if (authorizationDelta > 0) {
    const projectedAuthorized = Number(po.amount_authorized || 0) + authorizationDelta;
    if (po.amount_limit !== null && po.amount_limit !== undefined && projectedAuthorized > Number(po.amount_limit)) {
      throw new Error("PO limit would be exceeded by this authorization");
    }

    await db
      .from("fleet_purchase_orders")
      .update({
        amount_authorized: projectedAuthorized,
        status: projectedAuthorized >= Number(po.amount_limit || 0) ? "partially_used" : po.status,
      })
      .eq("id", po.id)
      .eq("user_id", user.id);

    await db.from("fleet_po_ledger_entries").insert({
      user_id: user.id,
      fleet_purchase_order_id: purchaseOrderId,
      fleet_work_order_id: workOrderId,
      entry_type: "authorized",
      amount: authorizationDelta,
      reason_code: "work_order_po_authorized",
      metadata: { projected_authorized: projectedAuthorized, authorization_delta: authorizationDelta },
    });
  }

  await db.from("fleet_work_order_pos").upsert({
    fleet_work_order_id: workOrderId,
    fleet_purchase_order_id: purchaseOrderId,
    amount_applied: targetAuthorization,
  });

  await db
    .from("fleet_work_orders")
    .update({
      fleet_purchase_order_id: purchaseOrderId,
      po_number: po.po_number,
      po_authorization_status: "authorized",
    })
    .eq("id", workOrderId)
    .eq("user_id", user.id);
  return json({ data: { ok: true } });
});

vehiclesRouter.post("/v1/fleet/work-orders/:id/invoice-adjustment", async (c) => {
  const workOrderId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const input = body.input ?? body;
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;

  if (!Number.isFinite(input.adjustedTotal) || input.adjustedTotal < 0) {
    throw new Error("Adjusted total must be a valid non-negative amount.");
  }
  if (!input.reason || !input.reason.trim()) {
    throw new Error("A reason is required for invoice adjustment.");
  }

  const { data: order } = await db
    .from("fleet_work_orders")
    .select("id,total,tax_amount,status,fleet_purchase_order_id,fleet_vehicle_id,parts_used")
    .eq("id", workOrderId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!order) throw new Error("Work order not found.");
  if (!["completed", "invoiced"].includes(String(order.status || ""))) {
    throw new Error("Invoice adjustment is only allowed for completed or invoiced work orders.");
  }

  if (order.fleet_purchase_order_id) {
    const [{ data: po }, { data: orderLedger }] = await Promise.all([
      db
        .from("fleet_purchase_orders")
        .select("id,amount_limit,amount_authorized,amount_consumed,amount_used,notes,status")
        .eq("id", order.fleet_purchase_order_id)
        .eq("user_id", user.id)
        .maybeSingle(),
      db
        .from("fleet_po_ledger_entries")
        .select("entry_type,amount")
        .eq("fleet_work_order_id", workOrderId)
        .eq("user_id", user.id),
    ]);

    if (!po) throw new Error("Linked PO not found for adjustment.");
    const reservedForOrder = (orderLedger || [])
      .filter((entry: { entry_type: string }) => entry.entry_type === "authorized")
      .reduce((acc: number, entry: { amount: unknown }) => acc + Number(entry.amount || 0), 0);
    const releasedForOrder = (orderLedger || [])
      .filter((entry: { entry_type: string }) => entry.entry_type === "released")
      .reduce((acc: number, entry: { amount: unknown }) => acc + Number(entry.amount || 0), 0);
    const netReservedForOrder = reservedForOrder - releasedForOrder;

    const delta = input.adjustedTotal - netReservedForOrder;
    const poState = computePoRemaining(po);
    const policy = parsePoLedgerPolicy(po.notes);
    if (delta > 0 && delta > poState.remaining) {
      throw new Error("PO ledger limit exceeded by invoice adjustment.");
    }
    if (policy.maxPerJob && input.adjustedTotal > policy.maxPerJob) {
      throw new Error(`PO max-per-job limit exceeded (${policy.maxPerJob.toFixed(2)}).`);
    }

    if (delta !== 0) {
      await db
        .from("fleet_purchase_orders")
        .update({
          amount_authorized: Number(po.amount_authorized || 0) + delta,
        })
        .eq("id", po.id)
        .eq("user_id", user.id);

      await db.from("fleet_po_ledger_entries").insert({
        user_id: user.id,
        fleet_purchase_order_id: po.id,
        fleet_work_order_id: workOrderId,
        entry_type: delta > 0 ? "authorized" : "released",
        amount: Math.abs(delta),
        reason_code: "invoice_adjustment",
        metadata: {
          previous_total: Number(order.total || 0),
          adjusted_total: input.adjustedTotal,
          vehicle_id: order.fleet_vehicle_id,
        },
      });
    }

    await assertPoLedgerWithinLimits(db, {
      userId: user.id,
      poId: order.fleet_purchase_order_id,
      workOrderId,
      vehicleId: order.fleet_vehicle_id,
      orderTotal: input.adjustedTotal,
      stage: "invoice",
    });
  }

  const existingTaxAmount = Number(order.tax_amount || 0);
  if (existingTaxAmount < 0) {
    throw new Error("Invalid tax context on work order.");
  }
  const adjustedSubtotal = input.adjustedTotal - existingTaxAmount;
  if (adjustedSubtotal < 0) {
    throw new Error("Adjusted total is below current tax amount, which is invalid.");
  }
  const normalizedAdjustedTotal = adjustedSubtotal + existingTaxAmount;
  const priorTotal = Number(order.total || 0);
  const absoluteDelta = Math.abs(normalizedAdjustedTotal - priorTotal);
  const requiresExceptionOverride = priorTotal > 0 && absoluteDelta / priorTotal > 0.25;
  if (requiresExceptionOverride) {
    if (!input.override) {
      throw new Error("Adjustment above 25% requires an approved override chain.");
    }
    assertRuntimeOverrideGovernance({
      request: input.override,
      actorRole: "provider",
    });
    if (input.override.action !== "invoice_adjustment_exception") {
      throw new Error("Invoice adjustment override must use action 'invoice_adjustment_exception'.");
    }
    await db.from("fleet_activity_logs").insert({
      fleet_work_order_id: workOrderId,
      user_id: user.id,
      action: "runtime_override_approved",
      actor_role: "provider",
      details: {
        override_action: input.override.action,
        reason_code: input.override.reasonCode,
        note: input.override.note || null,
        approval_chain: input.override.approvalChain || [],
        prior_total: priorTotal,
        adjusted_total: normalizedAdjustedTotal,
      },
    });
  }

  if (order.fleet_purchase_order_id) {
    const [{ data: po }, { data: orderLedger }] = await Promise.all([
      db
        .from("fleet_purchase_orders")
        .select("id,amount_limit,amount_authorized,amount_consumed,amount_used,notes,status")
        .eq("id", order.fleet_purchase_order_id)
        .eq("user_id", user.id)
        .maybeSingle(),
      db
        .from("fleet_po_ledger_entries")
        .select("entry_type,amount")
        .eq("fleet_work_order_id", workOrderId)
        .eq("user_id", user.id),
    ]);

    if (!po) throw new Error("Linked PO not found for adjustment.");
    const reservedForOrder = (orderLedger || [])
      .filter((entry: { entry_type: string }) => entry.entry_type === "authorized")
      .reduce((acc: number, entry: { amount: unknown }) => acc + Number(entry.amount || 0), 0);
    const releasedForOrder = (orderLedger || [])
      .filter((entry: { entry_type: string }) => entry.entry_type === "released")
      .reduce((acc: number, entry: { amount: unknown }) => acc + Number(entry.amount || 0), 0);
    const netReservedForOrder = reservedForOrder - releasedForOrder;

    const delta = normalizedAdjustedTotal - netReservedForOrder;
    const poState = computePoRemaining(po);
    const policy = parsePoLedgerPolicy(po.notes);
    if (delta > 0 && delta > poState.remaining) {
      throw new Error("PO ledger limit exceeded by invoice adjustment.");
    }
    if (policy.maxPerJob && normalizedAdjustedTotal > policy.maxPerJob) {
      throw new Error(`PO max-per-job limit exceeded (${policy.maxPerJob.toFixed(2)}).`);
    }

    if (delta !== 0) {
      await db
        .from("fleet_purchase_orders")
        .update({
          amount_authorized: Number(po.amount_authorized || 0) + delta,
        })
        .eq("id", po.id)
        .eq("user_id", user.id);

      await db.from("fleet_po_ledger_entries").insert({
        user_id: user.id,
        fleet_purchase_order_id: po.id,
        fleet_work_order_id: workOrderId,
        entry_type: delta > 0 ? "authorized" : "released",
        amount: Math.abs(delta),
        reason_code: "invoice_adjustment",
        metadata: {
          previous_total: Number(order.total || 0),
          adjusted_total: normalizedAdjustedTotal,
          vehicle_id: order.fleet_vehicle_id,
        },
      });
    }

    await assertPoLedgerWithinLimits(db, {
      userId: user.id,
      poId: order.fleet_purchase_order_id,
      workOrderId,
      vehicleId: order.fleet_vehicle_id,
      orderTotal: normalizedAdjustedTotal,
      stage: "invoice",
    });
  }

  let workOrderUpdate = db
    .from("fleet_work_orders")
    .update({
      total: normalizedAdjustedTotal,
      subtotal: adjustedSubtotal,
    })
    .eq("id", workOrderId)
    .eq("user_id", user.id);
  if (input.integrity?.expectedUpdatedAt) {
    workOrderUpdate = workOrderUpdate.eq("updated_at", input.integrity.expectedUpdatedAt);
  }
  await workOrderUpdate;

  await db.from("fleet_activity_logs").insert({
    fleet_work_order_id: workOrderId,
    user_id: user.id,
    action: "invoice_adjusted",
    actor_role: "provider",
    details: {
      previous_total: Number(order.total || 0),
      adjusted_total: normalizedAdjustedTotal,
      reason: input.reason,
    },
  });
  return json({ data: { ok: true } });
});

vehiclesRouter.post("/v1/fleet/work-orders/:id/invoice-payment", async (c) => {
  const workOrderId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const input = body.input ?? body;
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }
  const operationLock = await acquireOperationLock(db, {
    userId: user.id,
    operationType: "invoice_payment_post",
    idempotencyKey: resolveIntegrityIdempotencyKey(
      [user.id, workOrderId, Number(input.amount).toFixed(2), input.paymentMethod || "manual", input.reference || ""],
      input.integrity,
    ),
    context: {
      work_order_id: workOrderId,
      amount: input.amount,
      payment_method: input.paymentMethod || "manual",
      reference: input.reference || null,
    },
  });
  if (operationLock.duplicateCompleted) return json({ data: { ok: true, duplicate: true } });
  try {
    const { data: order } = await db
      .from("fleet_work_orders")
      .select("id,total,subtotal,tax_amount,status,updated_at,parts_used,fleet_purchase_order_id,fleet_vehicle_id")
      .eq("id", workOrderId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!order) throw new Error("Work order not found.");
    assertOptimisticWorkOrderGuard(order, input.integrity);
    if (!["invoiced"].includes(String(order.status || ""))) {
      throw new Error("Payments can only be recorded for invoiced work orders.");
    }
    // Validate financial totals consistency
    const subtotalVal = Number(order.subtotal || 0);
    const taxVal = Number(order.tax_amount || 0);
    const totalVal = Number(order.total || 0);
    if (subtotalVal + taxVal > 0 && Math.abs((subtotalVal + taxVal) - totalVal) > 0.02) {
      throw new Error("Financial totals are inconsistent (subtotal + tax ≠ total). Correct the invoice before recording payment.");
    }
    if (Number(order.total || 0) <= 0) {
      throw new Error("Cannot record payment for a zero-value invoice.");
    }

    if (order.fleet_purchase_order_id) {
      const [{ data: po }, { data: ledger }] = await Promise.all([
        db
          .from("fleet_purchase_orders")
          .select("id,amount_consumed,amount_used")
          .eq("id", order.fleet_purchase_order_id)
          .eq("user_id", user.id)
          .maybeSingle(),
        db
          .from("fleet_po_ledger_entries")
          .select("entry_type,amount")
          .eq("fleet_work_order_id", workOrderId)
          .eq("user_id", user.id),
      ]);
      if (!po) throw new Error("Linked PO not found for payment.");

      const reserved = (ledger || [])
        .filter((entry: { entry_type: string }) => entry.entry_type === "authorized")
        .reduce((acc: number, entry: { amount: unknown }) => acc + Number(entry.amount || 0), 0);
      const released = (ledger || [])
        .filter((entry: { entry_type: string }) => entry.entry_type === "released")
        .reduce((acc: number, entry: { amount: unknown }) => acc + Number(entry.amount || 0), 0);
      const consumed = (ledger || [])
        .filter((entry: { entry_type: string }) => entry.entry_type === "consumed")
        .reduce((acc: number, entry: { amount: unknown }) => acc + Number(entry.amount || 0), 0);
      const availableToConsume = Math.max(0, reserved - released - consumed);
      if (consumed + input.amount > Number(order.total || 0)) {
        throw new Error("Payment would exceed the invoiced work order total.");
      }
      if (input.amount > availableToConsume) {
        throw new Error("Payment exceeds reserved PO authorization for this work order.");
      }

      await db
        .from("fleet_purchase_orders")
        .update({
          amount_consumed: Number(po.amount_consumed || 0) + input.amount,
          amount_used: Number(po.amount_used || 0) + input.amount,
        })
        .eq("id", po.id)
        .eq("user_id", user.id);

      await db.from("fleet_po_ledger_entries").insert({
        user_id: user.id,
        fleet_purchase_order_id: po.id,
        fleet_work_order_id: workOrderId,
        entry_type: "consumed",
        amount: input.amount,
        reason_code: "invoice_payment_recorded",
        metadata: {
          vehicle_id: order.fleet_vehicle_id,
          payment_method: input.paymentMethod || "manual",
        },
      });
    }

    const { error: rpcError } = await db.rpc("record_fleet_invoice_payment", {
      p_work_order_id: workOrderId,
      p_amount: input.amount,
      p_payment_method: input.paymentMethod || "manual",
      p_reference: input.reference || null,
      p_notes: input.notes || null,
    });
    if (rpcError) throw new Error(rpcError.message || "Failed to record invoice payment.");

    const { data: refreshedOrder } = await db
      .from("fleet_work_orders")
      .select("invoice_paid_amount,total")
      .eq("id", workOrderId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (
      refreshedOrder &&
      Number(refreshedOrder.invoice_paid_amount || 0) - Number(refreshedOrder.total || 0) > 0.01
    ) {
      throw new Error("Payment posting exceeded invoice total; transaction rejected for reconciliation.");
    }
    await finalizeOperationLock(db, { userId: user.id, batchId: operationLock.batchId });
  } catch (lockError) {
    await finalizeOperationLock(db, {
      userId: user.id,
      batchId: operationLock.batchId,
      failed: true,
      errorMessage: lockError instanceof Error ? lockError.message : "payment post failed",
    });
    throw lockError;
  }
  return json({ data: { ok: true } });
});

vehiclesRouter.post("/v1/fleet/work-orders/:id/approval", async (c) => {
  const workOrderId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const payload = body.payload ?? body;
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;

  const { error } = await db.from("fleet_approvals").insert({
    fleet_work_order_id: workOrderId,
    user_id: user.id,
    requested_by: "provider",
    approval_type: "additional_repair",
    title: payload.title,
    description: payload.description || null,
    estimated_cost: payload.estimatedCost ?? null,
  });
  if (error) throw new Error("Failed to request approval");

  await db
    .from("fleet_work_orders")
    .update({ approval_required: true })
    .eq("id", workOrderId)
    .eq("user_id", user.id);

  await db.from("fleet_activity_logs").insert({
    fleet_work_order_id: workOrderId,
    user_id: user.id,
    action: "approval_requested",
    actor_role: "provider",
    details: {
      message: payload.title,
      amount: payload.estimatedCost ?? undefined,
    },
  });
  return json({ data: { ok: true } });
});

vehiclesRouter.post("/v1/fleet/work-orders/:id/line-items", async (c) => {
  const workOrderId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const payload = body.payload ?? body;
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;

  const status = await getFleetWorkOrderStatusForUser(db, workOrderId, user.id);
  assertFleetWorkOrderEditableForAction(status, "restricted");

  const { data: existingItems } = await db
    .from("fleet_work_order_line_items")
    .select("id")
    .eq("fleet_work_order_id", workOrderId)
    .eq("user_id", user.id)
    .order("sort_order");

  const sortOrder = (existingItems?.length ?? 0);
  const total = toDollars(payload.quantity * payload.unitPrice);

  const { error } = await db.from("fleet_work_order_line_items").insert({
    fleet_work_order_id: workOrderId,
    user_id: user.id,
    line_type: payload.lineType,
    description: payload.description,
    quantity: payload.quantity,
    unit_price: payload.unitPrice,
    total,
    sort_order: sortOrder,
    service_catalog_id: payload.serviceCatalogId ?? null,
    fleet_contract_service_id: payload.fleetContractServiceId ?? null,
    price_source: payload.priceSource || "manual",
  });
  if (error) throw new Error("Failed to add line item");

  const [{ data: lines }, { data: order }] = await Promise.all([
    db
      .from("fleet_work_order_line_items")
      .select("total")
      .eq("fleet_work_order_id", workOrderId)
      .eq("user_id", user.id),
    db
      .from("fleet_work_orders")
      .select("tax_amount")
      .eq("id", workOrderId)
      .eq("user_id", user.id)
      .single(),
  ]);

  const subtotal =
    (lines as Array<{ total: number | null }> | null)?.reduce(
      (sum, li) => toDollars(sum + (li.total || 0)),
      toDollars(0),
    ) ?? toDollars(0);
  const taxAmount = order?.tax_amount || 0;

  await db
    .from("fleet_work_orders")
    .update({ subtotal, total: subtotal + taxAmount })
    .eq("id", workOrderId)
    .eq("user_id", user.id);
  return json({ data: { ok: true } });
});

vehiclesRouter.delete("/v1/fleet/work-orders/:workOrderId/line-items/:lineItemId", async (c) => {
  const workOrderId = c.req.param("workOrderId");
  const lineItemId = c.req.param("lineItemId");
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;

  const status = await getFleetWorkOrderStatusForUser(db, workOrderId, user.id);
  assertFleetWorkOrderEditableForAction(status, "restricted");

  await db
    .from("fleet_work_order_line_items")
    .delete()
    .eq("id", lineItemId)
    .eq("fleet_work_order_id", workOrderId)
    .eq("user_id", user.id);

  const [{ data: lines }, { data: order }] = await Promise.all([
    db
      .from("fleet_work_order_line_items")
      .select("total")
      .eq("fleet_work_order_id", workOrderId)
      .eq("user_id", user.id),
    db
      .from("fleet_work_orders")
      .select("tax_amount")
      .eq("id", workOrderId)
      .eq("user_id", user.id)
      .single(),
  ]);

  const subtotal =
    (lines as Array<{ total: number | null }> | null)?.reduce(
      (sum, li) => toDollars(sum + (li.total || 0)),
      toDollars(0),
    ) ?? toDollars(0);
  const taxAmount = order?.tax_amount || 0;

  await db
    .from("fleet_work_orders")
    .update({ subtotal, total: subtotal + taxAmount })
    .eq("id", workOrderId)
    .eq("user_id", user.id);
  return json({ data: { ok: true } });
});

vehiclesRouter.patch("/v1/fleet/work-orders/:workOrderId/line-items/:lineItemId", async (c) => {
  const workOrderId = c.req.param("workOrderId");
  const lineItemId = c.req.param("lineItemId");
  const body = await c.req.json().catch(() => ({}));
  const payload = body.payload ?? body;
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;

  const status = await getFleetWorkOrderStatusForUser(db, workOrderId, user.id);
  assertFleetWorkOrderEditableForAction(status, "restricted");

  const total = toDollars(payload.quantity * payload.unitPrice);
  const { error } = await db
    .from("fleet_work_order_line_items")
    .update({
      description: payload.description,
      quantity: payload.quantity,
      unit_price: payload.unitPrice,
      total,
    })
    .eq("id", lineItemId)
    .eq("fleet_work_order_id", workOrderId)
    .eq("user_id", user.id);
  if (error) throw new Error("Failed to update line item");

  const [{ data: lines }, { data: order }] = await Promise.all([
    db
      .from("fleet_work_order_line_items")
      .select("total")
      .eq("fleet_work_order_id", workOrderId)
      .eq("user_id", user.id),
    db
      .from("fleet_work_orders")
      .select("tax_amount")
      .eq("id", workOrderId)
      .eq("user_id", user.id)
      .single(),
  ]);

  const subtotal =
    (lines as Array<{ total: number | null }> | null)?.reduce(
      (sum, li) => toDollars(sum + (li.total || 0)),
      toDollars(0),
    ) ?? toDollars(0);
  const taxAmount = order?.tax_amount || 0;

  await db
    .from("fleet_work_orders")
    .update({ subtotal, total: subtotal + taxAmount })
    .eq("id", workOrderId)
    .eq("user_id", user.id);
  return json({ data: { ok: true } });
});

vehiclesRouter.patch("/v1/fleet/work-orders/:id/notes", async (c) => {
  const workOrderId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;

  const status = await getFleetWorkOrderStatusForUser(db, workOrderId, user.id);
  assertFleetWorkOrderEditableForAction(status, "restricted");

  const { error } = await db
    .from("fleet_work_orders")
    .update({ notes: body.notes ?? null })
    .eq("id", workOrderId)
    .eq("user_id", user.id);
  if (error) throw new Error("Failed to update notes");
  return json({ data: { ok: true } });
});

vehiclesRouter.post("/v1/fleet/work-orders/:id/reschedule", async (c) => {
  const workOrderId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const payload = body.payload ?? body;
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;

  const status = await getFleetWorkOrderStatusForUser(db, workOrderId, user.id);
  assertFleetWorkOrderEditableForAction(status, "limited");

  const { data: existingSchedule } = await db
    .from("fleet_work_orders")
    .select("scheduled_date,scheduled_time,updated_at")
    .eq("id", workOrderId)
    .eq("user_id", user.id)
    .maybeSingle();

  // Conflict-safe rescheduling requires a start time. When the dispatcher leaves the
  // time blank (date-only move), keep the existing start time, or fall back to 08:00.
  const resolvedTime =
    payload.scheduledTime || existingSchedule?.scheduled_time || "08:00:00";

  if (!existingSchedule) {
    throw new Error("Work order schedule was not found.");
  }

  const { error } = await db.rpc("reschedule_fleet_work_order_v1", {
    p_work_order_id: workOrderId,
    p_date: payload.scheduledDate,
    p_start: resolvedTime,
    p_expected_updated_at: existingSchedule.updated_at,
  });
  if (error) throw new Error("Failed to update schedule");

  await db.from("fleet_activity_logs").insert({
    fleet_work_order_id: workOrderId,
    user_id: user.id,
    action: "scheduler_updated",
    actor_role: "provider",
    details: {
      previous_scheduled_date: existingSchedule?.scheduled_date ?? null,
      previous_scheduled_time: existingSchedule?.scheduled_time ?? null,
      scheduled_date: payload.scheduledDate,
      scheduled_time: resolvedTime,
    },
  });
  return json({ data: { ok: true } });
});

vehiclesRouter.get("/v1/fleet/scheduler-reconciliation", async (c) => {
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const schedulerStatuses = ["scheduled", "assigned", "in_progress"];
  const { data, error } = await (supabase as any)
    .from("fleet_work_orders")
    .select("id")
    .eq("user_id", user.id)
    .in("status", schedulerStatuses)
    .is("scheduled_date", null)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("Failed to run scheduler reconciliation");
  return json({
    data: {
      missingScheduleCount: data?.length ?? 0,
      missingScheduleWorkOrderIds: (data ?? []).map((row: { id: string }) => String(row.id)),
    },
  });
});

vehiclesRouter.patch("/v1/fleet/work-orders/:id/details", async (c) => {
  const workOrderId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const payload = body.payload ?? body;
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;

  const status = await getFleetWorkOrderStatusForUser(db, workOrderId, user.id);
  assertFleetWorkOrderEditableForAction(status, "limited");

  const { error } = await db
    .from("fleet_work_orders")
    .update({ service_type: payload.serviceType, description: payload.description })
    .eq("id", workOrderId)
    .eq("user_id", user.id);
  if (error) throw new Error("Failed to update work order");
  return json({ data: { ok: true } });
});

vehiclesRouter.post("/v1/fleet/work-orders/charge", async (c) => {
  await requireFleetScope(c, selectedWorkspaceHint(c));
  throw providerUnavailable("fleet-charge-card");
});

// ---------------------------------------------------------------------------
// Fleet approvals, batch ops, check-ins
// ---------------------------------------------------------------------------

vehiclesRouter.post("/v1/fleet/approvals/:id/respond", async (c) => {
  const approvalId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const payload = body.payload ?? body;
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;

  const { error } = await db
    .from("fleet_approvals")
    .update({
      status: payload.decision,
      responded_by: "provider",
      response_notes: payload.responseNotes || null,
      responded_at: new Date().toISOString(),
    })
    .eq("id", approvalId);

  if (error) throw new Error("Failed to submit response");

  // Log activity
  await db.from("fleet_activity_logs").insert({
    fleet_work_order_id: payload.workOrderId,
    user_id: user.id,
    action: payload.decision === "approved" ? "approval_granted" : "approval_rejected",
    actor_role: "provider",
    details: {
      message: payload.responseNotes || `${payload.decision === "approved" ? "Approved" : "Rejected"}: ${payload.title}`,
      amount: payload.estimatedCost,
    },
  });
  return json({ data: { ok: true } });
});

vehiclesRouter.post("/v1/fleet/work-orders/batch-assign", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const payload = body.payload ?? body;
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;

  let success = 0;
  let failed = 0;

  for (const id of payload.workOrderIds ?? []) {
    try {
      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (payload.technicianId !== undefined) {
        updates.assigned_technician_id = payload.technicianId;
      }
      if (payload.scheduledDate !== undefined) {
        updates.scheduled_date = payload.scheduledDate;
      }
      if (payload.scheduledTime !== undefined) {
        updates.scheduled_time = payload.scheduledTime;
      }
      if (payload.status) {
        updates.status = payload.status;
      }

      const { error } = await db
        .from("fleet_work_orders")
        .update(updates)
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;

      // Log activity
      const details: Record<string, string> = {};
      if (payload.technicianId) details.technician_id = payload.technicianId;
      if (payload.scheduledDate) details.scheduled_date = payload.scheduledDate;
      if (payload.status) details.status = payload.status;

      await db.from("fleet_activity_logs").insert({
        fleet_work_order_id: id,
        user_id: user.id,
        action: "batch_update",
        actor_role: "provider",
        details: { message: "Batch update", ...details },
      });

      success++;
    } catch {
      failed++;
    }
  }

  return json({ data: { success, failed } });
});

vehiclesRouter.post("/v1/fleet/work-orders/batch-process", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const payload = body.payload ?? body;
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;

  let success = 0;
  let failed = 0;

  for (const id of payload.workOrderIds ?? []) {
    try {
      const updates: Record<string, unknown> = {
        status: payload.status,
        updated_at: new Date().toISOString(),
      };

      if (payload.status === "completed") {
        updates.completed_at = new Date().toISOString();
      }

      if (payload.mileageAtService) {
        updates.mileage_at_service = payload.mileageAtService;
      }

      if (payload.technicianNotes) {
        updates.technician_notes = payload.technicianNotes;
      }

      const { error } = await db
        .from("fleet_work_orders")
        .update(updates)
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;

      await db.from("fleet_activity_logs").insert({
        fleet_work_order_id: id,
        user_id: user.id,
        action: payload.status,
        actor_role: "provider",
        details: { message: `Batch processed: ${payload.status}` },
      });

      success++;
    } catch {
      failed++;
    }
  }

  return json({ data: { success, failed } });
});

vehiclesRouter.post("/v1/fleet/checkins", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const params = body.params ?? body;
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;

  const { error } = await db.from("fleet_checkins").insert({
    user_id: user.id,
    fleet_work_order_id: params.workOrderId,
    checkin_type: params.checkinType,
    lat: params.lat,
    lng: params.lng,
    accuracy_meters: params.accuracyMeters,
    notes: params.notes,
  });

  if (error) throw new Error("Failed to record check-in");

  // Update work order status for arrival/departure (scoped to the caller's account).
  if (params.checkinType === "arrival") {
    await db.from("fleet_work_orders").update({ status: "in_progress" }).eq("id", params.workOrderId).eq("user_id", user.id);
  } else if (params.checkinType === "departure") {
    await db.from("fleet_work_orders").update({ status: "completed" }).eq("id", params.workOrderId).eq("user_id", user.id);
  }
  return json({ data: { ok: true } });
});

// ---------------------------------------------------------------------------
// Fleet email & import
// ---------------------------------------------------------------------------

vehiclesRouter.post("/v1/fleet/email/mailbox", async (c) => {
  await requireFleetScope(c, selectedWorkspaceHint(c));
  throw providerUnavailable("fleet-email-mailbox");
});

vehiclesRouter.patch("/v1/fleet/email/messages/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { error } = await (supabase as any)
    .from("fleet_email_messages")
    .update({ is_read: body.is_read ?? true })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
  return json({ data: { ok: true } });
});

const FLEET_IMPORT_BATCH_SIZE = 100;

async function batchInsertFleetRows(
  db: any,
  table: string,
  rows: Array<Record<string, unknown>>,
): Promise<{ inserted: number; errors: string[] }> {
  const errors: string[] = [];
  let inserted = 0;
  for (let i = 0; i < rows.length; i += FLEET_IMPORT_BATCH_SIZE) {
    const batch = rows.slice(i, i + FLEET_IMPORT_BATCH_SIZE);
    const { error } = await db.from(table).insert(batch);
    if (error) {
      errors.push(`Rows ${i + 1}–${i + batch.length}: ${error.message}`);
    } else {
      inserted += batch.length;
    }
  }
  return { inserted, errors };
}

vehiclesRouter.post("/v1/fleet/import/clients", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const clients = body.clients ?? [];
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const rows = clients.map((cli: Record<string, unknown>) => ({
    user_id: user.id,
    company_name: cli.company_name,
    billing_email: cli.billing_email || null,
    phone: cli.phone || null,
    address: cli.address || null,
    city: cli.city || null,
    state: cli.state || null,
    postal_code: cli.postal_code || null,
    payment_terms: cli.payment_terms || "net_30",
    notes: cli.notes || null,
    ap_contact_name: cli.ap_contact_name || null,
    ap_contact_email: cli.ap_contact_email || null,
    ap_contact_phone: cli.ap_contact_phone || null,
    fleet_manager_name: cli.fleet_manager_name || null,
    fleet_manager_email: cli.fleet_manager_email || null,
    fleet_manager_phone: cli.fleet_manager_phone || null,
  }));
  const result = await batchInsertFleetRows(supabase as any, "fleet_clients", rows);
  return json({ data: result });
});

vehiclesRouter.post("/v1/fleet/import/vehicles", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const vehicles = body.vehicles ?? [];
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const rows = vehicles.map((v: Record<string, unknown>) => ({
    user_id: user.id,
    fleet_client_id: v.fleet_client_id,
    year: v.year ?? null,
    make: v.make || null,
    model: v.model || null,
    vin: v.vin || null,
    license_plate: v.license_plate || null,
    unit_number: v.unit_number || null,
    color: v.color || null,
    engine: v.engine || null,
    fuel_type: v.fuel_type || null,
    mileage: v.mileage ?? null,
    status: v.status || "active",
    notes: v.notes || null,
  }));
  const result = await batchInsertFleetRows(supabase as any, "fleet_vehicles", rows);
  return json({ data: result });
});

vehiclesRouter.get("/v1/fleet/clients/map", async (c) => {
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data } = await (supabase as any)
    .from("fleet_clients")
    .select("id, company_name")
    .eq("user_id", user.id);
  return json({ data: data ?? [] });
});

// ---------------------------------------------------------------------------
// Fleet jobs & locations
// ---------------------------------------------------------------------------

const FLEET_JOB_ERROR_MESSAGES: Record<string, string> = {
  fleet_job_access_denied: "You do not have permission to manage fleet jobs.",
  fleet_assignment_access_denied: "You do not have permission to assign fleet jobs.",
};

function formatFleetJobError(message?: string): string {
  if (!message) return "Fleet job operation failed";
  return FLEET_JOB_ERROR_MESSAGES[message] ?? message;
}

/** Group one or more same-client vehicle work orders into a dispatchable site visit. */
vehiclesRouter.post("/v1/fleet/jobs/from-work-orders", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const workOrderIds = body.work_order_ids ?? [];
  const notes = body.notes;
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any).rpc("create_fleet_job_for_work_orders_v1", {
    p_work_order_ids: workOrderIds,
    ...(notes ? { p_notes: notes } : {}),
  });
  if (error) throw new Error(formatFleetJobError(error.message));
  const payload = data as { job_id?: string; job_number?: string | null; work_orders?: number } | null;
  return json({
    data: {
      jobId: payload?.job_id ?? "",
      jobNumber: payload?.job_number ?? null,
      workOrders: payload?.work_orders ?? workOrderIds.length,
    },
  });
});

/**
 * Assign/schedule a fleet job once — technician, date, start, and duration
 * cascade to every open child work order in one transaction.
 */
vehiclesRouter.post("/v1/fleet/jobs/:id/assign", async (c) => {
  const jobId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any).rpc("assign_fleet_job_v1", {
    p_job_id: jobId,
    p_technician_id: body.technician_id,
    p_date: body.date,
    p_start: body.start,
    p_duration_minutes: body.duration_minutes ?? 60,
  });
  if (error) throw new Error(formatFleetJobError(error.message));
  return json({
    data: { assignedWorkOrders: Number((data as { assigned_work_orders?: number } | null)?.assigned_work_orders ?? 0) },
  });
});

vehiclesRouter.post("/v1/fleet/locations", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const payload = body.payload ?? body;
  if (!payload.fleet_client_id) throw new ApiError(400, "Fleet client is required.", "invalid_input");
  if (!payload.default_contract_id) throw new ApiError(400, "Default contract is required.", "invalid_input");
  if (!payload.name || !payload.address || !payload.city || !payload.state || !payload.postal_code) {
    throw new ApiError(400, "Location identity fields are required.", "invalid_input");
  }
  if (!payload.site_contact_name || !payload.site_contact_phone) {
    throw new ApiError(400, "Site contact name and phone are required.", "invalid_input");
  }
  if (!payload.service_window_start || !payload.service_window_end) {
    throw new ApiError(400, "Service window start/end are required.", "invalid_input");
  }
  if (payload.service_window_start >= payload.service_window_end) {
    throw new ApiError(400, "Service window end must be after start.", "invalid_input");
  }
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;

  const { data: contract } = await db
    .from("fleet_contracts")
    .select("id, fleet_client_id")
    .eq("id", payload.default_contract_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!contract || contract.fleet_client_id !== payload.fleet_client_id) {
    throw new Error("Selected contract must belong to the selected fleet client.");
  }

  const { data, error } = await db.from("fleet_locations").insert({
    user_id: user.id,
    fleet_client_id: payload.fleet_client_id,
    name: payload.name,
    address: payload.address,
    city: payload.city,
    state: payload.state,
    postal_code: payload.postal_code,
    site_contact_name: payload.site_contact_name,
    site_contact_phone: payload.site_contact_phone,
    service_window_start: payload.service_window_start,
    service_window_end: payload.service_window_end,
    access_instructions: payload.access_instructions,
    is_primary: payload.is_primary,
    notes: JSON.stringify({
      registration_version: "service_site_v1",
      site_contact_role: payload.site_contact_role,
      default_contract_id: payload.default_contract_id,
      access_profile: payload.access_profile,
      scheduling_policy: payload.scheduling_policy,
      billing_context: payload.billing_context,
    }),
  }).select("*");
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.patch("/v1/fleet/locations/:id", async (c) => {
  const locationId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("fleet_locations")
    .update(body.payload ?? body)
    .eq("id", locationId)
    .eq("user_id", user.id)
    .select("*");
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.delete("/v1/fleet/locations/:id", async (c) => {
  const locationId = c.req.param("id");
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("fleet_locations")
    .delete()
    .eq("id", locationId)
    .eq("user_id", user.id)
    .select("*");
  if (error) throw error;
  return json({ data: data ?? [] });
});

// ---------------------------------------------------------------------------
// Fleet purchase orders & draft attachments
// ---------------------------------------------------------------------------

vehiclesRouter.post("/v1/fleet/purchase-orders", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const payload = body.payload ?? body;
  const { validatePurchaseOrder, assertValid } = await import("@/application/validation/fleet-validation");
  try {
    assertValid(validatePurchaseOrder(payload), "Cannot create PO");
  } catch (error) {
    throw new ApiError(400, error instanceof Error ? error.message : "Invalid PO payload", "invalid_input");
  }
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { error } = await (supabase as any).from("fleet_purchase_orders").insert({
    user_id: user.id,
    ...payload,
    amount_used: 0,
  });
  if (error) throw new Error("Failed to create PO");
  return json({ data: { ok: true } });
});

vehiclesRouter.patch("/v1/fleet/purchase-orders/:id", async (c) => {
  const poId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("fleet_purchase_orders")
    .update(body.payload ?? body)
    .eq("id", poId)
    .eq("user_id", user.id)
    .select("*");
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.delete("/v1/fleet/purchase-orders/:id", async (c) => {
  const poId = c.req.param("id");
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("fleet_purchase_orders")
    .delete()
    .eq("id", poId)
    .eq("user_id", user.id)
    .select("*");
  if (error) throw error;
  return json({ data: data ?? [] });
});

const DRAFT_ATTACHMENT_SELECT = "id, draft_id, storage_path, label, mime_type, size_bytes, created_at";
const DRAFT_ATTACHMENT_BUCKET = "fleet-wo-attachments";

vehiclesRouter.get("/v1/fleet/work-order-drafts/:draftId/attachments", async (c) => {
  const draftId = c.req.param("draftId");
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;
  const { data, error } = await db
    .from("fleet_work_order_draft_attachments")
    .select(DRAFT_ATTACHMENT_SELECT)
    .eq("draft_id", draftId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as Array<{ storage_path: string }>;
  // Best-effort signed URLs (60 min).
  const paths = rows.map((r) => r.storage_path);
  if (paths.length === 0) return json({ data: rows });
  const { data: signed } = await (supabase as any).storage.from(DRAFT_ATTACHMENT_BUCKET).createSignedUrls(paths, 60 * 60);
  const urlByPath = new Map<string, string | null>(
    ((signed ?? []) as Array<{ path?: string | null; signedUrl?: string | null }>).map((s) => [
      s.path ?? "",
      s.signedUrl ?? null,
    ]),
  );
  return json({
    data: rows.map((r) => ({ ...r, signed_url: urlByPath.get(r.storage_path) ?? null })),
  });
});

vehiclesRouter.post("/v1/fleet/work-order-drafts/:draftId/attachments", async (c) => {
  const draftId = c.req.param("draftId");
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;
  const form = await c.req.parseBody();
  const file = form.file as File | undefined;
  const label = typeof form.label === "string" ? form.label : undefined;
  if (!file || typeof file === "string") throw new ApiError(400, "file is required", "invalid_input");

  const safeName = String((file as File).name || "attachment").replace(/[^a-zA-Z0-9._-]+/g, "_");
  const storage_path = `${user.id}/${draftId}/${Date.now()}-${safeName}`;

  const { error: upErr } = await (supabase as any).storage.from(DRAFT_ATTACHMENT_BUCKET).upload(storage_path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: (file as File).type || undefined,
  });
  if (upErr) throw new Error(upErr.message || "Failed to upload attachment");

  const { data, error } = await db
    .from("fleet_work_order_draft_attachments")
    .insert({
      draft_id: draftId,
      user_id: user.id,
      storage_path,
      label: label ?? (file as File).name,
      mime_type: (file as File).type || null,
      size_bytes: (file as File).size ?? null,
    })
    .select(DRAFT_ATTACHMENT_SELECT)
    .single();
  if (error) throw error;
  return json({ data });
});

vehiclesRouter.delete("/v1/fleet/work-order-drafts/attachments/:id", async (c) => {
  const id = c.req.param("id");
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;
  const { data: row } = await db
    .from("fleet_work_order_draft_attachments")
    .select("storage_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (row?.storage_path) {
    await (supabase as any).storage.from(DRAFT_ATTACHMENT_BUCKET).remove([row.storage_path]);
  }
  const { error } = await db
    .from("fleet_work_order_draft_attachments")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
  return json({ data: { ok: true } });
});

// ---------------------------------------------------------------------------
// Fleet work order drafts
// ---------------------------------------------------------------------------

function draftToJson(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

function draftUpdatePayload(patch: Record<string, any>): Record<string, unknown> {
  const { selected_vehicles, service_package, add_ons, ...scalars } = patch;
  return {
    ...scalars,
    ...(selected_vehicles === undefined ? {} : { selected_vehicles: draftToJson(selected_vehicles) }),
    ...(service_package === undefined ? {} : { service_package: service_package === null ? null : draftToJson(service_package) }),
    ...(add_ons === undefined ? {} : { add_ons: draftToJson(add_ons) }),
  };
}

function draftRecord(row: Record<string, any>): Record<string, unknown> {
  return {
    ...row,
    selected_vehicles: Array.isArray(row.selected_vehicles) ? row.selected_vehicles : [],
    service_package: row.service_package && typeof row.service_package === "object" && !Array.isArray(row.service_package)
      ? row.service_package
      : null,
    add_ons: Array.isArray(row.add_ons) ? row.add_ons : [],
    estimated_subtotal: row.estimated_subtotal ?? 0,
    estimated_discount: row.estimated_discount ?? 0,
    estimated_tax: row.estimated_tax ?? 0,
    estimated_total: row.estimated_total ?? 0,
  };
}

vehiclesRouter.post("/v1/fleet/work-order-drafts", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const payload = body.payload ?? body;
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;
  const { data: ownerId, error: ownerError } = await db.rpc("current_workspace_owner_user_id");
  if (ownerError || !ownerId) throw ownerError ?? new Error("No active Fleet workspace.");
  const insert = {
    ...draftUpdatePayload(payload),
    user_id: String(ownerId),
    created_by: user.id,
    status: payload.status ?? "draft",
  };
  const { data, error } = await db
    .from("fleet_work_order_drafts")
    .insert(insert)
    .select("id")
    .single();
  if (error) throw error;
  return json({ data: { id: String(data.id) } });
});

vehiclesRouter.patch("/v1/fleet/work-order-drafts/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { error } = await (supabase as any)
    .from("fleet_work_order_drafts")
    .update(draftUpdatePayload(body.patch ?? body))
    .eq("id", id);
  if (error) throw error;
  return json({ data: { ok: true } });
});

vehiclesRouter.delete("/v1/fleet/work-order-drafts/:id", async (c) => {
  const id = c.req.param("id");
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { error } = await (supabase as any)
    .from("fleet_work_order_drafts")
    .delete()
    .eq("id", id);
  if (error) throw error;
  return json({ data: { ok: true } });
});

vehiclesRouter.get("/v1/fleet/work-order-drafts/:id", async (c) => {
  const id = c.req.param("id");
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("fleet_work_order_drafts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return json({ data: data ? draftRecord(data) : null });
});

vehiclesRouter.post("/v1/fleet/work-order-drafts/:id/validate", async (c) => {
  const id = c.req.param("id");
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any).rpc("validate_fleet_work_order_draft", {
    _draft_id: id,
  });
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.post("/v1/fleet/work-order-drafts/:id/pricing", async (c) => {
  const id = c.req.param("id");
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any).rpc("resolve_fleet_work_order_draft_pricing", {
    _draft_id: id,
  });
  if (error) throw error;
  return json({ data: data ?? null });
});

vehiclesRouter.post("/v1/fleet/work-order-drafts/:id/approve", async (c) => {
  const id = c.req.param("id");
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { error } = await (supabase as any).rpc("approve_fleet_work_order_draft", {
    _draft_id: id,
  });
  if (error) throw error;
  return json({ data: { ok: true } });
});

/**
 * Promote a validated draft into one work order per selected vehicle.
 * Requires the draft to already be in `approved` status unless the caller
 * explicitly passes auto_approve: false (callers should invoke approveDraft
 * first so server-side validation and PO enforcement run).
 */
vehiclesRouter.post("/v1/fleet/work-order-drafts/:id/promote", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const autoApprove = body.auto_approve;
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;

  const { data: rawDraft, error: draftError } = await db
    .from("fleet_work_order_drafts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (draftError) throw draftError;
  if (!rawDraft) throw new Error("Draft not found.");
  const draft = draftRecord(rawDraft) as Record<string, any>;

  if (draft.status !== "approved" && autoApprove === false) {
    throw new Error("Draft must be approved before it can be promoted.");
  }
  if (!draft.customer_id) throw new Error("Draft missing customer.");
  if (!Array.isArray(draft.selected_vehicles) || draft.selected_vehicles.length === 0) {
    throw new Error("Draft has no vehicles selected.");
  }
  if (!draft.service_package) throw new Error("Draft missing service package.");

  const { data, error } = await db.rpc("promote_fleet_work_order_draft_v2", { p_draft_id: id });
  if (error) throw error;
  const createdIds = (data ?? []).map(String);
  // A Fleet Job is the site visit; each promoted work order remains the
  // vehicle-specific service record. Multi-vehicle drafts therefore become
  // one dispatchable job immediately rather than requiring a second grouping step.
  if (createdIds.length > 0) {
    const { error: jobError } = await db.rpc("create_fleet_job_for_work_orders_v1", {
      p_work_order_ids: createdIds,
      p_notes: draft.notes || "Created from multi-vehicle site visit",
    });
    if (jobError) throw jobError;
  }
  return json({ data: { createdIds } });
});

// ---------------------------------------------------------------------------
// Fleet check-in reads, dispatch actions/health, email reads, invoices, jobs,
// manager portal
// ---------------------------------------------------------------------------

const CHECKIN_WORK_ORDER_SELECT = `
  id, order_number, service_type, description, priority, status,
  scheduled_date, scheduled_time, sla_deadline,
  fleet_clients(company_name),
  fleet_vehicles(year, make, model, unit_number, license_plate),
  fleet_locations(name, address, city, state)
`;

vehiclesRouter.get("/v1/fleet/checkin/today", async (c) => {
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;
  const today = new Date().toISOString().split("T")[0];

  const { data } = await db
    .from("fleet_work_orders")
    .select(CHECKIN_WORK_ORDER_SELECT)
    .eq("user_id", user.id)
    .in("status", ["scheduled", "in_progress", "assigned", "pending_review"])
    .gte("scheduled_date", today)
    .order("scheduled_date")
    .order("scheduled_time");

  const orders = (data ?? []) as Array<{ id: string }>;

  // ⚡ Batch fetch all checkins in one query instead of N+1
  const grouped: Record<string, unknown[]> = {};
  if (orders.length > 0) {
    const ids = orders.map((o) => o.id);
    const { data: ciData } = await db
      .from("fleet_checkins")
      .select("*")
      .in("fleet_work_order_id", ids)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    for (const ci of (ciData ?? []) as Array<{ fleet_work_order_id: string }>) {
      if (!grouped[ci.fleet_work_order_id]) grouped[ci.fleet_work_order_id] = [];
      grouped[ci.fleet_work_order_id].push(ci);
    }
  }

  return json({ data: { workOrders: orders, checkins: grouped } });
});

vehiclesRouter.get("/v1/fleet/checkin/refresh", async (c) => {
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const today = new Date().toISOString().split("T")[0];
  const { data } = await (supabase as any)
    .from("fleet_work_orders")
    .select(CHECKIN_WORK_ORDER_SELECT)
    .eq("user_id", user.id)
    .in("status", ["scheduled", "in_progress"])
    .gte("scheduled_date", today)
    .order("scheduled_date")
    .order("scheduled_time");
  return json({ data: data ?? [] });
});

vehiclesRouter.get("/v1/fleet/checkin/checkins/:workOrderId", async (c) => {
  const workOrderId = c.req.param("workOrderId");
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data } = await (supabase as any)
    .from("fleet_checkins")
    .select("*")
    .eq("fleet_work_order_id", workOrderId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  return json({ data: data ?? [] });
});

vehiclesRouter.get("/v1/fleet/dispatch-actions", async (c) => {
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any).rpc("get_fleet_dispatch_next_actions_v1", { p_limit: 150 });
  if (error) throw error;
  return json({ data: { generatedAt: String(data?.generated_at ?? new Date().toISOString()), items: data?.items ?? [] } });
});

vehiclesRouter.get("/v1/fleet/operations-failures", async (c) => {
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any).rpc("get_fleet_operations_failures_v1", { p_limit: 150 });
  if (error) throw error;
  return json({
    data: {
      generated_at: String(data?.generated_at ?? new Date().toISOString()),
      dead_letters: data?.dead_letters ?? [],
      outbox: data?.outbox ?? [],
      invoices: data?.invoices ?? [],
    },
  });
});

vehiclesRouter.post("/v1/fleet/operations-failures/:id/retry", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { error } = await (supabase as any).rpc("retry_fleet_operational_failure_v1", {
    p_kind: body.kind,
    p_id: id,
  });
  if (error) throw error;
  return json({ data: { ok: true } });
});

vehiclesRouter.get("/v1/fleet/dispatch-health", async (c) => {
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any).rpc("get_fleet_dispatch_health_v1");
  if (error) throw error;
  return json({ data });
});

vehiclesRouter.get("/v1/fleet/email/mailbox-configuration", async (c) => {
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any).rpc("get_workspace_email_connection_status");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Workspace email settings are unavailable");
  return json({ data: row });
});

vehiclesRouter.get("/v1/fleet/email/messages", async (c) => {
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("fleet_email_messages")
    .select("id, thread_key, internet_message_id, direction, from_email, from_name, to_emails, subject, body_text, body_html, received_at, is_read")
    .order("received_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.get("/v1/fleet/invoices", async (c) => {
  const url = new URL(c.req.url);
  const clientId = url.searchParams.get("client_id");
  const { supabase, user } = await requireFleetScope(c, url.searchParams.get("selected_workspace_id"));
  let query = (supabase as any)
    .from("invoices")
    .select(
      "id, invoice_number, fleet_client_id, status, issue_date, due_date, total, amount_paid, sent_at, delivery_status, delivery_last_error, delivery_attempt_count, created_at, fleet_clients(company_name)",
    )
    .eq("user_id", user.id)
    .eq("bill_to_type", "fleet");
  if (clientId) query = query.eq("fleet_client_id", clientId);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return json({ data: data ?? [] });
});

const FLEET_JOB_WORK_ORDER_SELECT =
  "*, fleet_vehicles(year, make, model, unit_number), fleet_clients(company_name), fleet_locations(name, address, city, state), fleet_jobs(id, job_number)";

vehiclesRouter.get("/v1/fleet/jobs/:id", async (c) => {
  const jobId = c.req.param("id");
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;
  const { data, error } = await db
    .from("fleet_jobs")
    .select("*, fleet_clients(id, company_name), fleet_locations(id, name, address, city, state), technicians(id, name)")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return json({ data: null });

  const { data: orders, error: ordersError } = await db
    .from("fleet_work_orders")
    .select(FLEET_JOB_WORK_ORDER_SELECT)
    .eq("fleet_job_id", jobId)
    .order("created_at", { ascending: true });
  if (ordersError) throw ordersError;

  return json({ data: { ...data, work_orders: orders ?? [] } });
});

vehiclesRouter.get("/v1/fleet/manager-portal", async (c) => {
  const url = new URL(c.req.url);
  const { supabase } = await requireFleetScope(c, url.searchParams.get("selected_workspace_id"));
  const { data, error } = await (supabase as any).rpc("get_fleet_manager_portal_v1", {
    p_client_id: url.searchParams.get("client_id"),
  });
  if (error) throw error;
  return json({ data });
});

vehiclesRouter.post("/v1/fleet/manager-portal/requests", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const input = body.input ?? body;
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any).rpc("create_fleet_portal_service_request_v1", {
    p_client_id: input.clientId,
    p_vehicle_id: input.vehicleId ?? null,
    p_subject: input.subject,
    p_summary: input.summary,
    p_priority: input.priority,
  });
  if (error) throw error;
  return json({ data: { id: String(data) } });
});

vehiclesRouter.post("/v1/fleet/manager-portal/approvals/:id/respond", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { error } = await (supabase as any).rpc("respond_fleet_portal_approval_v1", {
    p_approval_id: id,
    p_status: body.status,
    p_notes: body.notes ?? null,
  });
  if (error) throw error;
  return json({ data: { ok: true } });
});

// ---------------------------------------------------------------------------
// Fleet map, resource capacity, service requests, tracking, vehicle profile
// ---------------------------------------------------------------------------

function mapCoordinates(value: unknown): { lat: number; lng: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const point = value as Record<string, unknown>;
  return typeof point.lat === "number" && typeof point.lng === "number"
    ? { lat: point.lat, lng: point.lng }
    : null;
}

vehiclesRouter.get("/v1/fleet/map-data", async (c) => {
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;
  const today = new Date().toISOString().slice(0, 10);

  const [vansRes, territoriesRes, techsRes, jobsRes] = await Promise.all([
    db
      .from("vans")
      .select("id, name, status, color, make, model, year, license_plate, assigned_technician_id")
      .eq("user_id", user.id)
      .eq("is_active", true),
    db.from("van_territories").select("van_id, zip_code, is_primary"),
    db
      .from("technicians")
      .select("id, name, status, current_location, avatar_url")
      .eq("user_id", user.id)
      .eq("is_active", true),
    db
      .from("appointments")
      .select("id, assigned_van_id")
      .eq("user_id", user.id)
      .eq("scheduled_date", today)
      .not("status", "in", '("cancelled","completed")'),
  ]);

  const vansData = vansRes.data;
  if (!vansData) return json({ data: [] });

  const techsData = techsRes.data ?? [];
  const techMap = new Map<string, any>();
  techsData.forEach((t: any) => techMap.set(t.id, t));

  const territoryMap: Record<string, Array<{ zip_code: string; is_primary: boolean }>> = {};
  (territoriesRes.data ?? []).forEach((t: any) => {
    if (!territoryMap[t.van_id]) territoryMap[t.van_id] = [];
    territoryMap[t.van_id].push({ zip_code: t.zip_code, is_primary: t.is_primary === true });
  });

  const jobCountMap: Record<string, number> = {};
  (jobsRes.data ?? []).forEach((j: any) => {
    const vid = j.assigned_van_id;
    if (vid) jobCountMap[vid] = (jobCountMap[vid] || 0) + 1;
  });

  return json({
    data: vansData.map((van: any) => {
      const tech = van.assigned_technician_id ? techMap.get(van.assigned_technician_id) ?? null : null;
      const rawLoc = mapCoordinates(tech?.current_location);
      return {
        id: van.id,
        name: van.name,
        status: van.status,
        color: van.color ?? null,
        make: van.make ?? null,
        model: van.model ?? null,
        year: van.year ?? null,
        license_plate: van.license_plate ?? null,
        zipCodes: territoryMap[van.id] || [],
        technician: tech
          ? {
              id: tech.id,
              name: tech.name,
              status: tech.status,
              current_location: rawLoc,
            }
          : null,
        currentLocation: null as { lat: number; lng: number } | null,
        todayJobCount: jobCountMap[van.id] || 0,
      };
    }),
  });
});

vehiclesRouter.get("/v1/fleet/resource-capacity", async (c) => {
  const url = new URL(c.req.url);
  const { supabase } = await requireFleetScope(c, url.searchParams.get("selected_workspace_id"));
  const { data, error } = await (supabase as any).rpc("get_fleet_resource_capacity_v1", {
    p_date: url.searchParams.get("date"),
  });
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.get("/v1/fleet/service-requests", async (c) => {
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("fleet_service_requests")
    .select("*, fleet_clients(company_name), fleet_vehicles(unit_number,year,make,model)")
    .eq("user_id", user.id)
    .order("received_at", { ascending: false });
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.post("/v1/fleet/service-requests", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const input = body.input ?? body;
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("fleet_service_requests")
    .insert({
      user_id: user.id,
      source_type: input.source_type ?? "internal",
      status: "new",
      ...input,
    })
    .select()
    .single();
  if (error) throw error;
  return json({ data });
});

vehiclesRouter.get("/v1/fleet/dispatch-search", async (c) => {
  const url = new URL(c.req.url);
  const query = url.searchParams.get("query") ?? "";
  const { supabase } = await requireFleetScope(c, url.searchParams.get("selected_workspace_id"));
  if (query.trim().length < 2) return json({ data: [] });
  const { data, error } = await (supabase as any).rpc("search_fleet_dispatch_v1", {
    p_query: query.trim(),
    p_limit: 30,
  });
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.post("/v1/fleet/service-requests/:id/claim", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any).rpc("claim_fleet_service_request_v1", {
    p_request_id: id,
    p_version: body.version,
  });
  if (error) throw error;
  return json({ data });
});

vehiclesRouter.patch("/v1/fleet/service-requests/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("fleet_service_requests")
    .update(body.patch ?? body)
    .eq("id", id)
    .eq("version", body.version)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("This request changed. Refresh and try again.");
  return json({ data: { ok: true } });
});

vehiclesRouter.post("/v1/fleet/service-requests/:id/convert-to-draft", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any).rpc("convert_fleet_service_request_to_draft_v1", {
    p_request_id: id,
    p_version: body.version,
  });
  if (error) throw error;
  return json({ data: { id: String(data) } });
});

vehiclesRouter.post("/v1/fleet/service-requests/from-email", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any).rpc("create_fleet_request_from_email_v1", {
    p_message_id: body.message_id,
    p_disposition: body.disposition ?? "service_request",
  });
  if (error) throw error;
  return json({ data: { id: String(data) } });
});

vehiclesRouter.get("/v1/fleet/work-orders/:id/tracking", async (c) => {
  const id = c.req.param("id");
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("fleet_work_orders")
    .select("*, fleet_clients(company_name), fleet_locations(*), technicians(*)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return json({ data });
});

vehiclesRouter.get("/v1/fleet/vehicles/:id/profile", async (c) => {
  const id = c.req.param("id");
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("fleet_vehicles")
    .select("*, fleet_clients(id, company_name), fleet_locations(id, name), fleet_contracts(id, name)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return json({ data });
});

vehiclesRouter.get("/v1/fleet/vehicles/:id/work-orders", async (c) => {
  const id = c.req.param("id");
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("fleet_work_orders")
    .select("id, order_number, status, service_type, scheduled_date, total, completed_at")
    .eq("fleet_vehicle_id", id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.get("/v1/vehicle-specs/match", async (c) => {
  const url = new URL(c.req.url);
  const year = Number(url.searchParams.get("year"));
  const make = url.searchParams.get("make") ?? "";
  const model = url.searchParams.get("model") ?? "";
  const { supabase } = await requireFleetScope(c, url.searchParams.get("selected_workspace_id"));
  const { data, error } = await (supabase as any)
    .from("vehicle_specifications")
    .select("*")
    .eq("year", year)
    .ilike("make", make)
    .ilike("model", `%${model}%`)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return json({ data });
});

vehiclesRouter.post("/v1/vehicle-specs", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const payload = body.payload ?? body;
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("vehicle_specifications")
    .insert({ ...payload, source: "manual" })
    .select("*")
    .single();
  if (error) throw error;
  return json({ data });
});

vehiclesRouter.patch("/v1/vehicle-specs/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("vehicle_specifications")
    .update({ ...(body.payload ?? body), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return json({ data });
});

// ---------------------------------------------------------------------------
// Fleet reports & service records page data
// ---------------------------------------------------------------------------

const EMPTY_FLEET_REPORT: Record<string, unknown> = {
  stats: {
    totalSpend: 0,
    vehicleCount: 0,
    locationCount: 0,
    avgCostPerVehicle: 0,
    openApprovals: 0,
    overdueVehicles: 0,
    poOpenCount: 0,
    invoicesPending: 0,
  },
  topVehicles: [],
};

/**
 * Fleet monetary reporting is intentionally conservative here. Production no
 * longer has the legacy fleet_work_orders / fleet_purchase_orders tables that
 * previously supplied spend and PO totals, so those values remain zero rather
 * than inventing financial truth. Operational fleet counts come from the
 * canonical workspace-scoped service-request domain.
 */
vehiclesRouter.get("/v1/fleet/reports", async (c) => {
  const url = new URL(c.req.url);
  const workspaceId = url.searchParams.get("selected_workspace_id");
  // Mirrors resolveCurrentWorkspace() == null -> EMPTY.
  if (!workspaceId) return json({ data: EMPTY_FLEET_REPORT });
  const { supabase } = await requireAuth(c);

  const { data, error } = await (supabase as any)
    .from("fleet_service_requests")
    .select("vehicle_id,location_id,status,requested_for")
    .eq("workspace_id", workspaceId);
  if (error) throw error;

  const requests = (data ?? []) as Array<{
    vehicle_id: string | null;
    location_id: string | null;
    status: string | null;
    requested_for: string | null;
  }>;
  const vehicleIds = new Set(requests.map((row) => row.vehicle_id).filter(Boolean));
  const locationIds = new Set(requests.map((row) => row.location_id).filter(Boolean));
  const terminal = new Set(["completed", "cancelled", "closed", "voided"]);
  const now = Date.now();
  const open = requests.filter((row) => !terminal.has(String(row.status ?? "").toLowerCase()));
  const overdue = open.filter((row) => row.requested_for && Date.parse(row.requested_for) < now).length;

  return json({
    data: {
      stats: {
        ...(EMPTY_FLEET_REPORT.stats as Record<string, number>),
        vehicleCount: vehicleIds.size,
        locationCount: locationIds.size,
        openApprovals: open.length,
        overdueVehicles: overdue,
      },
      topVehicles: [],
    },
  });
});

vehiclesRouter.get("/v1/service-records/page", async (c) => {
  const url = new URL(c.req.url);
  const workspaceId = url.searchParams.get("selected_workspace_id");
  if (!workspaceId) return json({ data: null });
  const { supabase, user } = await requireAuth(c);
  const db = supabase as any;

  const [servicesRes, customersRes, vehiclesRes] = await Promise.all([
    db.from("service_records")
      .select("id,customer_id,vehicle_id,status,work_performed,customer_notes,internal_notes,metadata,started_at,completed_at,created_at,subtotal,total_amount,technician_id")
      .eq("workspace_id", workspaceId)
      .neq("status", "voided")
      .order("completed_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    db.from("customers")
      .select("id,first_name,last_name")
      .eq("workspace_id", workspaceId)
      .neq("status", "archived")
      .order("last_name"),
    db.from("vehicles")
      .select("id,customer_id,make,model,year")
      .eq("workspace_id", workspaceId)
      .neq("status", "archived")
      .order("created_at", { ascending: false }),
  ]);

  if (servicesRes.error) throw servicesRes.error;
  if (customersRes.error) throw customersRes.error;
  if (vehiclesRes.error) throw vehiclesRes.error;

  return json({
    data: {
      services: servicesRes.data ?? [],
      customers: customersRes.data ?? [],
      vehicles: vehiclesRes.data ?? [],
      userId: user.id,
    },
  });
});

// ---------------------------------------------------------------------------
// Fleet ops dashboard — single Promise.all fan-out, aggregated server-side
// ---------------------------------------------------------------------------

function opsIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function opsAddDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function opsCategorizeInventory(item: { name: string | null; category: string | null }): string | null {
  const name = String(item.name || "").toLowerCase();
  const category = String(item.category || "").toLowerCase();
  const haystack = `${name} ${category}`;

  if (/\b(oil|0w|5w|10w|15w|20w)\b/.test(haystack)) return "oil";
  if (haystack.includes("filter")) return "filters";
  if (haystack.includes("drain") || haystack.includes("plug") || haystack.includes("washer"))
    return "drainPlugs";
  if (
    haystack.includes("supply") ||
    haystack.includes("supplies") ||
    haystack.includes("rag") ||
    haystack.includes("glove") ||
    haystack.includes("shop")
  )
    return "supplies";
  return null;
}

vehiclesRouter.get("/v1/fleet/ops-dashboard", async (c) => {
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;
  const userId = user.id;

  const now = new Date();
  const today = opsIsoDate(now);
  const weekEnd = opsIsoDate(opsAddDays(now, 7));
  const nextWeekStart = opsIsoDate(opsAddDays(now, 8));
  const nextWeekEnd = opsIsoDate(opsAddDays(now, 14));
  const thirtyDayEnd = opsIsoDate(opsAddDays(now, 30));
  const monthStart = opsIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const startOfDayIso = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  const [
    todayWosRes,
    scheduledTodayRes,
    clientsRes,
    activeTechsRes,
    clockedInRes,
    schedulesRes,
    outstandingWosRes,
    pipelineRes,
    revenueOutstandingRes,
    revenuePendingApprovalRes,
    inventoryRes,
    completedRes,
    paymentsRes,
  ] = await Promise.all([
    db
      .from("fleet_work_orders")
      .select(
        "id, scheduled_date, scheduled_time, status, total, assigned_technician_id, started_at, completed_at, fleet_client_id, fleet_vehicle_id, fleet_clients(company_name), fleet_locations(name), technicians:assigned_technician_id(name, current_location, status)"
      )
      .eq("user_id", userId)
      .eq("scheduled_date", today)
      .order("scheduled_time", { ascending: true, nullsFirst: false }),
    db
      .from("fleet_work_orders")
      .select("fleet_vehicle_id", { head: false })
      .eq("user_id", userId)
      .eq("scheduled_date", today),
    db.from("fleet_clients").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "active"),
    db
      .from("technicians")
      .select("id, name, status, current_location")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("name"),
    db
      .from("time_clock_entries")
      .select("technician_id, status, clock_in, clock_out")
      .eq("user_id", userId)
      .is("clock_out", null)
      .gte("clock_in", startOfDayIso),
    db
      .from("fleet_service_schedules")
      .select("id, fleet_client_id, fleet_vehicle_id, due_date, status, queue_status, fleet_clients(company_name)")
      .eq("user_id", userId),
    db
      .from("fleet_work_orders")
      .select("total, invoice_paid_amount, invoice_balance_due")
      .eq("user_id", userId)
      .in("invoice_status", ["sent", "partially_paid"]),
    db
      .from("fleet_work_orders")
      .select("id, status, assigned_technician_id, approval_required, submitted_at, accepted_at, started_at, completed_at, invoice_status, checkin_geo")
      .eq("user_id", userId)
      .in("status", ["draft", "pending_review", "scheduled", "assigned", "in_progress", "completed", "invoiced"]),
    db
      .from("fleet_work_orders")
      .select("invoice_balance_due")
      .eq("user_id", userId)
      .in("invoice_status", ["sent", "partially_paid"]),
    db
      .from("fleet_work_orders")
      .select("total")
      .eq("user_id", userId)
      .eq("approval_required", true)
      .is("accepted_at", null),
    db
      .from("inventory_items")
      .select("id, name, category, quantity, low_stock_threshold, unit")
      .eq("user_id", userId),
    db
      .from("fleet_work_orders")
      .select("fleet_client_id, total, completed_at")
      .eq("user_id", userId)
      .in("status", ["completed", "invoiced", "paid"])
      .order("completed_at", { ascending: false }),
    db
      .from("fleet_work_orders")
      .select("fleet_client_id, invoice_balance_due")
      .eq("user_id", userId)
      .in("invoice_status", ["sent", "partially_paid"]),
  ]);

  // ─── KPI: today's jobs / revenue / techs working ────────────────────────

  const todayWos = (todayWosRes.data ?? []) as Array<Record<string, any>>;
  const todayJobs = todayWos.length;
  const todayRevenue = todayWos.reduce((s, w) => s + Number(w.total || 0), 0);
  const vehiclesScheduledToday = new Set((scheduledTodayRes.data ?? []).map((r: any) => r.fleet_vehicle_id)).size;
  const fleetCustomers = clientsRes.count ?? 0;

  const activeTechs = activeTechsRes.data ?? [];
  const clockedIn = new Set((clockedInRes.data ?? []).map((r: any) => r.technician_id));
  const techniciansWorking = clockedIn.size || activeTechs.length;

  // ─── KPI: fleet health + overdue PMs ────────────────────────────────────

  const schedules = schedulesRes.data ?? [];
  const uniqueVehicles = new Set(schedules.map((s: any) => s.fleet_vehicle_id));
  const overdueSet = new Set(schedules.filter((s: any) => s.status === "overdue").map((s: any) => s.fleet_vehicle_id));
  const overduePms = overdueSet.size;
  const totalScheduledVehicles = uniqueVehicles.size;
  const fleetHealth =
    totalScheduledVehicles === 0
      ? 100
      : Math.round(((totalScheduledVehicles - overdueSet.size) / totalScheduledVehicles) * 100);

  // ─── KPI: outstanding invoices ──────────────────────────────────────────

  const outstandingInvoices = (outstandingWosRes.data ?? []).reduce(
    (s: number, r: any) => s + Number(r.invoice_balance_due || Math.max(0, (r.total || 0) - (r.invoice_paid_amount || 0))),
    0
  );

  const kpis = {
    todayJobs,
    todayRevenue,
    vehiclesScheduledToday,
    fleetCustomers,
    techniciansWorking,
    overduePms,
    outstandingInvoices,
    fleetHealth,
  };

  // ─── Today's schedule ───────────────────────────────────────────────────

  const scheduleByKey = new Map<string, any>();
  todayWos.forEach((w) => {
    const time = w.scheduled_time ? String(w.scheduled_time).slice(0, 5) : null;
    const clientId = w.fleet_client_id || "unknown";
    const key = `${clientId}::${time || "unscheduled"}`;
    const existing = scheduleByKey.get(key);
    const tech = w.technicians ?? null;
    const clientName = w.fleet_clients?.company_name ?? "Unknown";
    const locationName = w.fleet_locations?.name ?? null;
    if (existing) {
      existing.vehicleCount += 1;
      existing.total += Number(w.total || 0);
    } else {
      scheduleByKey.set(key, {
        id: w.id,
        time,
        clientName,
        vehicleCount: 1,
        technicianName: tech?.name ?? null,
        status: w.status,
        total: Number(w.total || 0),
        locationName,
        eta: null,
      });
    }
  });
  const todaySchedule = Array.from(scheduleByKey.values()).sort((a, b) => {
    if (!a.time && !b.time) return 0;
    if (!a.time) return 1;
    if (!b.time) return -1;
    return a.time.localeCompare(b.time);
  });

  // ─── Customer attention (from schedules + WO waiting approval) ──────────

  const pipelineRows = pipelineRes.data ?? [];
  const awaitingByClient = new Map<string, number>();
  pipelineRows.forEach((w: any) => {
    const isWaiting = w.status === "pending_review" || (w.approval_required === true && !w.accepted_at);
    if (isWaiting) {
      // We didn't select client id in pipelineRes to keep the payload lean;
      // instead we approximate via the total across all clients below.
    }
  });

  // For per-client attention counts, we need client id on both schedules and pipeline WOs.
  // Refetch waiting-approval WOs with client id (cheap).
  const { data: waitingRows } = await db
    .from("fleet_work_orders")
    .select("fleet_client_id, fleet_clients(company_name)")
    .eq("user_id", userId)
    .or("status.eq.pending_review,and(approval_required.eq.true,accepted_at.is.null)");

  (waitingRows ?? []).forEach((row: any) => {
    const key = row.fleet_client_id;
    if (!key) return;
    awaitingByClient.set(key, (awaitingByClient.get(key) || 0) + 1);
  });

  const clientAttention = new Map<string, any>();
  const bumpAttention = (clientId: string, clientName: string, field: string) => {
    if (!clientId) return;
    const existing =
      clientAttention.get(clientId) ?? {
        fleetClientId: clientId,
        clientName,
        overdue: 0,
        dueThisWeek: 0,
        upcoming: 0,
        awaitingApproval: 0,
      };
    existing[field] = (existing[field] as number) + 1;
    clientAttention.set(clientId, existing);
  };

  schedules.forEach((s: any) => {
    const clientId = s.fleet_client_id;
    const clientName = s.fleet_clients?.company_name ?? "Unknown";
    if (!clientId) return;
    if (s.status === "overdue") bumpAttention(clientId, clientName, "overdue");
    else if (s.status === "due") bumpAttention(clientId, clientName, "dueThisWeek");
    else if (s.status === "upcoming") bumpAttention(clientId, clientName, "upcoming");
  });

  (waitingRows ?? []).forEach((row: any) => {
    if (!row.fleet_client_id) return;
    bumpAttention(row.fleet_client_id, row.fleet_clients?.company_name ?? "Unknown", "awaitingApproval");
  });

  const attention = Array.from(clientAttention.values()).sort(
    (a, b) =>
      b.overdue * 3 + b.dueThisWeek * 2 + b.awaitingApproval * 2 + b.upcoming -
      (a.overdue * 3 + a.dueThisWeek * 2 + a.awaitingApproval * 2 + a.upcoming)
  );

  // ─── Pipeline funnel ────────────────────────────────────────────────────

  const pipeline = {
    new: 0,
    assigned: 0,
    traveling: 0,
    onSite: 0,
    waitingApproval: 0,
    completed: 0,
    invoiced: 0,
  };
  pipelineRows.forEach((w: any) => {
    const waitingApproval = w.status === "pending_review" || (w.approval_required === true && !w.accepted_at);
    if (waitingApproval) {
      pipeline.waitingApproval += 1;
      return;
    }
    switch (w.status) {
      case "draft":
        pipeline.new += 1;
        break;
      case "scheduled":
      case "assigned":
        if (w.assigned_technician_id) pipeline.assigned += 1;
        else pipeline.new += 1;
        break;
      case "in_progress":
        if (w.checkin_geo) pipeline.onSite += 1;
        else if (w.started_at) pipeline.traveling += 1;
        else pipeline.onSite += 1;
        break;
      case "completed":
        pipeline.completed += 1;
        break;
      case "invoiced":
        pipeline.invoiced += 1;
        break;
    }
  });

  // ─── Technician status panel ────────────────────────────────────────────

  const currentWoByTech = new Map<string, any>();
  todayWos.forEach((w) => {
    if (
      w.assigned_technician_id &&
      (w.status === "in_progress" || w.status === "assigned") &&
      !currentWoByTech.has(w.assigned_technician_id)
    ) {
      currentWoByTech.set(w.assigned_technician_id, w);
    }
  });

  const technicians = activeTechs.map((t: any) => {
    const wo = currentWoByTech.get(t.id);
    const loc = t.current_location as { lat?: number; lng?: number } | null;
    return {
      id: t.id,
      name: t.name,
      status: t.status || "available",
      currentLocation:
        loc && typeof loc.lat === "number" && typeof loc.lng === "number" ? { lat: loc.lat, lng: loc.lng } : null,
      currentJob: wo
        ? {
            id: wo.id,
            clientName: wo.fleet_clients?.company_name ?? null,
            scheduledTime: wo.scheduled_time ?? null,
          }
        : null,
      clockedIn: clockedIn.has(t.id),
    };
  });

  // ─── Revenue widget ─────────────────────────────────────────────────────

  const completedRows = completedRes.data ?? [];
  const completedTodayTotal = completedRows
    .filter((r: any) => r.completed_at && String(r.completed_at).slice(0, 10) === today)
    .reduce((s: number, r: any) => s + Number(r.total || 0), 0);

  const revenue = {
    scheduledToday: todayRevenue,
    completedToday: completedTodayTotal,
    pendingApproval: (revenuePendingApprovalRes.data ?? []).reduce((s: number, r: any) => s + Number(r.total || 0), 0),
    outstanding: (revenueOutstandingRes.data ?? []).reduce((s: number, r: any) => s + Number(r.invoice_balance_due || 0), 0),
  };

  // ─── PM Forecast ────────────────────────────────────────────────────────

  const dueDates = schedules
    .filter((s: any) => ["due", "overdue", "upcoming"].includes(s.status))
    .map((s: any) => s.due_date)
    .filter(Boolean) as string[];

  const forecast = {
    today: dueDates.filter((d) => d <= today).length,
    thisWeek: dueDates.filter((d) => d > today && d <= weekEnd).length,
    nextWeek: dueDates.filter((d) => d >= nextWeekStart && d <= nextWeekEnd).length,
    thirtyDays: dueDates.filter((d) => d <= thirtyDayEnd).length,
  };

  // ─── Customer health cards ──────────────────────────────────────────────

  const vehicleCountByClient = new Map<string, number>();
  const overdueByClient = new Map<string, number>();
  const vehiclesByClient = new Map<string, Set<string>>();
  schedules.forEach((s: any) => {
    if (!s.fleet_client_id) return;
    const set = vehiclesByClient.get(s.fleet_client_id) ?? new Set<string>();
    set.add(s.fleet_vehicle_id);
    vehiclesByClient.set(s.fleet_client_id, set);
    if (s.status === "overdue") {
      overdueByClient.set(s.fleet_client_id, (overdueByClient.get(s.fleet_client_id) || 0) + 1);
    }
  });
  vehiclesByClient.forEach((v, k) => vehicleCountByClient.set(k, v.size));

  const revenueByClient = new Map<string, { total: number; last: string | null; monthly: number }>();
  const monthStartDate = new Date(monthStart);
  completedRows.forEach((r: any) => {
    if (!r.fleet_client_id) return;
    const existing = revenueByClient.get(r.fleet_client_id) ?? { total: 0, last: null as string | null, monthly: 0 };
    existing.total += Number(r.total || 0);
    if (r.completed_at && (!existing.last || r.completed_at > existing.last)) {
      existing.last = r.completed_at;
    }
    if (r.completed_at && new Date(r.completed_at) >= monthStartDate) {
      existing.monthly += Number(r.total || 0);
    }
    revenueByClient.set(r.fleet_client_id, existing);
  });

  const arByClient = new Map<string, number>();
  (paymentsRes.data ?? []).forEach((r: any) => {
    if (!r.fleet_client_id) return;
    arByClient.set(r.fleet_client_id, (arByClient.get(r.fleet_client_id) || 0) + Number(r.invoice_balance_due || 0));
  });

  const clientNameLookup = new Map<string, string>();
  schedules.forEach((s: any) => {
    if (s.fleet_client_id && s.fleet_clients?.company_name) {
      clientNameLookup.set(s.fleet_client_id, s.fleet_clients.company_name);
    }
  });

  // Build health list ranked by lifetime revenue (top 5)
  const health = Array.from(revenueByClient.entries())
    .map(([clientId, rev]) => {
      const totalVehicles = vehicleCountByClient.get(clientId) || 0;
      const overdue = overdueByClient.get(clientId) || 0;
      const compliance = totalVehicles === 0 ? 100 : Math.round(((totalVehicles - overdue) / totalVehicles) * 100);
      return {
        fleetClientId: clientId,
        clientName: clientNameLookup.get(clientId) || "Unknown",
        vehicleCount: totalVehicles,
        pmCompliance: compliance,
        outstandingAr: arByClient.get(clientId) || 0,
        lastVisit: rev.last,
        lifetimeRevenue: rev.total,
        monthlyAverage: rev.monthly,
      };
    })
    .sort((a, b) => b.lifetimeRevenue - a.lifetimeRevenue)
    .slice(0, 5);

  // ─── Inventory signals ──────────────────────────────────────────────────

  const inventoryRows = inventoryRes.data ?? [];
  const inventory: {
    oil: any[];
    filters: any[];
    drainPlugs: any[];
    supplies: any[];
    totalLow: number;
  } = { oil: [], filters: [], drainPlugs: [], supplies: [], totalLow: 0 };
  inventoryRows.forEach((row: any) => {
    if (Number(row.quantity) > Number(row.low_stock_threshold)) return;
    const bucket = opsCategorizeInventory(row);
    if (!bucket) return;
    const item = {
      id: row.id,
      name: row.name,
      category: row.category ?? null,
      quantity: Number(row.quantity ?? 0),
      threshold: Number(row.low_stock_threshold ?? 0),
      unit: row.unit ?? "each",
    };
    inventory[bucket as "oil" | "filters" | "drainPlugs" | "supplies"].push(item);
    inventory.totalLow += 1;
  });

  return json({
    data: {
      kpis,
      todaySchedule,
      attention,
      pipeline,
      technicians,
      revenue,
      forecast,
      health,
      inventory,
    },
  });
});

// ---------------------------------------------------------------------------
// Fleet core reads (fleet.query.ts)
// ---------------------------------------------------------------------------

vehiclesRouter.get("/v1/fleet/dashboard", async (c) => {
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;
  const userId = user.id;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const today = now.toISOString().split("T")[0];

  const [
    clientsRes,
    vehiclesRes,
    openWoRes,
    completedRes,
    recentRes,
    scheduledRes,
    dueVehiclesRes,
    pendingInvRes,
    posRes,
  ] = await Promise.all([
    db.from("fleet_clients").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "active"),
    db.from("fleet_vehicles").select("id", { count: "exact", head: true }).eq("user_id", userId),
    db
      .from("fleet_work_orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", ["draft", "scheduled", "in_progress"]),
    db
      .from("fleet_work_orders")
      .select("id, total", { count: "exact" })
      .eq("user_id", userId)
      .eq("status", "completed")
      .gte("completed_at", monthStart),
    db
      .from("fleet_work_orders")
      .select("*, fleet_vehicles(year, make, model, unit_number), fleet_clients(company_name)")
      .eq("user_id", userId)
      .in("status", ["completed", "invoiced"])
      .order("completed_at", { ascending: false })
      .limit(5),
    db
      .from("fleet_work_orders")
      .select("*, fleet_vehicles(year, make, model, unit_number), fleet_clients(company_name)")
      .eq("user_id", userId)
      .eq("status", "scheduled")
      .lte("scheduled_date", weekFromNow)
      .order("scheduled_date")
      .limit(5),
    db
      .from("fleet_work_orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "scheduled")
      .lte("scheduled_date", today),
    db
      .from("fleet_work_orders")
      .select("total")
      .eq("user_id", userId)
      .eq("status", "completed")
      .eq("invoice_status", "pending"),
    db
      .from("fleet_purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", ["open", "partially_used"]),
  ]);

  const monthlyTotal =
    ((completedRes.data as Array<{ total: number | null }> | null)?.reduce((sum, o) => sum + (o.total || 0), 0) ?? 0);
  const pendingInvTotal =
    ((pendingInvRes.data as Array<{ total: number | null }> | null)?.reduce((sum, o) => sum + (o.total || 0), 0) ?? 0);

  return json({
    data: {
      stats: {
        totalClients: clientsRes.count ?? 0,
        totalVehicles: vehiclesRes.count ?? 0,
        openWorkOrders: openWoRes.count ?? 0,
        completedThisMonth: completedRes.count ?? 0,
        monthlyRevenue: monthlyTotal,
        overdueOrders: dueVehiclesRes.count ?? 0,
        vehiclesDueThisWeek: (scheduledRes.data as Array<unknown> | null)?.length ?? 0,
        pendingInvoiceTotal: pendingInvTotal,
        openPOs: posRes.count ?? 0,
      },
      recentOrders: (recentRes.data as Array<unknown> | null) ?? [],
      scheduledOrders: (scheduledRes.data as Array<unknown> | null) ?? [],
    },
  });
});

vehiclesRouter.get("/v1/fleet/work-orders/page", async (c) => {
  const url = new URL(c.req.url);
  const q = url.searchParams;
  const { supabase, user } = await requireFleetScope(c, q.get("selected_workspace_id"));
  const db = supabase as any;
  const userId = user.id;

  const page = Math.max(1, Number(q.get("page") ?? 1) || 1);
  const pageSize = Math.max(1, Math.min(200, Number(q.get("page_size") ?? 50) || 50));
  const search = q.get("search") ?? "";
  const status = q.get("status");
  const clientId = q.get("client_id");
  const sort = q.get("sort") ?? "scheduled_desc";

  const fleetSchedulerSelect =
    "*, fleet_vehicles(year, make, model, unit_number), fleet_clients(company_name), fleet_locations(name, address, city, state), fleet_jobs(id, job_number)";
  const openStatuses = ["draft", "pending_review", "scheduled", "assigned", "en_route", "arrived", "in_progress"];

  let query = db.from("fleet_work_orders").select(fleetSchedulerSelect, { count: "exact" }).eq("user_id", userId);
  if (status) query = query.eq("status", status);
  if (clientId) query = query.eq("fleet_client_id", clientId);
  if (search.trim()) {
    const value = search.trim().replace(/[,%()]/g, "");
    query = query.or(`order_number.ilike.%${value}%,po_number.ilike.%${value}%,service_type.ilike.%${value}%`);
  }
  const column = sort.startsWith("created") ? "created_at" : "scheduled_date";
  query = query
    .order(column, { ascending: sort.endsWith("asc"), nullsFirst: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const statuses = ["draft", "pending_review", "scheduled", "assigned", "en_route", "arrived", "in_progress", "completed", "invoiced", "paid"];
  const [pageRes, open, active, priority, ...statusResults] = await Promise.all([
    query,
    db.from("fleet_work_orders").select("id", { count: "exact", head: true }).eq("user_id", userId).in("status", openStatuses),
    db.from("fleet_work_orders").select("id", { count: "exact", head: true }).eq("user_id", userId).in("status", ["assigned", "en_route", "arrived", "in_progress"]),
    db.from("fleet_work_orders").select("id", { count: "exact", head: true }).eq("user_id", userId).in("priority", ["high", "urgent"]).in("status", openStatuses),
    ...statuses.map((s) =>
      db.from("fleet_work_orders").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", s),
    ),
  ]);
  if (pageRes.error) throw pageRes.error;
  return json({
    data: {
      rows: pageRes.data ?? [],
      total: pageRes.count ?? 0,
      counts: Object.fromEntries(statuses.map((s, index) => [s, statusResults[index].count ?? 0])),
      aggregates: { open: open.count ?? 0, active: active.count ?? 0, priority: priority.count ?? 0 },
    },
  });
});

vehiclesRouter.get("/v1/fleet/scheduler-window", async (c) => {
  const url = new URL(c.req.url);
  const q = url.searchParams;
  const { supabase, user } = await requireFleetScope(c, q.get("selected_workspace_id"));
  const db = supabase as any;
  const userId = user.id;
  const startDate = q.get("start_date");
  const endDate = q.get("end_date");

  const fleetSchedulerSelect =
    "*, fleet_vehicles(year, make, model, unit_number), fleet_clients(company_name), fleet_locations(name, address, city, state), fleet_jobs(id, job_number)";
  const openStatuses = ["draft", "pending_review", "scheduled", "assigned", "en_route", "arrived", "in_progress"];
  const [scheduled, unscheduled, scheduledCount, unscheduledCount, exceptionsCount] = await Promise.all([
    db.from("fleet_work_orders").select(fleetSchedulerSelect).eq("user_id", userId).gte("scheduled_date", startDate).lte("scheduled_date", endDate).in("status", openStatuses).order("scheduled_date").order("scheduled_time").limit(500),
    db.from("fleet_work_orders").select(fleetSchedulerSelect).eq("user_id", userId).is("scheduled_date", null).in("status", openStatuses).order("created_at", { ascending: false }).limit(100),
    db.from("fleet_work_orders").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("scheduled_date", startDate).lte("scheduled_date", endDate).in("status", openStatuses),
    db.from("fleet_work_orders").select("id", { count: "exact", head: true }).eq("user_id", userId).is("scheduled_date", null).in("status", openStatuses),
    db.from("fleet_work_orders").select("id", { count: "exact", head: true }).eq("user_id", userId).or("priority.eq.urgent,status.eq.pending_review").in("status", openStatuses),
  ]);
  if (scheduled.error) throw scheduled.error;
  if (unscheduled.error) throw unscheduled.error;
  return json({
    data: {
      scheduled: scheduled.data ?? [],
      unscheduled: unscheduled.data ?? [],
      counts: { scheduled: scheduledCount.count ?? 0, unscheduled: unscheduledCount.count ?? 0, exceptions: exceptionsCount.count ?? 0 },
    },
  });
});

vehiclesRouter.get("/v1/fleet/vans-overview", async (c) => {
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;

  const [vansRes, territoriesRes, inventoryRes, techRes] = await Promise.all([
    db.from("vans").select("*").eq("user_id", user.id).order("name"),
    db.from("van_territories").select("van_id"),
    db.from("van_inventory").select("van_id"),
    db.from("technicians").select("id, name").eq("user_id", user.id).eq("is_active", true).order("name"),
  ]);

  const technicians = (techRes.data as Array<{ id: string; name: string }> | null) ?? [];
  const vansRaw = (vansRes.data ?? []) as Array<Record<string, any>>;

  const techMap = new Map<string, string>();
  technicians.forEach((t) => techMap.set(t.id, t.name));

  const territoryMap = new Map<string, number>();
  ((territoriesRes.data ?? []) as Array<{ van_id: string }>).forEach((t) => {
    const key = String(t.van_id);
    territoryMap.set(key, (territoryMap.get(key) || 0) + 1);
  });

  const inventoryMap = new Map<string, number>();
  ((inventoryRes.data ?? []) as Array<{ van_id: string }>).forEach((i) => {
    const key = String(i.van_id);
    inventoryMap.set(key, (inventoryMap.get(key) || 0) + 1);
  });

  const vans = vansRaw.map((v) => {
    const id = String(v.id);
    return {
      id,
      name: v.name,
      vin: v.vin ?? null,
      license_plate: v.license_plate ?? null,
      make: v.make ?? null,
      model: v.model ?? null,
      year: v.year ?? null,
      status: v.status,
      is_active: v.is_active,
      assigned_technician_id: v.assigned_technician_id ?? null,
      technician_name: v.assigned_technician_id ? techMap.get(v.assigned_technician_id) ?? null : null,
      territory_count: territoryMap.get(id) || 0,
      inventory_count: inventoryMap.get(id) || 0,
    };
  });

  return json({ data: { vans, technicians } });
});

vehiclesRouter.get("/v1/fleet/clients", async (c) => {
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("fleet_clients")
    .select("id, company_name, status, phone, billing_email, payment_terms, fleet_vehicles(id), fleet_work_orders(id)")
    .eq("user_id", user.id)
    .order("company_name");
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.get("/v1/fleet/vehicles-list", async (c) => {
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("fleet_vehicles")
    .select(
      "id, year, make, model, unit_number, vin, license_plate, mileage, status, fleet_client_id, fleet_location_id, fleet_contract_id, created_at, fleet_clients(company_name), fleet_locations(name), fleet_contracts(name)"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.get("/v1/fleet/vehicles/page", async (c) => {
  const url = new URL(c.req.url);
  const q = url.searchParams;
  const { supabase, user } = await requireFleetScope(c, q.get("selected_workspace_id"));
  const db = supabase as any;
  const userId = user.id;

  const page = Math.max(1, Number(q.get("page") ?? 1) || 1);
  const pageSize = Math.max(1, Math.min(200, Number(q.get("page_size") ?? 50) || 50));
  const select =
    "id, year, make, model, unit_number, vin, license_plate, mileage, status, fleet_client_id, fleet_location_id, fleet_contract_id, created_at, fleet_clients(company_name), fleet_locations(name), fleet_contracts(name)";
  let query = db.from("fleet_vehicles").select(select, { count: "exact" }).eq("user_id", userId);
  const search = q.get("search");
  if (search?.trim()) {
    const value = search.trim().replace(/[,%()]/g, "");
    query = query.or(`vin.ilike.%${value}%,unit_number.ilike.%${value}%,license_plate.ilike.%${value}%,make.ilike.%${value}%,model.ilike.%${value}%`);
  }
  const clientId = q.get("client_id");
  if (clientId) query = query.eq("fleet_client_id", clientId);
  const status = q.get("status");
  if (status) query = query.eq("status", status);
  const locationId = q.get("location_id");
  if (locationId) query = query.eq("fleet_location_id", locationId);
  const contractId = q.get("contract_id");
  if (contractId) query = query.eq("fleet_contract_id", contractId);
  const dataFilter = q.get("data_filter");
  if (dataFilter === "missing_vin") query = query.is("vin", null);
  if (dataFilter === "missing_location") query = query.is("fleet_location_id", null);
  if (dataFilter === "missing_contract") query = query.is("fleet_contract_id", null);
  const sortMap = {
    recent: ["created_at", false],
    client: ["fleet_client_id", true],
    unit: ["unit_number", true],
    year_desc: ["year", false],
    mileage_desc: ["mileage", false],
  } as const;
  const [sortColumn, ascending] = sortMap[(q.get("sort") as keyof typeof sortMap) ?? "recent"] ?? sortMap.recent;
  query = query.order(sortColumn, { ascending }).range((page - 1) * pageSize, page * pageSize - 1);

  const [pageRes, total, active, maintenance, incomplete] = await Promise.all([
    query,
    db.from("fleet_vehicles").select("id", { count: "exact", head: true }).eq("user_id", userId),
    db.from("fleet_vehicles").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "active"),
    db.from("fleet_vehicles").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "maintenance"),
    db.from("fleet_vehicles").select("id", { count: "exact", head: true }).eq("user_id", userId).or("vin.is.null,mileage.is.null,fleet_location_id.is.null,fleet_contract_id.is.null"),
  ]);
  if (pageRes.error) throw pageRes.error;
  return json({
    data: {
      rows: pageRes.data ?? [],
      total: pageRes.count ?? 0,
      aggregates: {
        total: total.count ?? 0,
        active: active.count ?? 0,
        maintenance: maintenance.count ?? 0,
        incomplete: incomplete.count ?? 0,
      },
    },
  });
});

vehiclesRouter.get("/v1/fleet/vehicle-form-options", async (c) => {
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;

  const [clientsRes, locationsRes, contractsRes, serviceProfilesRes] = await Promise.all([
    db.from("fleet_clients").select("id, company_name").eq("user_id", user.id).eq("status", "active").order("company_name"),
    db.from("fleet_locations").select("id, name, city, state, fleet_client_id").eq("user_id", user.id).order("name"),
    db.from("fleet_contracts").select("id, name, fleet_client_id").eq("user_id", user.id).eq("is_active", true),
    db.from("fleet_service_rules").select("id, service_class, fleet_client_id").eq("user_id", user.id).eq("is_active", true),
  ]);

  const mapId = (r: any) => ({ ...r, id: String(r.id) });
  return json({
    data: {
      clients: ((clientsRes.data as Array<any> | null) ?? []).map((r) => ({ id: String(r.id), company_name: r.company_name })),
      locations: ((locationsRes.data as Array<any> | null) ?? []).map((r) => ({
        id: String(r.id),
        name: r.name,
        city: r.city ?? null,
        state: r.state ?? null,
        fleet_client_id: r.fleet_client_id ?? null,
      })),
      contracts: ((contractsRes.data as Array<any> | null) ?? []).map((r) => ({
        id: String(r.id),
        name: r.name,
        fleet_client_id: r.fleet_client_id ?? null,
      })),
      serviceProfiles: ((serviceProfilesRes.data as Array<any> | null) ?? []).map((r) => ({
        id: String(r.id),
        service_class: r.service_class,
        fleet_client_id: r.fleet_client_id ?? null,
      })),
    },
  });
});

vehiclesRouter.get("/v1/fleet/locations", async (c) => {
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("fleet_locations")
    .select(
      `id, fleet_client_id, name, address, city, state, postal_code, is_primary, service_window_start, service_window_end, site_contact_name, site_contact_phone, access_instructions, fleet_clients ( company_name )`
    )
    .eq("user_id", user.id)
    .order("name", { ascending: true });
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.get("/v1/fleet/purchase-orders", async (c) => {
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("fleet_purchase_orders")
    .select(
      `id, po_number, description, amount_limit, amount_used, status, issued_date, expiry_date, fleet_clients ( company_name )`
    )
    .eq("user_id", user.id)
    .order("issued_date", { ascending: false });
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.get("/v1/fleet/contacts", async (c) => {
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("fleet_contacts")
    .select(
      `id, name, role, email, phone, is_primary, can_approve_work, receives_invoices, receives_reports, fleet_clients ( company_name )`
    )
    .eq("user_id", user.id)
    .order("name", { ascending: true });
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.get("/v1/fleet/work-order-invoices", async (c) => {
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("fleet_work_orders")
    .select(
      `id, order_number, po_number, status, invoice_status, total, completed_at, fleet_clients ( company_name ), fleet_vehicles ( year, make, model, unit_number )`
    )
    .eq("user_id", user.id)
    .in("status", ["completed", "invoiced", "paid"])
    .order("completed_at", { ascending: false });
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.get("/v1/fleet/reports-overview", async (c) => {
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;
  const userId = user.id;

  const [vehicles, locations, workOrders, purchaseOrders] = await Promise.all([
    db.from("fleet_vehicles").select("id").eq("user_id", userId),
    db.from("fleet_locations").select("id").eq("user_id", userId).eq("is_primary", true),
    db.from("fleet_work_orders").select("id, status, completed_at, total, fleet_vehicle_id").eq("user_id", userId),
    db.from("fleet_purchase_orders").select("id, status").eq("user_id", userId),
  ]);

  if (vehicles.error) throw vehicles.error;
  if (locations.error) throw locations.error;
  if (workOrders.error) throw workOrders.error;
  if (purchaseOrders.error) throw purchaseOrders.error;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const woData = (workOrders.data ?? []) as Array<{
    id: string;
    status: string | null;
    completed_at: string | null;
    total: number | null;
    fleet_vehicle_id: string | null;
  }>;

  const totalsByVehicle = new Map<string, { total: number; label: string }>();
  for (const wo of woData) {
    if (!wo.fleet_vehicle_id || !wo.total) continue;
    const existing = totalsByVehicle.get(wo.fleet_vehicle_id) ?? { total: 0, label: wo.fleet_vehicle_id };
    existing.total += wo.total;
    totalsByVehicle.set(wo.fleet_vehicle_id, existing);
  }

  const topVehicles = Array.from(totalsByVehicle.entries())
    .map(([vehicleId, { total, label }]) => ({ vehicleId, label, totalSpend: total }))
    .sort((a, b) => b.totalSpend - a.totalSpend)
    .slice(0, 10);

  return json({
    data: {
      stats: {
        totalVehicles: (vehicles.data ?? []).length,
        activeLocations: (locations.data ?? []).length,
        openWorkOrders: woData.filter((wo) => wo.status !== "completed" && wo.status !== "cancelled").length,
        completedThisMonth: woData.filter((wo) => {
          if (!wo.completed_at) return false;
          const completed = new Date(wo.completed_at);
          return completed >= startOfMonth && completed <= now;
        }).length,
        purchaseOrdersOpen: (purchaseOrders.data ?? []).filter((po: any) => po.status === "open").length,
      },
      topVehicles,
    },
  });
});

vehiclesRouter.get("/v1/fleet/today-work-orders", async (c) => {
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;
  const userId = user.id;

  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
  const todayStr = today.toISOString().split("T")[0];

  const [workOrders, checkins] = await Promise.all([
    db
      .from("fleet_work_orders")
      .select(
        `id, order_number, status, scheduled_date, scheduled_time, scheduled_duration_minutes, fleet_vehicles ( id, unit_number, make, model, year ), fleet_clients ( company_name )`
      )
      .eq("user_id", userId)
      .in("status", ["scheduled", "in_progress"])
      .eq("scheduled_date", todayStr)
      .order("scheduled_time", { ascending: true }),
    db
      .from("fleet_checkins")
      .select("id, created_at, type, notes, latitude, longitude, accuracy, fleet_work_order_id")
      .eq("user_id", userId)
      .gte("created_at", startOfDay)
      .lt("created_at", endOfDay),
  ]);

  if (workOrders.error) throw workOrders.error;
  if (checkins.error) throw checkins.error;

  const checkinsByWorkOrderId: Record<string, unknown[]> = {};
  for (const ci of (checkins.data ?? []) as Array<{ fleet_work_order_id: string | null }>) {
    const key = ci.fleet_work_order_id ?? "";
    if (!key) continue;
    if (!checkinsByWorkOrderId[key]) checkinsByWorkOrderId[key] = [];
    checkinsByWorkOrderId[key].push(ci);
  }

  return json({ data: { workOrders: workOrders.data ?? [], checkinsByWorkOrderId } });
});

vehiclesRouter.get("/v1/fleet/work-order-create-options", async (c) => {
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;

  const { data: workspaceOwner, error: workspaceError } = await db.rpc("current_workspace_owner_user_id");
  if (workspaceError || !workspaceOwner) throw workspaceError ?? new Error("No active Fleet workspace.");
  const ownerId = String(workspaceOwner);

  const [clientsRes, vehiclesRes, contractsRes, locationsRes, posRes, serviceRulesRes, contractServicesRes] =
    await Promise.all([
      db.from("fleet_clients").select("id, company_name, status").eq("user_id", ownerId).eq("status", "active").order("company_name"),
      db.from("fleet_vehicles").select("id, fleet_client_id, fleet_location_id, fleet_contract_id, year, make, model, unit_number, vin, mileage, license_plate, notes, status").eq("user_id", ownerId).eq("status", "active").order("make"),
      db.from("fleet_contracts").select("id, fleet_client_id, name, sla_hours, approval_threshold, pricing_rules, is_active, start_date, end_date").eq("user_id", ownerId).eq("is_active", true),
      db.from("fleet_locations").select("id, fleet_client_id, name, address, city, state, service_window_start, service_window_end").eq("user_id", ownerId),
      db.from("fleet_purchase_orders").select("id, fleet_client_id, po_number, amount_limit, amount_authorized, amount_consumed, amount_used, status").eq("user_id", ownerId).in("status", ["open", "partially_used"]),
      db.from("fleet_service_rules").select("id, fleet_client_id, service_class, base_labor_package, interval_miles, interval_months, base_price, package_code, package_label, estimated_duration_minutes, includes").eq("user_id", ownerId).eq("is_active", true),
      db.from("fleet_contract_services").select("id, fleet_contract_id, service_catalog_id, custom_price, custom_label, is_active, service_catalog(name, default_price)").eq("user_id", ownerId).eq("is_active", true),
    ]);

  return json({
    data: {
      clients: ((clientsRes.data as Array<any> | null) ?? []).map((r) => ({ id: String(r.id), company_name: r.company_name })),
      vehicles: ((vehiclesRes.data as Array<any> | null) ?? []).map((v) => ({
        id: String(v.id),
        fleet_client_id: v.fleet_client_id ?? null,
        fleet_location_id: v.fleet_location_id ?? null,
        fleet_contract_id: v.fleet_contract_id ?? null,
        year: v.year ?? null,
        make: v.make ?? null,
        model: v.model ?? null,
        unit_number: v.unit_number ?? null,
        vin: v.vin ?? null,
        mileage: v.mileage ?? null,
        license_plate: v.license_plate ?? null,
        notes: v.notes ?? null,
      })),
      contracts: ((contractsRes.data as Array<any> | null) ?? []).map((r) => ({
        id: String(r.id),
        fleet_client_id: r.fleet_client_id ?? null,
        name: r.name ?? null,
        sla_hours: r.sla_hours ?? null,
        approval_threshold: r.approval_threshold ?? null,
        pricing_rules: r.pricing_rules,
        is_active: r.is_active ?? null,
        start_date: r.start_date ?? null,
        end_date: r.end_date ?? null,
      })),
      locations: ((locationsRes.data as Array<any> | null) ?? []).map((l) => ({
        id: String(l.id),
        fleet_client_id: l.fleet_client_id ?? null,
        name: l.name ?? null,
        address: l.address ?? null,
        city: l.city ?? null,
        state: l.state ?? null,
        service_window_start: l.service_window_start ?? null,
        service_window_end: l.service_window_end ?? null,
      })),
      purchaseOrders: ((posRes.data as Array<any> | null) ?? []).map((p) => ({
        id: String(p.id),
        fleet_client_id: p.fleet_client_id ?? null,
        po_number: p.po_number ?? null,
        amount_limit: p.amount_limit ?? null,
        amount_authorized: p.amount_authorized ?? null,
        amount_consumed: p.amount_consumed ?? null,
        amount_used: p.amount_used ?? null,
        status: p.status ?? null,
      })),
      serviceProfiles: ((serviceRulesRes.data as Array<any> | null) ?? []).map((rule) => ({
        id: String(rule.id),
        fleet_client_id: rule.fleet_client_id ?? null,
        service_class: rule.service_class,
        base_labor_package: rule.base_labor_package,
        interval_miles: rule.interval_miles,
        interval_months: rule.interval_months,
        base_price: rule.base_price,
        package_code: rule.package_code ?? null,
        package_label: rule.package_label ?? null,
        estimated_duration_minutes: rule.estimated_duration_minutes ?? null,
        includes: Array.isArray(rule.includes) ? rule.includes : [],
      })),
      contractServices: ((contractServicesRes.data as Array<{
        id: string;
        fleet_contract_id: string;
        service_catalog_id: string | null;
        custom_price: number | null;
        custom_label: string | null;
        is_active: boolean;
        service_catalog: { name: string | null; default_price: number | null } | null;
      }> | null) ?? []).map((r) => ({
        id: String(r.id),
        fleet_contract_id: String(r.fleet_contract_id),
        service_catalog_id: r.service_catalog_id ?? null,
        custom_price: r.custom_price ?? null,
        custom_label: r.custom_label ?? null,
        is_active: r.is_active !== false,
        catalog_name: r.service_catalog?.name ?? null,
        catalog_default_price: r.service_catalog?.default_price ?? null,
      })),
    },
  });
});

vehiclesRouter.get("/v1/fleet/vehicle-eligibility", async (c) => {
  const url = new URL(c.req.url);
  const { supabase, user } = await requireFleetScope(c, url.searchParams.get("selected_workspace_id"));
  const { data, error } = await (supabase as any)
    .from("fleet_service_schedules")
    .select("fleet_vehicle_id, service_class, status, due_date, due_mileage, base_labor_package, estimated_price, rule_id")
    .eq("user_id", user.id)
    .eq("fleet_client_id", url.searchParams.get("fleet_client_id"));
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.get("/v1/fleet/work-orders/:id/detail", async (c) => {
  const workOrderId = c.req.param("id");
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;

  const [orderRes, lineItemsRes, logsRes, approvalsRes] = await Promise.all([
    db
      .from("fleet_work_orders")
      .select(
        "*, fleet_vehicles(id, year, make, model, unit_number, vin, mileage, license_plate), fleet_clients(id, company_name), fleet_contracts(id, name, sla_hours, approval_threshold, pricing_rules), fleet_locations(id, name, address, city, state), technicians!fleet_work_orders_assigned_technician_id_fkey(id, name, status, last_location_update)"
      )
      .eq("id", workOrderId)
      .eq("user_id", user.id)
      .single(),
    db.from("fleet_work_order_line_items").select("*").eq("fleet_work_order_id", workOrderId).eq("user_id", user.id).order("sort_order"),
    db.from("fleet_activity_logs").select("*").eq("fleet_work_order_id", workOrderId).order("created_at", { ascending: false }),
    db.from("fleet_approvals").select("*").eq("fleet_work_order_id", workOrderId).order("created_at", { ascending: false }),
  ]);

  return json({
    data: {
      order: orderRes.data ?? null,
      lineItems: lineItemsRes.data ?? [],
      activityLogs: logsRes.data ?? [],
      approvals: approvalsRes.data ?? [],
    },
  });
});

vehiclesRouter.get("/v1/fleet/assignable-technicians", async (c) => {
  const { supabase } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("technicians")
    .select("id,name")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.get("/v1/fleet/domain-separation-health", async (c) => {
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;
  const userId = user.id;
  const schedulerStatuses = ["scheduled", "assigned", "in_progress"];

  const [visibleRes, missingScheduleRes, legacyAppointmentsRes] = await Promise.all([
    db.from("fleet_work_orders").select("id", { count: "exact", head: true }).eq("user_id", userId).in("status", schedulerStatuses).not("scheduled_date", "is", null),
    db.from("fleet_work_orders").select("id", { count: "exact", head: true }).eq("user_id", userId).in("status", schedulerStatuses).is("scheduled_date", null),
    db.from("appointments").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("source", "fleet_work_order"),
  ]);

  return json({
    data: {
      fleetSchedulerVisibleCount: visibleRes.count ?? 0,
      fleetMissingScheduleCount: missingScheduleRes.count ?? 0,
      legacyFleetAppointmentCount: legacyAppointmentsRes.count ?? 0,
    },
  });
});

vehiclesRouter.get("/v1/fleet/ops-events", async (c) => {
  const url = new URL(c.req.url);
  const q = url.searchParams;
  const { supabase } = await requireFleetScope(c, q.get("selected_workspace_id"));
  let query = (supabase as any)
    .from("fleet_ops_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(Number(q.get("limit") ?? 50) || 50);
  const fleetClientId = q.get("fleet_client_id");
  if (fleetClientId) query = query.eq("fleet_client_id", fleetClientId);
  const vehicleId = q.get("vehicle_id");
  if (vehicleId) query = query.eq("fleet_vehicle_id", vehicleId);
  const workOrderId = q.get("work_order_id");
  if (workOrderId) query = query.eq("fleet_work_order_id", workOrderId);
  const { data } = await query;
  return json({ data: data ?? [] });
});

vehiclesRouter.get("/v1/fleet/work-orders", async (c) => {
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const { data, error } = await (supabase as any)
    .from("fleet_work_orders")
    .select(
      "*, fleet_vehicles(year, make, model, unit_number), fleet_clients(company_name), fleet_locations(name, address, city, state), fleet_jobs(id, job_number)"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return json({ data: data ?? [] });
});

vehiclesRouter.get("/v1/fleet/work-order-create-technicians", async (c) => {
  const { supabase, user } = await requireFleetScope(c, selectedWorkspaceHint(c));
  const db = supabase as any;
  const { data: ownerId } = await db.rpc("current_workspace_owner_user_id");
  const { data, error } = await db
    .from("technicians")
    .select("id, name")
    .eq("user_id", String(ownerId || user.id))
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return json({ data: data ?? [] });
});
