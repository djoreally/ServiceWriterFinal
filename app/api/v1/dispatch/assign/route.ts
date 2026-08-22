import { z } from "zod";
import { errorResponse, json, requireWorkspaceMember } from "@/server/api";

const assignmentSchema = z.object({
  workspace_id: z.string().uuid(),
  job_source: z.enum(["appointment", "fleet_work_order"]),
  job_id: z.string().uuid(),
  technician_id: z.string().uuid().nullable().optional(),
  van_id: z.string().uuid().nullable().optional(),
  date: z.string().max(40).nullable().optional(),
  start: z.string().max(40).nullable().optional(),
  duration_minutes: z.number().int().min(0).max(1440).optional(),
  expected_updated_at: z.string().datetime().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const body = assignmentSchema.parse(await request.json());
    const { supabase } = await requireWorkspaceMember(body.workspace_id, ["owner", "admin", "manager", "service_advisor", "dispatcher", "fleet_manager"]);
    const { data, error } = await supabase.rpc("assign_dispatch_job_v1", {
      p_job_source: body.job_source,
      p_job_id: body.job_id,
      p_technician_id: body.technician_id ?? null,
      p_van_id: body.van_id ?? null,
      p_date: body.date ?? null,
      p_start: body.start ?? null,
      p_duration_minutes: body.duration_minutes ?? 60,
      p_expected_updated_at: body.expected_updated_at ?? null,
      p_notes: body.notes ?? null,
    });
    if (error) throw error;
    return json({ data: data ?? null });
  } catch (error) {
    return errorResponse(error);
  }
}
