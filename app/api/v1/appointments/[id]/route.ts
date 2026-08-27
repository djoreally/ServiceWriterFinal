import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { dispatchAppointmentLifecycle } from "@/server/messaging/appointment-events";
import { LIFECYCLE_EVENT_KEYS } from "@/server/messaging/lifecycle-events";
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
}).refine((value) => Object.keys(value).some((key) => key !== "workspace_id"), {
  message: "At least one appointment field is required",
});

const compatibilityKeys = [
  "title", "description", "guest_name", "guest_email", "guest_phone",
  "service_catalog_id", "estimated_cost", "tax_amount", "location_address",
  "customer_city", "customer_state", "customer_postal_code",
] as const;

function parseLocalTimestamp(date: string, time: string) {
  // The preserved app's scheduling UI operates in the workspace's local time.
  // Current MOMS workspace is America/New_York; canonical API callers that
  // already have ISO timestamps should use starts_at/ends_at directly.
  const raw = new Date(`${date}T${time}`);
  if (Number.isNaN(raw.getTime())) throw new Error("Invalid appointment date/time.");
  return raw;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const { supabase } = await requireWorkspaceMember(workspaceId, undefined, request);
    const { data, error } = await supabase
      .from("appointments")
      .select("*,customers(id,first_name,last_name,email,phone),vehicles(id,customer_id,year,make,model,vin,license_plate,plate_region,color,mileage,notes)")
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
    const { supabase } = await requireWorkspaceMember(workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist", "dispatcher"]);

    const { data: current, error: currentError } = await supabase
      .from("appointments")
      .select("id,workspace_id,customer_id,starts_at,ends_at,status,assigned_user_id,metadata")
      .eq("id", id)
      .eq("workspace_id", workspace_id)
      .single();
    if (currentError || !current) throw currentError ?? new Error("Appointment was not found in this workspace.");

    let startsAt = body.starts_at ?? current.starts_at;
    let endsAt = body.ends_at ?? current.ends_at;

    if (body.scheduled_date || body.scheduled_time || body.duration_minutes) {
      const currentStart = new Date(current.starts_at);
      const currentDate = currentStart.toISOString().slice(0, 10);
      const currentTime = currentStart.toISOString().slice(11, 19);
      const localStart = parseLocalTimestamp(body.scheduled_date ?? currentDate, body.scheduled_time ?? currentTime);
      startsAt = localStart.toISOString();
      const duration = body.duration_minutes ?? Math.max(5, Math.round((Date.parse(current.ends_at) - Date.parse(current.starts_at)) / 60000));
      endsAt = new Date(localStart.getTime() + duration * 60000).toISOString();
    } else if (body.starts_at && !body.ends_at) {
      const currentDuration = Math.max(5, Date.parse(current.ends_at) - Date.parse(current.starts_at));
      endsAt = new Date(Date.parse(body.starts_at) + currentDuration).toISOString();
    }

    if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error("ends_at must be after starts_at");

    if (startsAt !== current.starts_at || endsAt !== current.ends_at) {
      const { data: conflicts, error: conflictError } = await supabase
        .from("appointments")
        .select("id")
        .eq("workspace_id", workspace_id)
        .neq("id", id)
        .neq("status", "cancelled")
        .lt("starts_at", endsAt)
        .gt("ends_at", startsAt)
        .limit(1);
      if (conflictError) throw conflictError;
      if (conflicts?.length) {
        return json({ error: { code: "schedule_conflict", message: "The requested time overlaps an existing appointment." } }, { status: 409 });
      }
    }

    const existingMetadata = current.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
      ? current.metadata as Record<string, unknown>
      : {};
    const metadata = { ...existingMetadata };
    for (const key of compatibilityKeys) {
      if (Object.prototype.hasOwnProperty.call(body, key)) metadata[key] = body[key] ?? null;
    }

    const canonicalPatch: Record<string, unknown> = {
      starts_at: startsAt,
      ends_at: endsAt,
      metadata,
      updated_at: new Date().toISOString(),
    };
    for (const key of ["customer_id", "vehicle_id", "location_id", "assigned_user_id", "status", "source", "notes"] as const) {
      if (Object.prototype.hasOwnProperty.call(body, key)) canonicalPatch[key] = body[key] ?? null;
    }

    const { data, error } = await supabase
      .from("appointments")
      .update(canonicalPatch as any)
      .eq("id", id)
      .eq("workspace_id", workspace_id)
      .select("id,workspace_id,customer_id,starts_at,ends_at,status,assigned_user_id,notes,metadata,updated_at,customers(id,first_name,last_name,email),vehicles(id,year,make,model)")
      .single();
    if (error) throw error;
    try {
      const { data: workspace } = await supabase.from("workspaces").select("name,timezone").eq("id", workspace_id).single();
      const metadata = data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
        ? data.metadata as Record<string, unknown>
        : {};
      const customerUrl = typeof metadata.manage_url === "string" && /^https?:\/\//i.test(metadata.manage_url)
        ? metadata.manage_url
        : new URL("/my-bookings", request.url).toString();
      const changedFields = Object.keys(body).filter((key) => key !== "workspace_id");
      const eventKey = data.status === "cancelled" && current.status !== "cancelled"
        ? LIFECYCLE_EVENT_KEYS.appointmentCancelled
        : data.starts_at !== current.starts_at || data.ends_at !== current.ends_at
          ? LIFECYCLE_EVENT_KEYS.appointmentRescheduled
          : LIFECYCLE_EVENT_KEYS.bookingDetailsChanged;
      await dispatchAppointmentLifecycle({
        eventKey,
        eventId: `${id}:${eventKey}:${data.updated_at}`,
        appointment: data,
        workspaceName: workspace?.name ?? "Service Writer",
        workspaceTimezone: workspace?.timezone ?? "UTC",
        actionUrl: customerUrl,
        changedFields,
      });
    } catch (dispatchError) {
      console.error("[Lifecycle] appointment update email enqueue failed", dispatchError);
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
    const { supabase } = await requireWorkspaceMember(workspaceId, ["owner", "admin", "manager", "service_advisor", "receptionist", "dispatcher"], request);
    const { data, error } = await supabase
      .from("appointments")
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
      const customerUrl = typeof metadata.manage_url === "string" && /^https?:\/\//i.test(metadata.manage_url)
        ? metadata.manage_url
        : new URL("/my-bookings", request.url).toString();
      await dispatchAppointmentLifecycle({
        eventKey: LIFECYCLE_EVENT_KEYS.appointmentCancelled,
        eventId: `${id}:cancelled:${data.updated_at}`,
        appointment: data,
        workspaceName: workspace?.name ?? "Service Writer",
        workspaceTimezone: workspace?.timezone ?? "UTC",
        actionUrl: customerUrl,
      });
    } catch (dispatchError) {
      console.error("[Lifecycle] appointment cancellation email enqueue failed", dispatchError);
    }
    return json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
