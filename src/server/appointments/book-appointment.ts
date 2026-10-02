/**
 * Shared booking core for appointments.
 *
 * This module is the ONE booking path for appointments. The Hono route
 * POST /v1/appointments and the Shop Agent (src/server/shop-agent/booking.ts)
 * both call `bookAppointmentCore` — there are no side paths.
 *
 * Extracted verbatim from the POST /v1/appointments handler in
 * src/server/hono/routes/appointments.ts. Logic is identical: reference
 * validation, business-hours / lead-time / blackout / conflict checks, then
 * the insert. The route keeps its own auth (requireWorkspaceAuth + role list);
 * the agent path runs with an admin client and ZeroPolicy as its authority
 * (documented in src/server/shop-agent/booking.ts).
 */
import { z } from "zod";
import { json } from "@/server/api";

// ---------------------------------------------------------------------------
// Input schema — identical to the former route-local appointmentSchema.
// ---------------------------------------------------------------------------

export const appointmentBookingSchema = z.object({
  workspace_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  vehicle_id: z.string().uuid().nullable().optional(),
  location_id: z.string().uuid().nullable().optional(),
  assigned_user_id: z.string().uuid().nullable().optional(),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  source: z.string().trim().max(40).default("staff"),
  status: z.string().trim().max(40).default("confirmed"),
  notes: z.string().max(5000).nullable().optional(),
  title: z.string().trim().max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  guest_name: z.string().max(200).nullable().optional(),
  guest_email: z.string().email().max(320).nullable().optional(),
  guest_phone: z.string().max(40).nullable().optional(),
  service_catalog_id: z.string().uuid().nullable().optional(),
  estimated_cost: z.number().nonnegative().nullable().optional(),
  tax_amount: z.number().nonnegative().nullable().optional(),
  location_address: z.string().max(500).nullable().optional(),
  customer_city: z.string().max(120).nullable().optional(),
  customer_state: z.string().max(120).nullable().optional(),
  customer_postal_code: z.string().max(24).nullable().optional(),
  override_availability: z.boolean().optional().default(false),
}).superRefine((v, ctx) => {
  if (new Date(v.ends_at) <= new Date(v.starts_at)) {
    ctx.addIssue({ code: "custom", path: ["ends_at"], message: "ends_at must be after starts_at" });
  }
});

export type AppointmentBookingInput = z.infer<typeof appointmentBookingSchema>;

// ---------------------------------------------------------------------------
// Helpers — identical to the former route-local functions.
// ---------------------------------------------------------------------------

export function compatibilityMetadata(body: AppointmentBookingInput) {
  return {
    title: body.title ?? null,
    description: body.description ?? null,
    guest_name: body.guest_name ?? null,
    guest_email: body.guest_email ?? null,
    guest_phone: body.guest_phone ?? null,
    service_catalog_id: body.service_catalog_id ?? null,
    estimated_cost: body.estimated_cost ?? null,
    tax_amount: body.tax_amount ?? null,
    location_address: body.location_address ?? null,
    customer_city: body.customer_city ?? null,
    customer_state: body.customer_state ?? null,
    customer_postal_code: body.customer_postal_code ?? null,
    override_availability: body.override_availability,
  };
}

export function localParts(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const text = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value || "";
  return {
    date: `${text("year")}-${text("month")}-${text("day")}`,
    weekday: text("weekday").toLowerCase(),
    minutes: Number(text("hour")) * 60 + Number(text("minute")),
  };
}

/**
 * Configured open/close (in local minutes) for one lowercase weekday.
 * Reads day_hours[weekday].is_open/isOpen/open/close first, then falls back
 * to working_days + opening_time/closing_time. Also used by the Shop Agent
 * profile reader so hours semantics stay identical everywhere.
 */
export function configuredHours(settings: any, weekday: string) {
  const raw = settings?.day_hours && typeof settings.day_hours === "object" ? settings.day_hours[weekday] : null;
  const explicit =
    typeof raw?.is_open === "boolean"
      ? raw.is_open
      : typeof raw?.isOpen === "boolean"
        ? raw.isOpen
        : undefined;
  const isOpen = explicit ?? (Array.isArray(settings?.working_days) && settings.working_days.some((d: string) => d.toLowerCase() === weekday));
  const parse = (v: string | undefined, fallback: string) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(v || fallback);
    return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
  };
  return {
    isOpen,
    open: parse(raw?.open, settings?.opening_time || "09:00"),
    close: parse(raw?.close, settings?.closing_time || "17:00"),
  };
}

export function isArchivedVehicle(metadata: unknown) {
  return !!(
    metadata &&
    typeof metadata === "object" &&
    !Array.isArray(metadata) &&
    (metadata as Record<string, unknown>).archived_at
  );
}

