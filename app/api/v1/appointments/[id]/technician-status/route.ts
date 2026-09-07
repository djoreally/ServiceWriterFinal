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

    const { data: current, error: currentError } = await supabase
      .from("appointments")
      .select("id,status,assigned_user_id,metadata")
      .eq("workspace_id", body.workspace_id)
      .eq("id", appointmentId)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) throw new ApiError(404, "Appointment not found.", "not_found");

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

    const { data, error } = await supabase
      .from("appointments")
      .update({ status: body.status, metadata: nextMetadata, updated_at: now })
      .eq("workspace_id", body.workspace_id)
      .eq("id", appointmentId)
      .select("id,status,assigned_user_id,metadata,updated_at")
      .single();
    if (error) throw error;

    return json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
