import { json, errorResponse, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const patchSchema = z.object({
  workspace_id: z.string().uuid(),
  status: z.enum(["draft", "scheduled", "assigned", "in_progress", "waiting_for_parts", "awaiting_approval", "completed", "cancelled"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  complaint: z.string().max(10000).nullable().optional(),
  technician_notes: z.string().max(10000).nullable().optional(),
  tech_notes: z.string().max(10000).nullable().optional(),
  diagnosis: z.string().max(10000).nullable().optional(),
  technician_id: z.string().uuid().nullable().optional(),
  signature_url: z.string().max(200000).nullable().optional(),
  vin_captured: z.string().trim().max(32).nullable().optional(),
  mileage_captured: z.number().int().min(0).nullable().optional(),
  started_at: z.string().datetime().nullable().optional(),
  completed_at: z.string().datetime().nullable().optional(),
  updated_at: z.string().datetime().optional(),
});

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const workspaceId = new URL(request.url).searchParams.get("workspace_id");
    if (!workspaceId) throw new Error("workspace_id is required");
    const { supabase } = await requireWorkspaceMember(workspaceId);
    const { data, error } = await supabase
      .from("work_orders")
      .select("*,customers(*),vehicles(*),locations(*),work_order_items(*),work_order_assignments(*),work_order_events(*)")
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .single();
    if (error) throw error;
    return json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = patchSchema.parse(await request.json());
    const { supabase, user } = await requireWorkspaceMember(body.workspace_id, ["owner", "admin", "manager", "service_advisor", "dispatcher", "technician"]);

    const { data: current, error: currentError } = await (supabase.from("work_orders") as any)
      .select("status,metadata,appointment_id")
      .eq("workspace_id", body.workspace_id)
      .eq("id", id)
      .single();
    if (currentError) throw currentError;

    if (body.technician_id) {
      const { data: technician, error: technicianError } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", body.workspace_id)
        .eq("user_id", body.technician_id)
        .eq("is_active", true)
        .maybeSingle();
      if (technicianError) throw technicianError;
      if (!technician) return json({ error: { code: "technician_not_found", message: "Assigned technician is not an active workspace member." } }, { status: 409 });
    }

    const metadata = {
      ...object(current.metadata),
      ...(body.signature_url !== undefined ? { signature_url: body.signature_url } : {}),
      ...(body.vin_captured !== undefined ? { vin_captured: body.vin_captured } : {}),
      ...(body.mileage_captured !== undefined ? { mileage_captured: body.mileage_captured } : {}),
      ...(body.started_at !== undefined ? { started_at: body.started_at } : {}),
      ...(body.tech_notes !== undefined ? { tech_notes: body.tech_notes } : {}),
    };

    const patch: Record<string, unknown> = { metadata };
    if (body.status !== undefined) patch.status = body.status;
    if (body.priority !== undefined) patch.priority = body.priority;
    if (body.complaint !== undefined) patch.complaint = body.complaint;
    if (body.diagnosis !== undefined) patch.diagnosis = body.diagnosis;
    if (body.technician_notes !== undefined) patch.technician_notes = body.technician_notes;
    else if (body.tech_notes !== undefined) patch.technician_notes = body.tech_notes;
    if (body.completed_at !== undefined) patch.completed_at = body.completed_at;
    else if (body.status === "completed") patch.completed_at = new Date().toISOString();

    const { data, error } = await (supabase.from("work_orders") as any)
      .update(patch)
      .eq("workspace_id", body.workspace_id)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    if (body.technician_id !== undefined) {
      const assignmentTime = new Date().toISOString();
      await supabase.from("work_order_assignments")
        .update({ unassigned_at: assignmentTime })
        .eq("workspace_id", body.workspace_id)
        .eq("work_order_id", id)
        .is("unassigned_at", null);

      if (body.technician_id) {
        // PK is (work_order_id,user_id). Reactivate a prior same-user assignment
        // instead of inserting a duplicate row when a technician is reassigned.
        const { data: existingAssignment, error: existingAssignmentError } = await supabase
          .from("work_order_assignments")
          .select("work_order_id,user_id")
          .eq("workspace_id", body.workspace_id)
          .eq("work_order_id", id)
          .eq("user_id", body.technician_id)
          .maybeSingle();
        if (existingAssignmentError) throw existingAssignmentError;

        if (existingAssignment) {
          const { error: reactivateError } = await supabase.from("work_order_assignments")
            .update({ assigned_by: user.id, assigned_at: assignmentTime, unassigned_at: null })
            .eq("workspace_id", body.workspace_id)
            .eq("work_order_id", id)
            .eq("user_id", body.technician_id);
          if (reactivateError) throw reactivateError;
        } else {
          const { error: assignmentError } = await supabase.from("work_order_assignments").insert({
            workspace_id: body.workspace_id,
            work_order_id: id,
            user_id: body.technician_id,
            assigned_by: user.id,
            assigned_at: assignmentTime,
          });
          if (assignmentError) throw assignmentError;
        }
      }
    }

    if (body.status && body.status !== current.status) {
      await supabase.from("work_order_events").insert({
        workspace_id: body.workspace_id,
        work_order_id: id,
        actor_user_id: user.id,
        event_type: "status_changed",
        from_status: current.status,
        to_status: body.status,
        payload: {},
      });
    }

    return json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
