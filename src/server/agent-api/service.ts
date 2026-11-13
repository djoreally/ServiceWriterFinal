/**
 * Agent API service layer.
 *
 * One implementation behind BOTH agent surfaces — the REST endpoints
 * (`/api/v1/agent/*`) and the MCP tools (`/api/mcp`) — so the two can
 * never diverge. Every function takes the key context resolved by the
 * auth layer and queries ONLY that context's workspace: the workspace id
 * is never accepted from caller input (callers may send one, but it is
 * checked against the key and rejected on mismatch by the route layer).
 *
 * `db` is the server-side admin Supabase client. Authorization lives
 * here, at the server boundary: key scope + workspace binding, per the
 * repo's engineering contract.
 */
import { ApiError } from "@/server/api";
import { bookAppointmentCore, configuredHours } from "@/server/appointments/book-appointment";
import { checkSlotAvailability, listOpenSlots, loadWorkspaceScheduling } from "./availability";
import { recordKeyUsage, requireScope, type AgentKeyContext } from "./keys";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function page(input: { limit?: number; offset?: number }) {
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(input.limit ?? DEFAULT_LIMIT)));
  const offset = Math.max(0, Math.floor(input.offset ?? 0));
  return { limit, offset };
}

function cleanSearch(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[%_,()]/g, " ").trim();
  return cleaned.length > 0 ? cleaned : null;
}

// ---------------------------------------------------------------------------
// Catalog + rules
// ---------------------------------------------------------------------------

export async function getCatalog(db: any, ctx: AgentKeyContext) {
  requireScope(ctx, "catalog:read");
  const { data, error } = await db
    .from("service_catalog")
    .select("id,name,description,category,labor_price,estimated_minutes,is_active,metadata")
    .eq("workspace_id", ctx.workspaceId)
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return { services: data ?? [] };
}

