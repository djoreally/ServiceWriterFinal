import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { dispatchAppointmentLifecycle } from "@/server/messaging/appointment-events";
import { LIFECYCLE_EVENT_KEYS } from "@/server/messaging/lifecycle-events";
import {
  conflictWindow,
  validateLocalAvailability,
} from "@/server/scheduling/appointment-availability";
import { zonedDateTimeParts, zonedLocalDateTimeToUtc } from "@/server/scheduling/timezone";
import { z } from "zod";

const patchSchema = z.object({
  workspace_id: z.string().uuid(),
  customer_id: z.string().uuid().nullable().optional(),
  vehicle_id: z.string().uuid().nullable().optional(),
  location_id: z.string().uuid().nullable().optional(),
  assigned_user_id: z.string().uuid().nullable().optional(),
  starts_at: z.string().datetime().optional(),
  ends_at: z.string().datetime().optional(),
  scheduled_date: z.string().date().optional(),
  scheduled_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  duration_minutes: z.number().int().min(5).max(1440).optional(),
  status: z.string().trim().max(40).optional(),
  source: z.string().trim().max(40).optional(),
  notes: z.string().max(5000).nullable().optional(),
  title: z.string().trim().min(1).max(200).optional(),
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
  override_availability: z.boolean().optional(),
}).refine((value) => Object.keys(value).some((key) => key !== "workspace_id"), {
  message: "At least one appointment field is required",
});

const compatibilityKeys = [
  "title", "description", "guest_name", "guest_email", "guest_phone",
  "service_catalog_id", "estimated_cost", "tax_amount", "location_address",
  "customer_city", "customer_state", "customer_postal_code",
] as const;

function pad(value: number) { return String(value).padStart(2, "0"); }

function localParts(iso: string, timeZone: string) {
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
  const text = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return {
    date: `${text("year")}-${text("month")}-${text("day")}`,
    weekday: text("weekday").toLowerCase(),
    minutes: Number(text("hour")) * 60 + Number(text("minute")),
  };
}