export async function validateAppointmentReferences(supabase: any, body: AppointmentBookingInput) {
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id,status")
    .eq("workspace_id", body.workspace_id)
    .eq("id", body.customer_id)
    .maybeSingle();
  if (customerError) throw customerError;
  if (!customer || customer.status === "archived") {
    return json(
      { error: { code: "invalid_customer", message: "The selected customer is not available in this workspace." } },
      { status: 400 },
    );
  }
  if (body.vehicle_id) {
    const { data: vehicle, error } = await supabase
      .from("vehicles")
      .select("id,customer_id,metadata")
      .eq("workspace_id", body.workspace_id)
      .eq("id", body.vehicle_id)
      .maybeSingle();
    if (error) throw error;
    if (!vehicle || isArchivedVehicle(vehicle.metadata) || vehicle.customer_id !== body.customer_id) {
      return json(
        { error: { code: "invalid_vehicle", message: "The selected vehicle does not belong to this customer in this workspace." } },
        { status: 400 },
      );
    }
  }
  if (body.location_id) {
    const { data: location, error } = await supabase
      .from("locations")
      .select("id")
      .eq("workspace_id", body.workspace_id)
      .eq("id", body.location_id)
      .maybeSingle();
    if (error) throw error;
    if (!location) {
      return json(
        { error: { code: "invalid_location", message: "The selected location is not available in this workspace." } },
        { status: 400 },
      );
    }
  }
  if (body.service_catalog_id) {
    const { data: service, error } = await supabase
      .from("service_catalog")
      .select("id")
      .eq("workspace_id", body.workspace_id)
      .eq("id", body.service_catalog_id)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    if (!service) {
      return json(
        { error: { code: "invalid_service", message: "The selected service is not active in this workspace." } },
        { status: 400 },
      );
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// The core.
// ---------------------------------------------------------------------------

export type BookAppointmentResult = { data: unknown } | { error: Response };

export interface BookAppointmentOptions {
  /**
   * Staff user id for audit attribution. Null when booked by the Shop Agent —
   * the agent's authority comes from ZeroPolicy (checked by its callers), not
   * a user JWT. The public_booking RPC precedent also inserts without
   * created_by, so a null here is consistent with existing booking paths.
   */
  createdBy?: string | null;
}

/**
 * Validate + availability-check + insert an appointment.
 *
 * Returns `{ data }` on success (the inserted row) or `{ error }` holding the
 * client-facing error Response (invalid_customer, outside_business_hours,
 * lead_time, blackout_date, schedule_conflict, …). Unexpected DB failures
 * throw. Callers that sit behind HTTP return `error` as-is; non-HTTP callers
 * (the Shop Agent) translate it into a handoff.
 */
export async function bookAppointmentCore(
  supabase: any,
  body: AppointmentBookingInput,
  opts: BookAppointmentOptions = {},
): Promise<BookAppointmentResult> {
  const referenceError = await validateAppointmentReferences(supabase, body);
  if (referenceError) return { error: referenceError };

  if (body.assigned_user_id) {
    const { data, error } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", body.workspace_id)
      .eq("user_id", body.assigned_user_id)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return {
        error: json(
          { error: { code: "invalid_assignment", message: "The assigned user is not an active member of this workspace." } },
          { status: 400 },
        ),
      };
    }
  }

  const [{ data: workspace, error: we }, { data: settings, error: se }] = await Promise.all([
    supabase.from("workspaces").select("timezone").eq("id", body.workspace_id).single(),
    supabase
      .from("workspace_settings")
      .select("day_hours,opening_time,closing_time,working_days,buffer_time_before,buffer_time_after,min_lead_time_hours")
      .eq("workspace_id", body.workspace_id)
      .single(),
  ]);
  if (we) throw we;
  if (se) throw se;

  if (!body.override_availability) {
    const tz = workspace?.timezone || "UTC";
    const start = localParts(body.starts_at, tz);
    const end = localParts(body.ends_at, tz);
    const hours = configuredHours(settings, start.weekday);
    if (start.date !== end.date || !hours.isOpen || start.minutes < hours.open || end.minutes > hours.close) {
      return {
        error: json(
          { error: { code: "outside_business_hours", message: "The requested time is outside configured availability." } },
          { status: 409 },
        ),
      };
    }
    const lead = Math.max(0, Number(settings?.min_lead_time_hours || 0));
    if (Date.parse(body.starts_at) < Date.now() + lead * 3600000) {
      return {
        error: json(
          { error: { code: "lead_time", message: "The requested time is inside the minimum lead-time window." } },
          { status: 409 },
        ),
      };
    }
    const db = supabase as any;
    const { data: blackout, error: be } = await db
      .from("workspace_blackout_dates")
      .select("id")
      .eq("workspace_id", body.workspace_id)
      .eq("blocked_date", start.date)
      .limit(1);
    if (be) throw be;
    if (blackout?.length) {
      return {
        error: json(
          { error: { code: "blackout_date", message: "The requested date is unavailable." } },
          { status: 409 },
        ),
      };
    }
    const before = Math.max(0, Number(settings?.buffer_time_before || 0));
    const after = Math.max(0, Number(settings?.buffer_time_after || 0));
    const queryEnd = new Date(Date.parse(body.ends_at) + before * 60000).toISOString();
    const queryStart = new Date(Date.parse(body.starts_at) - after * 60000).toISOString();
    const { data: conflicts, error: ce } = await supabase
      .from("appointments")
      .select("id")
      .eq("workspace_id", body.workspace_id)
      .not("status", "in", '("cancelled","no_show")')
      .lt("starts_at", queryEnd)
      .gt("ends_at", queryStart)
      .limit(1);
    if (ce) throw ce;
    if (conflicts?.length) {
      return {
        error: json(
          { error: { code: "schedule_conflict", message: "The requested time overlaps an existing appointment or buffer." } },
          { status: 409 },
        ),
      };
    }
  }

  const { data, error } = await supabase
    .from("appointments")
    .insert({
      workspace_id: body.workspace_id,
      customer_id: body.customer_id,
      vehicle_id: body.vehicle_id ?? null,
      location_id: body.location_id ?? null,
      assigned_user_id: body.assigned_user_id ?? null,
      starts_at: body.starts_at,
      ends_at: body.ends_at,
      source: body.source,
      status: body.status as any,
      notes: body.notes ?? null,
      created_by: opts.createdBy ?? null,
      metadata: compatibilityMetadata(body),
    })
    .select()
    .single();
  if (error) throw error;
  return { data };
}
