import { json, errorResponse, paginationSchema, requireWorkspaceMember } from "@/server/api";
import {
  conflictWindow,
  validateLocalAvailability,
} from "@/server/scheduling/appointment-availability";
import { z } from "zod";

const appointmentSchema = z.object({
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
}).superRefine((value, ctx) => {
  if (new Date(value.ends_at) <= new Date(value.starts_at)) {
    ctx.addIssue({ code: "custom", path: ["ends_at"], message: "ends_at must be after starts_at" });
  }
});

type AppointmentInput = z.infer<typeof appointmentSchema>;

function compatibilityMetadata(body: AppointmentInput) {
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

const conflictMessage = {
  outside_business_hours: "The requested time is outside configured availability.",
  lead_time: "The requested time is inside the minimum lead-time window.",
  blackout_date: "The requested date is unavailable.",
  schedule_conflict: "The requested time overlaps an existing appointment or buffer.",
} as const;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspace_id");
    if (!workspaceId) throw new Error("workspace_id is required");
    const { supabase } = await requireWorkspaceMember(workspaceId, undefined, request);
    const { limit, offset } = paginationSchema.parse(Object.fromEntries(url.searchParams));
    const { data, error } = await supabase
      .from("appointments")
      .select("*,customers(id,first_name,last_name,email,phone),vehicles(id,customer_id,year,make,model,vin,license_plate,plate_region,color,mileage,notes),locations(id,name)")
      .eq("workspace_id", workspaceId)
      .order("starts_at")
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return json({ data: data ?? [], pagination: { limit, offset } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = appointmentSchema.parse(await request.json());
    const { supabase, user } = await requireWorkspaceMember(
      body.workspace_id,
      ["owner", "admin", "manager", "service_advisor", "receptionist", "dispatcher"],
      request,
    );

    const [{ data: customer, error: customerError }, { data: workspace, error: workspaceError }, { data: settings, error: settingsError }] = await Promise.all([
      supabase.from("customers").select("id").eq("workspace_id", body.workspace_id).eq("id", body.customer_id).maybeSingle(),
      supabase.from("workspaces").select("timezone").eq("id", body.workspace_id).single(),
      supabase.from("workspace_settings").select("day_hours,opening_time,closing_time,working_days,buffer_time_before,buffer_time_after,min_lead_time_hours").eq("workspace_id", body.workspace_id).single(),
    ]);
    if (customerError) throw customerError;
    if (!customer) return json({ error: { code: "invalid_customer", message: "The selected customer is not in this workspace." } }, { status: 400 });
    if (workspaceError) throw workspaceError;
    if (settingsError) throw settingsError;

    if (body.vehicle_id) {
      const { data: vehicle, error } = await supabase
        .from("vehicles")
        .select("id,customer_id")
        .eq("workspace_id", body.workspace_id)
        .eq("id", body.vehicle_id)
        .maybeSingle();
      if (error) throw error;
      if (!vehicle || vehicle.customer_id !== body.customer_id) {
        return json({ error: { code: "invalid_vehicle", message: "The selected vehicle does not belong to this customer." } }, { status: 400 });
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
      if (!service) return json({ error: { code: "invalid_service", message: "The selected service is not active in this workspace." } }, { status: 400 });
    }

    if (body.assigned_user_id) {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", body.workspace_id)
        .eq("user_id", body.assigned_user_id)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: { code: "invalid_assignment", message: "The assigned user is not an active member of this workspace." } }, { status: 400 });
    }

    if (!body.override_availability) {
      const timezone = workspace?.timezone || "UTC";
      const start = localParts(body.starts_at, timezone);
      const end = localParts(body.ends_at, timezone);
      const db = supabase as any;
      const { data: blackout, error: blackoutError } = await db
        .from("workspace_blackout_dates")
        .select("id")
        .eq("workspace_id", body.workspace_id)
        .eq("blocked_date", start.date)
        .limit(1);
      if (blackoutError) throw blackoutError;

      const violation = validateLocalAvailability({
        start,
        end,
        settings: settings ?? {},
        startsAtMs: Date.parse(body.starts_at),
        blackout: Boolean(blackout?.length),
      });
      if (violation) {
        return json({ error: { code: violation, message: conflictMessage[violation] } }, { status: 409 });
      }

      const { queryStart, queryEnd } = conflictWindow({
        startsAt: body.starts_at,
        endsAt: body.ends_at,
        bufferTimeBefore: settings?.buffer_time_before,
        bufferTimeAfter: settings?.buffer_time_after,
      });
      const { data: conflicts, error: conflictError } = await supabase
        .from("appointments")
        .select("id")
        .eq("workspace_id", body.workspace_id)
        .not("status", "in", '("cancelled","no_show")')
        .lt("starts_at", queryEnd)
        .gt("ends_at", queryStart)
        .limit(1);
      if (conflictError) throw conflictError;
      if (conflicts?.length) {
        return json({ error: { code: "schedule_conflict", message: conflictMessage.schedule_conflict } }, { status: 409 });
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
        created_by: user.id,
        metadata: compatibilityMetadata(body),
      })
      .select()
      .single();
    if (error) throw error;
    return json({ data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
