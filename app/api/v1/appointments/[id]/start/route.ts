import { ApiError, errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { dispatchAppointmentLifecycle } from "@/server/messaging/appointment-events";
import { LIFECYCLE_EVENT_KEYS } from "@/server/messaging/lifecycle-events";

const schema = z.object({ workspace_id: z.string().uuid() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const { workspace_id } = schema.parse(await request.json());
    const { supabase, user, membership } = await requireWorkspaceMember(
      workspace_id,
      ["owner", "admin", "manager", "service_advisor", "receptionist", "dispatcher", "technician"],
      request,
    );
    const db = supabase as any;

    const { data: current, error: readError } = await db
      .from("appointments")
      .select("id,status,assigned_user_id,metadata")
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

    try {
      const [{ data: appointment }, { data: workspace }] = await Promise.all([
        db.from("appointments")
          .select("id,workspace_id,customer_id,starts_at,ends_at,status,notes,metadata,updated_at,customers(id,first_name,last_name,email),vehicles(id,year,make,model)")
          .eq("workspace_id", workspace_id).eq("id", id).single(),
        db.from("workspaces").select("name,timezone").eq("id", workspace_id).single(),
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
        await dispatchAppointmentLifecycle({
          eventKey: LIFECYCLE_EVENT_KEYS.serviceStarted,
          eventId: `${id}:technician-status:started`,
          appointment,
          workspaceName: workspace?.name ?? "Service Writer",
          workspaceTimezone: workspace?.timezone ?? "UTC",
          actionUrl: new URL("/my-bookings", request.url).toString(),
          technicianName,
        });
      }
    } catch (dispatchError) {
      console.error("[Lifecycle] appointment start email enqueue failed", dispatchError);
    }

    return json({ data: { ...data, already_started: false } });
  } catch (error) {
    return errorResponse(error);
  }
}