const availabilityMessage = {
  outside_business_hours: "The requested time is outside configured availability.",
  lead_time: "The requested time is inside the minimum lead-time window.",
  blackout_date: "The requested date is unavailable.",
  schedule_conflict: "The requested time overlaps an existing appointment or buffer.",
} as const;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const { supabase } = await requireWorkspaceMember(workspaceId, undefined, request);
    const { data, error } = await supabase
      .from("appointments")
      .select("*,customers(id,first_name,last_name,company_name,email,phone,address_line1,address_line2,city,region,postal_code,notes),vehicles(id,customer_id,year,make,model,vin,license_plate,plate_region,color,mileage,notes)")
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .single();
    if (error) throw error;
    return json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const body = patchSchema.parse(await request.json());
    const { workspace_id } = body;
    const { supabase } = await requireWorkspaceMember(
      workspace_id,
      ["owner", "admin", "manager", "service_advisor", "receptionist", "dispatcher"],
      request,
    );

    const [currentResult, workspaceResult, settingsResult] = await Promise.all([
      supabase.from("appointments").select("id,workspace_id,customer_id,vehicle_id,starts_at,ends_at,status,assigned_user_id,metadata").eq("id", id).eq("workspace_id", workspace_id).single(),
      supabase.from("workspaces").select("name,timezone").eq("id", workspace_id).single(),
      supabase.from("workspace_settings").select("day_hours,opening_time,closing_time,working_days,buffer_time_before,buffer_time_after,min_lead_time_hours").eq("workspace_id", workspace_id).single(),
    ]);
    const current = currentResult.data;
    const workspace = workspaceResult.data;
    const settings = settingsResult.data;
    if (currentResult.error || !current) throw currentResult.error ?? new Error("Appointment was not found in this workspace.");
    if (workspaceResult.error || !workspace) throw workspaceResult.error ?? new Error("Workspace was not found.");
    if (settingsResult.error || !settings) throw settingsResult.error ?? new Error("Scheduling settings were not found.");

    const effectiveCustomerId = Object.prototype.hasOwnProperty.call(body, "customer_id")
      ? body.customer_id ?? null
      : current.customer_id;
    if (!effectiveCustomerId) return json({ error: { code: "invalid_customer", message: "An appointment customer is required." } }, { status: 400 });

    if (Object.prototype.hasOwnProperty.call(body, "customer_id")) {
      const { data: customer, error } = await supabase.from("customers").select("id").eq("workspace_id", workspace_id).eq("id", effectiveCustomerId).maybeSingle();
      if (error) throw error;
      if (!customer) return json({ error: { code: "invalid_customer", message: "The selected customer is not in this workspace." } }, { status: 400 });
    }

    const effectiveVehicleId = Object.prototype.hasOwnProperty.call(body, "vehicle_id")
      ? body.vehicle_id ?? null
      : current.vehicle_id;
    if (effectiveVehicleId) {
      const { data: vehicle, error } = await supabase.from("vehicles").select("id,customer_id").eq("workspace_id", workspace_id).eq("id", effectiveVehicleId).maybeSingle();
      if (error) throw error;
      if (!vehicle || vehicle.customer_id !== effectiveCustomerId) {
        return json({ error: { code: "invalid_vehicle", message: "The selected vehicle does not belong to this customer." } }, { status: 400 });
      }
    }

    if (body.service_catalog_id) {
      const { data: service, error } = await supabase.from("service_catalog").select("id").eq("workspace_id", workspace_id).eq("id", body.service_catalog_id).eq("is_active", true).maybeSingle();
      if (error) throw error;
      if (!service) return json({ error: { code: "invalid_service", message: "The selected service is not active in this workspace." } }, { status: 400 });
    }

    const assigned = Object.prototype.hasOwnProperty.call(body, "assigned_user_id")
      ? body.assigned_user_id ?? null
      : current.assigned_user_id;
    if (assigned) {
      const { data, error } = await supabase.from("workspace_members").select("user_id").eq("workspace_id", workspace_id).eq("user_id", assigned).eq("is_active", true).maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: { code: "invalid_assignment", message: "The assigned user is not an active member of this workspace." } }, { status: 400 });
    }

    const workspaceTimezone = workspace.timezone || "UTC";
    let startsAt = body.starts_at ?? current.starts_at;
    let endsAt = body.ends_at ?? current.ends_at;
    if (body.scheduled_date || body.scheduled_time || body.duration_minutes) {
      const parts = zonedDateTimeParts(new Date(current.starts_at), workspaceTimezone);
      const date = `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
      const time = `${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
      const local = zonedLocalDateTimeToUtc(body.scheduled_date ?? date, body.scheduled_time ?? time, workspaceTimezone);
      startsAt = local.toISOString();
      const duration = body.duration_minutes ?? Math.max(5, Math.round((Date.parse(current.ends_at) - Date.parse(current.starts_at)) / 60_000));
      endsAt = new Date(local.getTime() + duration * 60_000).toISOString();
    } else if (body.starts_at && !body.ends_at) {
      const duration = Math.max(300_000, Date.parse(current.ends_at) - Date.parse(current.starts_at));
      endsAt = new Date(Date.parse(body.starts_at) + duration).toISOString();
    }
    if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error("ends_at must be after starts_at");

    const scheduleChanged = startsAt !== current.starts_at || endsAt !== current.ends_at;
    if (scheduleChanged && body.override_availability !== true) {
      const start = localParts(startsAt, workspaceTimezone);
      const end = localParts(endsAt, workspaceTimezone);
      const db = supabase as any;
      const { data: blackout, error: blackoutError } = await db.from("workspace_blackout_dates").select("id").eq("workspace_id", workspace_id).eq("blocked_date", start.date).limit(1);
      if (blackoutError) throw blackoutError;

      const violation = validateLocalAvailability({
        start,
        end,
        settings,
        startsAtMs: Date.parse(startsAt),
        blackout: Boolean(blackout?.length),
      });
      if (violation) return json({ error: { code: violation, message: availabilityMessage[violation] } }, { status: 409 });

      const { queryStart, queryEnd } = conflictWindow({
        startsAt,
        endsAt,
        bufferTimeBefore: settings.buffer_time_before,
        bufferTimeAfter: settings.buffer_time_after,
      });
      const { data: conflicts, error } = await supabase
        .from("appointments")
        .select("id")
        .eq("workspace_id", workspace_id)
        .neq("id", id)
        .not("status", "in", '("cancelled","no_show")')
        .lt("starts_at", queryEnd)
        .gt("ends_at", queryStart)
        .limit(1);
      if (error) throw error;
      if (conflicts?.length) return json({ error: { code: "schedule_conflict", message: availabilityMessage.schedule_conflict } }, { status: 409 });
    }

    const existing = current.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
      ? current.metadata as Record<string, unknown>
      : {};
    const metadata = { ...existing };
    for (const key of compatibilityKeys) {
      if (Object.prototype.hasOwnProperty.call(body, key)) metadata[key] = body[key] ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(body, "override_availability")) metadata.override_availability = body.override_availability === true;

    const canonicalPatch: Record<string, unknown> = {
      starts_at: startsAt,
      ends_at: endsAt,
      metadata,
      updated_at: new Date().toISOString(),
    };
    for (const key of ["customer_id", "vehicle_id", "location_id", "assigned_user_id", "status", "source", "notes"] as const) {
      if (Object.prototype.hasOwnProperty.call(body, key)) canonicalPatch[key] = body[key] ?? null;
    }

    const { data, error } = await supabase.from("appointments")
      .update(canonicalPatch as any)
      .eq("id", id)
      .eq("workspace_id", workspace_id)
      .select("id,workspace_id,customer_id,starts_at,ends_at,status,assigned_user_id,notes,metadata,updated_at,customers(id,first_name,last_name,email),vehicles(id,year,make,model)")
      .single();
    if (error) throw error;

    try {
      const updated = data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
        ? data.metadata as Record<string, unknown>
        : {};
      const customerUrl = typeof updated.manage_url === "string" && /^https?:\/\//i.test(updated.manage_url)
        ? updated.manage_url
        : new URL("/my-bookings", request.url).toString();
      const changed = Object.keys(body).filter((key) => key !== "workspace_id" && key !== "override_availability");
      const eventKey = data.status === "cancelled" && current.status !== "cancelled"
        ? LIFECYCLE_EVENT_KEYS.appointmentCancelled
        : data.starts_at !== current.starts_at || data.ends_at !== current.ends_at
          ? LIFECYCLE_EVENT_KEYS.appointmentRescheduled
          : LIFECYCLE_EVENT_KEYS.bookingDetailsChanged;
      await dispatchAppointmentLifecycle({
        eventKey,
        eventId: `${id}:${eventKey}:${data.updated_at}`,
        appointment: data,
        workspaceName: workspace.name ?? "Service Writer",
        workspaceTimezone,
        actionUrl: customerUrl,
        changedFields: changed,
      });
    } catch (lifecycleError) {
      console.error("[Lifecycle] appointment update email enqueue failed", lifecycleError);
    }
    return json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const { supabase } = await requireWorkspaceMember(
      workspaceId,
      ["owner", "admin", "manager", "service_advisor", "receptionist", "dispatcher"],
      request,
    );
    const { data, error } = await supabase.from("appointments")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .select("id,workspace_id,customer_id,starts_at,ends_at,status,notes,metadata,updated_at,customers(id,first_name,last_name,email),vehicles(id,year,make,model)")
      .single();
    if (error) throw error;
    try {
      const { data: workspace } = await supabase.from("workspaces").select("name,timezone").eq("id", workspaceId).single();
      const metadata = data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
        ? data.metadata as Record<string, unknown>
        : {};
      const url = typeof metadata.manage_url === "string" && /^https?:\/\//i.test(metadata.manage_url)
        ? metadata.manage_url
        : new URL("/my-bookings", request.url).toString();
      await dispatchAppointmentLifecycle({
        eventKey: LIFECYCLE_EVENT_KEYS.appointmentCancelled,
        eventId: `${id}:cancelled:${data.updated_at}`,
        appointment: data,
        workspaceName: workspace?.name ?? "Service Writer",
        workspaceTimezone: workspace?.timezone ?? "UTC",
        actionUrl: url,
      });
    } catch (lifecycleError) {
      console.error("[Lifecycle] appointment cancellation email enqueue failed", lifecycleError);
    }
    return json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
