import { json, errorResponse, paginationSchema, requireWorkspaceMember } from "@/server/api";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { dispatchAppointmentLifecycle } from "@/server/messaging/appointment-events";
import { LIFECYCLE_EVENT_KEYS } from "@/server/messaging/lifecycle-events";
import { z } from "zod";

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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspace_id");
    if (!workspaceId) throw new Error("workspace_id is required");
    const { supabase } = await requireWorkspaceMember(workspaceId, undefined, request);
    const { limit, offset } = paginationSchema.parse(Object.fromEntries(url.searchParams));
    const { data, error } = await supabase
      .from("dispatch_events")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return json({ data: data ?? [], pagination: { limit, offset } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = dispatchEventSchema.parse(await request.json());
    const { supabase, user } = await requireWorkspaceMember(body.workspace_id, ["owner", "admin", "manager", "service_advisor", "dispatcher", "technician", "fleet_manager"], request);
    const { data, error } = await supabase.from("dispatch_events").insert({ ...body, performed_by: user.id }).select().single();
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
            const technician = body.technician_id ? await admin.auth.admin.getUserById(body.technician_id) : null;
            const technicianName = String(
              technician?.data?.user?.user_metadata?.full_name
              || technician?.data?.user?.user_metadata?.name
              || technician?.data?.user?.email?.split("@")[0]
              || "Your technician",
            );
            await dispatchAppointmentLifecycle({
              eventKey,
              eventId: data.id,
              appointment,
              workspaceName: workspace?.name ?? "Service Writer",
              workspaceTimezone: workspace?.timezone ?? "UTC",
              actionUrl: new URL("/my-bookings", request.url).toString(),
              technicianName,
            });
          }
        }
      } catch (dispatchError) {
        console.error("[Lifecycle] live-service email enqueue failed", dispatchError);
      }
    }
    return json({ data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
