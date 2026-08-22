import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const schema = z.object({ workspace_id: z.string().uuid() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const { workspace_id } = schema.parse(await request.json());
    const { supabase, user } = await requireWorkspaceMember(workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist", "dispatcher"]);
    const { data, error } = await supabase.rpc("complete_appointment_with_rewards" as never, { p_appointment_id: id, p_actor_id: user.id });
    if (error) throw error;
    return json({ data });
  } catch (error) { return errorResponse(error); }
}
