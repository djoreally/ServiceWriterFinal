import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const schema = z.object({ workspace_id: z.string().uuid() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const { workspace_id } = schema.parse(await request.json());
    const { supabase } = await requireWorkspaceMember(
      workspace_id,
      ["owner", "admin", "manager", "service_advisor", "receptionist", "dispatcher", "technician"],
      request,
    );

    const { data: current, error: readError } = await supabase
      .from("appointments")
      .select("id,status,metadata")
      .eq("workspace_id", workspace_id)
      .eq("id", id)
      .maybeSingle();
    if (readError) throw readError;
    if (!current) return json({ error: { code: "not_found", message: "Appointment not found in this workspace." } }, { status: 404 });
    if (current.status === "in_progress") return json({ data: { id, status: current.status, already_started: true } });
    if (["completed", "cancelled", "no_show"].includes(current.status)) {
      return json({ error: { code: "invalid_status", message: "This appointment can no longer be started." } }, { status: 409 });
    }

    const metadata = current.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
      ? current.metadata as Record<string, unknown>
      : {};
    const { data, error } = await supabase
      .from("appointments")
      .update({
        status: "in_progress",
        metadata: { ...metadata, actual_start_time: metadata.actual_start_time ?? new Date().toISOString() },
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", workspace_id)
      .eq("id", id)
      .select("id,status,metadata,updated_at")
      .single();
    if (error) throw error;
    return json({ data: { ...data, already_started: false } });
  } catch (error) {
    return errorResponse(error);
  }
}
