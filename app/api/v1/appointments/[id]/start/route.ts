import { ApiError, errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const schema = z.object({ workspace_id: z.string().uuid() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let appointmentId: string | undefined;
  let workspaceId: string | undefined;
  try {
    appointmentId = z.string().uuid().parse((await context.params).id);
    const parsed = schema.parse(await request.json());
    workspaceId = parsed.workspace_id;
    const { supabase, user, membership } = await requireWorkspaceMember(
      workspaceId,
      ["owner", "admin", "manager", "service_advisor", "receptionist", "dispatcher", "technician"],
      request,
    );
    const db = supabase as any;

    const { data: current, error: readError } = await db
      .from("appointments")
      .select("id,status,assigned_user_id,metadata,customer_id,vehicle_id")
      .eq("workspace_id", workspaceId)
      .eq("id", appointmentId)
      .maybeSingle();
    if (readError) throw readError;
    if (!current) return json({ error: { code: "not_found", message: "Appointment not found in this workspace." } }, { status: 404 });
    if (membership.role === "technician" && current.assigned_user_id !== user.id) {
      throw new ApiError(403, "This appointment is not assigned to you.", "forbidden");
    }
    if (current.status === "in_progress") return json({ data: { id: appointmentId, status: current.status, already_started: true } });
    if (["completed", "cancelled", "no_show"].includes(current.status)) {
      return json({ error: { code: "invalid_status", message: "This appointment can no longer be started." } }, { status: 409 });
    }

    // Non-fleet invariant: Appointment is the work order. This route must never
    // call fleet work_orders helpers such as ensure_vehicle_work_order_v1.
    if (!current.customer_id || !current.vehicle_id) {
      return json({ error: { code: "missing_job_context", message: "Start Job requires customer and vehicle context." } }, { status: 409 });
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
      .eq("workspace_id", workspaceId)
      .eq("id", appointmentId)
      .select("id,status,assigned_user_id,metadata,updated_at")
      .single();
    if (error) throw error;

    if (membership.role === "technician") {
      const { error: presenceError } = await db.rpc("set_technician_presence_v1", {
        p_workspace_id: workspaceId,
        p_status: "on_job",
        p_appointment_id: appointmentId,
        p_location: null,
      });
      if (presenceError) throw presenceError;
    }

    return json({ data: { ...data, already_started: false } });
  } catch (error) {
    console.error("[appointments:start] failed", {
      appointmentId,
      workspaceId,
      code: (error as { code?: string } | null)?.code,
      message: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(error);
  }
}
