import { z } from "zod";
import { errorResponse, json, requireWorkspaceMember } from "@/server/api";

const assignmentSchema = z.object({
  workspace_id: z.string().uuid(),
  job_source: z.enum(["appointment", "work_order"]),
  job_id: z.string().uuid(),
  technician_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const body = assignmentSchema.parse(await request.json());
    const { supabase } = await requireWorkspaceMember(body.workspace_id, ["owner", "admin", "manager", "service_advisor", "dispatcher"], request);
    const { data, error } = await supabase.rpc("assign_dispatch_job_v1", {
      p_workspace_id: body.workspace_id,
      p_job_source: body.job_source,
      p_job_id: body.job_id,
      p_technician_id: body.technician_id ?? null,
      p_notes: body.notes ?? null,
    });
    if (error) throw error;
    return json({ data: data ?? null });
  } catch (error) {
    return errorResponse(error);
  }
}
