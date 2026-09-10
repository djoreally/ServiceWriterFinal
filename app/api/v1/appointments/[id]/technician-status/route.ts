import { ApiError, errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const bodySchema = z.object({
  workspace_id: z.string().uuid(),
  status: z.enum(["acknowledged", "en_route", "arrived"]),
  location: z.object({ lat: z.number().finite(), lng: z.number().finite() }).nullable().optional(),
});

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const appointmentId = z.string().uuid().parse((await context.params).id);
    const body = bodySchema.parse(await request.json());
    const { supabase, user, membership } = await requireWorkspaceMember(
      body.workspace_id,
      ["owner", "admin", "manager", "service_advisor", "receptionist", "dispatcher", "technician"],
      request,
    );
    const db = supabase as any;

    const { data: current, error: currentError } = await db
      .from("appointments")
      .select("id,status,assigned_user_id,metadata")
      .eq("workspace_id", body.workspace_id)
      .eq("id", appointmentId)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) throw new ApiError(404, "Appointment not found.", "not_found");
    if (["completed", "cancelled", "no_show"].includes(current.status)) {
      throw new ApiError(409, "This appointment can no longer receive dispatch updates.", "invalid_status");
    }
    if (membership.role === "technician" && current.assigned_user_id !== user.id) {
      throw new ApiError(403, "This appointment is not assigned to you.", "forbidden");
    }

    const metadata = metadataObject(current.metadata);
    const now = new Date().toISOString();
    const nextMetadata: Record<string, unknown> = {
      ...metadata,
      dispatch_status: body.status,
      dispatch_status_updated_at: now,
    };
    if (body.location) {
      nextMetadata.last_dispatch_location = body.location;
      nextMetadata.last_dispatch_location_at = now;
    }

    const appointmentStatus = body.status === "arrived" && ["requested", "confirmed"].includes(current.status)
      ? "checked_in"
      : current.status;

    const { data, error } = await db
      .from("appointments")
      .update({ status: appointmentStatus, metadata: nextMetadata, updated_at: now })
      .eq("workspace_id", body.workspace_id)
      .eq("id", appointmentId)
      .select("id,status,assigned_user_id,metadata,updated_at")
      .single();
    if (error) throw error;

    // Only the field technician owns mutable presence. Office/dispatch users
    // may advance dispatch state without becoming the job's live technician.
    if (membership.role === "technician") {
      const presenceStatus = body.status === "en_route" ? "en_route" : body.status === "arrived" ? "on_job" : "available";
      const { error: presenceError } = await db.rpc("set_technician_presence_v1", {
        p_workspace_id: body.workspace_id,
        p_status: presenceStatus,
        p_appointment_id: appointmentId,
        p_location: body.location ?? null,
      });
      if (presenceError) throw presenceError;
    }

    return json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
