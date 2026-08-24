import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const schema = z.object({ workspace_id: z.string().uuid() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const { workspace_id } = schema.parse(await request.json());
    const { supabase } = await requireWorkspaceMember(workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist", "dispatcher", "technician"]);

    const { data: serviceRecordId, error } = await supabase.rpc(
      "complete_appointment_v1" as never,
      { p_workspace_id: workspace_id, p_appointment_id: id } as never,
    );
    if (error) throw error;

    return json({ data: { appointment_id: id, service_record_id: serviceRecordId } });
  } catch (error) {
    return errorResponse(error);
  }
}