export async function getBookingRules(db: any, ctx: AgentKeyContext) {
  requireScope(ctx, "catalog:read");
  const [{ timezone, settings }, { data: blackouts, error: be }] = await Promise.all([
    loadWorkspaceScheduling(db, ctx.workspaceId),
    db
      .from("workspace_blackout_dates")
      .select("blocked_date,reason")
      .eq("workspace_id", ctx.workspaceId)
      .gte("blocked_date", new Date().toISOString().slice(0, 10))
      .order("blocked_date")
      .limit(100),
  ]);
  if (be) throw be;
  return {
    timezone,
    // The workspace's own configured rules — whatever this shop set,
    // never platform-wide or per-shop constants baked into code.
    rules: {
      day_hours: settings.day_hours ?? null,
      opening_time: settings.opening_time ?? null,
      closing_time: settings.closing_time ?? null,
      working_days: settings.working_days ?? null,
      buffer_time_before: settings.buffer_time_before ?? null,
      buffer_time_after: settings.buffer_time_after ?? null,
      min_lead_time_hours: settings.min_lead_time_hours ?? null,
      max_advance_days: settings.max_advance_days ?? null,
      slot_duration_minutes: settings.slot_duration_minutes ?? null,
      allow_multi_day_bookings: settings.allow_multi_day_bookings ?? null,
      require_approval: settings.require_approval ?? null,
      tax_rate: settings.tax_rate ?? null,
      service_radius_miles: settings.service_radius_miles ?? null,
    },
    blackout_dates: blackouts ?? [],
  };
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

export async function checkAvailability(
  db: any,
  ctx: AgentKeyContext,
  input: {
    starts_at?: string;
    date?: string;
    service_catalog_id?: string;
    duration_minutes?: number;
    service_lat?: number | null;
    service_lng?: number | null;
  },
) {
  requireScope(ctx, "availability:read");
  let duration = input.duration_minutes;
  if (input.service_catalog_id) {
    const { data: service, error } = await db
      .from("service_catalog")
      .select("id,estimated_minutes,is_active")
      .eq("workspace_id", ctx.workspaceId)
      .eq("id", input.service_catalog_id)
      .maybeSingle();
    if (error) throw error;
    if (!service || service.is_active === false) {
      throw new ApiError(400, "The selected service is not active in this workspace.", "invalid_service");
    }
    if (!duration) duration = Number(service.estimated_minutes) || 60;
  }
  if (!duration || duration <= 0) duration = 60;

  if (input.starts_at) {
    const endsAt = new Date(Date.parse(input.starts_at) + duration * 60_000).toISOString();
    const result = await checkSlotAvailability(db, ctx.workspaceId, {
      startsAt: input.starts_at,
      endsAt,
      serviceLat: input.service_lat,
      serviceLng: input.service_lng,
    });
    return { ...result, starts_at: input.starts_at, ends_at: endsAt, duration_minutes: duration };
  }
  if (input.date) {
    const day = await listOpenSlots(db, ctx.workspaceId, {
      date: input.date,
      durationMinutes: duration,
      serviceLat: input.service_lat,
      serviceLng: input.service_lng,
    });
    return { ...day, duration_minutes: duration, open_slot_count: day.slots.length };
  }
  throw new ApiError(400, "Provide starts_at (single slot check) or date (open slots for a day).", "invalid_input");
}

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

export async function listAppointments(
  db: any,
  ctx: AgentKeyContext,
  input: { from?: string; to?: string; status?: string; limit?: number; offset?: number },
) {
  requireScope(ctx, "bookings:read");
  const { limit, offset } = page(input);
  let query = db
    .from("appointments")
    .select("*")
    .eq("workspace_id", ctx.workspaceId)
    .order("starts_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (input.from) query = query.gte("starts_at", input.from);
  if (input.to) query = query.lte("starts_at", input.to);
  if (input.status) query = query.eq("status", input.status);
  const { data, error } = await query;
  if (error) throw error;
  return { appointments: data ?? [], pagination: { limit, offset } };
}

export async function getAppointment(db: any, ctx: AgentKeyContext, id: string) {
  requireScope(ctx, "bookings:read");
  const { data: appointment, error } = await db
    .from("appointments")
    .select("*")
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!appointment) throw new ApiError(404, "Appointment not found in this workspace.", "not_found");
  const [{ data: customer }, { data: vehicle }, { data: location }] = await Promise.all([
    appointment.customer_id
      ? db.from("customers").select("*").eq("workspace_id", ctx.workspaceId).eq("id", appointment.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    appointment.vehicle_id
      ? db.from("vehicles").select("*").eq("workspace_id", ctx.workspaceId).eq("id", appointment.vehicle_id).maybeSingle()
      : Promise.resolve({ data: null }),
    appointment.location_id
      ? db.from("locations").select("*").eq("workspace_id", ctx.workspaceId).eq("id", appointment.location_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return { appointment, customer: customer ?? null, vehicle: vehicle ?? null, location: location ?? null };
}

// ---------------------------------------------------------------------------
// Customers + vehicles
// ---------------------------------------------------------------------------

export async function listCustomers(
  db: any,
  ctx: AgentKeyContext,
  input: { search?: string; limit?: number; offset?: number },
) {
  requireScope(ctx, "customers:read");
  const { limit, offset } = page(input);
  let query = db
    .from("customers")
    .select("*")
    .eq("workspace_id", ctx.workspaceId)
    .neq("status", "archived")
    .order("last_name")
    .order("first_name")
    .range(offset, offset + limit - 1);
  const search = cleanSearch(input.search);
  if (search) {
    query = query.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`,
    );
  }
  const { data, error } = await query;
  if (error) throw error;
  return { customers: data ?? [], pagination: { limit, offset } };
}

export async function getCustomerHistory(db: any, ctx: AgentKeyContext, id: string) {
  requireScope(ctx, "customers:read");
  const { data: customer, error } = await db
    .from("customers")
    .select("*")
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!customer) throw new ApiError(404, "Customer not found in this workspace.", "not_found");
  const [{ data: vehicles }, { data: appointments }, { data: invoices }] = await Promise.all([
    db.from("vehicles").select("*").eq("workspace_id", ctx.workspaceId).eq("customer_id", id).order("created_at", { ascending: false }),
    db
      .from("appointments")
      .select("*")
      .eq("workspace_id", ctx.workspaceId)
      .eq("customer_id", id)
      .order("starts_at", { ascending: false })
      .limit(25),
    db
      .from("invoices")
      .select("*")
      .eq("workspace_id", ctx.workspaceId)
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .limit(25),
  ]);
  return {
    customer,
    vehicles: vehicles ?? [],
    recent_appointments: appointments ?? [],
    recent_invoices: invoices ?? [],
  };
}

export async function createCustomer(
  db: any,
  ctx: AgentKeyContext,
  input: {
    first_name: string;
    last_name?: string;
    company_name?: string;
    email?: string;
    phone?: string;
    address_line1?: string;
    address_line2?: string;
    city?: string;
    region?: string;
    postal_code?: string;
    notes?: string;
  },
) {
  requireScope(ctx, "customers:create");
  const { data, error } = await db
    .from("customers")
    .insert({
      workspace_id: ctx.workspaceId,
      first_name: input.first_name,
      last_name: input.last_name ?? "",
      company_name: input.company_name ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      address_line1: input.address_line1 ?? null,
      address_line2: input.address_line2 ?? null,
      city: input.city ?? null,
      region: input.region ?? null,
      postal_code: input.postal_code ?? null,
      notes: input.notes ?? null,
      metadata: { created_via: "agent_api", integrator: ctx.integrator, api_key_id: ctx.keyId },
    })
    .select()
    .single();
  if (error) throw error;
  await recordKeyUsage(db, ctx, "customer.create", "customer", (data as { id: string }).id);
  return { customer: data };
}

export async function listVehicles(
  db: any,
  ctx: AgentKeyContext,
  input: { search?: string; limit?: number; offset?: number },
) {
  requireScope(ctx, "vehicles:read");
  const { limit, offset } = page(input);
  let query = db
    .from("vehicles")
    .select("*")
    .eq("workspace_id", ctx.workspaceId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  const search = cleanSearch(input.search);
  if (search) {
    query = query.or(`make.ilike.%${search}%,model.ilike.%${search}%,vin.ilike.%${search}%,license_plate.ilike.%${search}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return { vehicles: data ?? [], pagination: { limit, offset } };
}

export async function listLocations(db: any, ctx: AgentKeyContext) {
  requireScope(ctx, "locations:read");
  const { data, error } = await db
    .from("locations")
    .select("*")
    .eq("workspace_id", ctx.workspaceId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return { locations: data ?? [] };
}

// ---------------------------------------------------------------------------
// Invoices, promotions, reports
// ---------------------------------------------------------------------------

export async function listInvoices(
  db: any,
  ctx: AgentKeyContext,
  input: { status?: string; limit?: number; offset?: number },
) {
  requireScope(ctx, "invoices:read");
  const { limit, offset } = page(input);
  let query = db
    .from("invoices")
    .select("*")
    .eq("workspace_id", ctx.workspaceId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (input.status) query = query.eq("status", input.status);
  const { data, error } = await query;
  if (error) throw error;
  return { invoices: data ?? [], pagination: { limit, offset } };
}

export async function listPromotions(db: any, ctx: AgentKeyContext) {
  requireScope(ctx, "promotions:read");
  const { data, error } = await db
    .from("crm_campaigns")
    .select("*")
    .eq("workspace_id", ctx.workspaceId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return { promotions: data ?? [] };
}

export async function getRevenueSummary(
  db: any,
  ctx: AgentKeyContext,
  input: { from: string; to: string },
) {
  requireScope(ctx, "reports:read");
  const { data, error } = await db
    .from("invoices")
    .select("id,total,amount_paid,status,created_at")
    .eq("workspace_id", ctx.workspaceId)
    .gte("created_at", input.from)
    .lte("created_at", input.to)
    .limit(5000);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ total: number; amount_paid: number; created_at: string }>;
  const byDay = new Map<string, { billed: number; collected: number }>();
  let billed = 0;
  let collected = 0;
  for (const row of rows) {
    const day = String(row.created_at).slice(0, 10);
    const entry = byDay.get(day) ?? { billed: 0, collected: 0 };
    entry.billed += Number(row.total) || 0;
    entry.collected += Number(row.amount_paid) || 0;
    byDay.set(day, entry);
    billed += Number(row.total) || 0;
    collected += Number(row.amount_paid) || 0;
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    from: input.from,
    to: input.to,
    invoice_count: rows.length,
    billed: round(billed),
    collected: round(collected),
    by_day: [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, billed: round(v.billed), collected: round(v.collected) })),
  };
}

export async function getBookingPerformance(
  db: any,
  ctx: AgentKeyContext,
  input: { from: string; to: string },
) {
  requireScope(ctx, "reports:read");
  const fromMs = Date.parse(input.from);
  const toMs = Date.parse(input.to);
  const span = Math.max(1, toMs - fromMs);
  const prevFrom = new Date(fromMs - span).toISOString();
  const countIn = async (gte: string, lt: string) => {
    const { data, error } = await db
      .from("appointments")
      .select("id,metadata")
      .eq("workspace_id", ctx.workspaceId)
      .gte("starts_at", gte)
      .lt("starts_at", lt)
      .not("status", "in", '("cancelled","no_show")')
      .limit(5000);
    if (error) throw error;
    const rows = (data ?? []) as Array<{ metadata?: { estimated_cost?: number } }>;
    const value = rows.reduce((sum, r) => sum + (Number(r.metadata?.estimated_cost) || 0), 0);
    return { count: rows.length, value: Math.round(value * 100) / 100 };
  };
  const [current, previous] = await Promise.all([
    countIn(input.from, input.to),
    countIn(prevFrom, input.from),
  ]);
  return { from: input.from, to: input.to, current, previous_window: { from: prevFrom, to: input.from, ...previous } };
}

export async function getCapacity(
  db: any,
  ctx: AgentKeyContext,
  input: { from: string; to: string },
) {
  requireScope(ctx, "availability:read");
  const { timezone, settings } = await loadWorkspaceScheduling(db, ctx.workspaceId);
  const days: Array<{ date: string; open: boolean; open_minutes: number; booked_minutes: number; open_capacity_minutes: number }> = [];
  const startMs = Date.parse(`${input.from}T00:00:00Z`);
  const endMs = Date.parse(`${input.to}T00:00:00Z`);
  const totalDays = Math.min(62, Math.max(0, Math.round((endMs - startMs) / 86_400_000)));
  const { data: appointments, error } = await db
    .from("appointments")
    .select("starts_at,ends_at")
    .eq("workspace_id", ctx.workspaceId)
    .gte("starts_at", new Date(startMs - 86_400_000).toISOString())
    .lte("starts_at", new Date(endMs + 86_400_000).toISOString())
    .not("status", "in", '("cancelled","no_show")')
    .limit(5000);
  if (error) throw error;
  const rows = (appointments ?? []) as Array<{ starts_at: string; ends_at: string }>;

  for (let i = 0; i <= totalDays; i++) {
    const date = new Date(startMs + i * 86_400_000).toISOString().slice(0, 10);
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long" })
      .format(new Date(`${date}T12:00:00Z`))
      .toLowerCase();
    const hours = configuredHours(settings, weekday);
    const openMinutes = hours.isOpen ? Math.max(0, hours.close - hours.open) : 0;
    let booked = 0;
    for (const row of rows) {
      const s = new Date(row.starts_at);
      const localDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(s);
      if (localDate === date) {
        booked += Math.max(0, (Date.parse(row.ends_at) - Date.parse(row.starts_at)) / 60_000);
      }
    }
    days.push({
      date,
      open: hours.isOpen,
      open_minutes: openMinutes,
      booked_minutes: Math.round(booked),
      open_capacity_minutes: Math.max(0, openMinutes - Math.round(booked)),
    });
  }
  return { timezone, days };
}

// ---------------------------------------------------------------------------
// Booking create — through the canonical core, never a side path.
// ---------------------------------------------------------------------------

export interface CreateBookingInput {
  customer_id?: string;
  customer?: {
    first_name: string;
    last_name?: string;
    email?: string;
    phone?: string;
    company_name?: string;
  };
  vehicle_id?: string;
  vehicle?: {
    year?: number;
    make?: string;
    model?: string;
    vin?: string;
    license_plate?: string;
  };
  service_catalog_id?: string;
  starts_at: string;
  ends_at?: string;
  title?: string;
  notes?: string;
  location_address?: string;
  customer_city?: string;
  customer_state?: string;
  customer_postal_code?: string;
  service_lat?: number | null;
  service_lng?: number | null;
}

export async function createBooking(db: any, ctx: AgentKeyContext, input: CreateBookingInput) {
  requireScope(ctx, "bookings:create");

  // Resolve or create the customer inside the key's workspace only.
  let customerId = input.customer_id;
  if (!customerId) {
    if (!input.customer?.first_name) {
      throw new ApiError(400, "Provide customer_id or customer details to create the booking.", "invalid_input");
    }
    const created = await createCustomer(db, { ...ctx, scopes: [...ctx.scopes, "customers:create"] }, input.customer);
    customerId = (created.customer as { id: string }).id;
  }

  // Resolve or create the vehicle (must belong to the customer).
  let vehicleId = input.vehicle_id ?? null;
  if (!vehicleId && input.vehicle) {
    const { data, error } = await db
      .from("vehicles")
      .insert({
        workspace_id: ctx.workspaceId,
        customer_id: customerId,
        year: input.vehicle.year ?? null,
        make: input.vehicle.make ?? null,
        model: input.vehicle.model ?? null,
        vin: input.vehicle.vin ?? null,
        license_plate: input.vehicle.license_plate ?? null,
        metadata: { created_via: "agent_api", integrator: ctx.integrator, api_key_id: ctx.keyId },
      })
      .select("id")
      .single();
    if (error) throw error;
    vehicleId = (data as { id: string }).id;
  }

  // Service decides duration and price. Agent callers cannot set prices:
  // the catalog price is the price (the platform's price-lock rule).
  let service: { id: string; name: string; labor_price: number; estimated_minutes: number } | null = null;
  if (input.service_catalog_id) {
    const { data, error } = await db
      .from("service_catalog")
      .select("id,name,labor_price,estimated_minutes,is_active")
      .eq("workspace_id", ctx.workspaceId)
      .eq("id", input.service_catalog_id)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.is_active === false) {
      throw new ApiError(400, "The selected service is not active in this workspace.", "invalid_service");
    }
    service = data as typeof service;
  }

  const startsAt = input.starts_at;
  const endsAt =
    input.ends_at ??
    new Date(Date.parse(startsAt) + (service?.estimated_minutes || 60) * 60_000).toISOString();

  // Pre-check so the agent gets the rule verdict in the standard shape;
  // the core re-checks at write time regardless.
  const check = await checkSlotAvailability(db, ctx.workspaceId, {
    startsAt,
    endsAt,
    serviceLat: input.service_lat,
    serviceLng: input.service_lng,
  });
  if (!check.available) {
    throw new ApiError(
      409,
      `The requested time is not bookable: ${check.violations.join(", ")}`,
      check.violations[0] ?? "unavailable",
    );
  }

  const { settings } = await loadWorkspaceScheduling(db, ctx.workspaceId);
  const estimatedCost = service ? Number(service.labor_price) || 0 : null;
  const taxRate = Number(settings.tax_rate) || 0;
  const taxAmount = estimatedCost !== null ? Math.round(estimatedCost * (taxRate / 100) * 100) / 100 : null;

  const result = await bookAppointmentCore(
    db,
    {
      workspace_id: ctx.workspaceId,
      customer_id: customerId,
      vehicle_id: vehicleId,
      starts_at: startsAt,
      ends_at: endsAt,
      source: "agent_api",
      status: settings.require_approval ? "pending" : "confirmed",
      notes: input.notes ?? null,
      title: input.title ?? service?.name ?? undefined,
      service_catalog_id: service?.id ?? null,
      estimated_cost: estimatedCost,
      tax_amount: taxAmount,
      location_address: input.location_address ?? null,
      customer_city: input.customer_city ?? null,
      customer_state: input.customer_state ?? null,
      customer_postal_code: input.customer_postal_code ?? null,
      override_availability: false,
      lock_custom_price: false,
    },
    { createdBy: null },
  );

  if ("error" in result) {
    // The core returns the canonical error Response; translate it into
    // the ApiError shape the agent surfaces share.
    let code = "booking_failed";
    let message = "The booking could not be created.";
    try {
      const parsed = (await result.error.clone().json()) as { error?: { code?: string; message?: string } };
      if (parsed.error?.code) code = parsed.error.code;
      if (parsed.error?.message) message = parsed.error.message;
    } catch {
      /* keep defaults */
    }
    throw new ApiError(result.error.status || 400, message, code);
  }

  const appointment = result.data as { id: string; metadata?: Record<string, unknown> };

  // Integrator attribution, stamped on the record itself (the core's
  // metadata builder has no integrator field, so merge it in here).
  const mergedMetadata = {
    ...(appointment.metadata ?? {}),
    integrator: ctx.integrator,
    api_key_id: ctx.keyId,
    channel: "agent_api",
  };
  const { error: stampError } = await db
    .from("appointments")
    .update({ metadata: mergedMetadata })
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", appointment.id);
  if (stampError) throw stampError;

  await recordKeyUsage(db, ctx, "booking.create", "appointment", appointment.id);
  return { appointment: { ...appointment, metadata: mergedMetadata } };
}
