import { ApiError, json, errorResponse, requireWorkspaceMember } from "@/server/api";
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

const TECHNICIAN_FIELDS = new Set([
  "workspace_id",
  "status",
  "technician_notes",
  "tech_notes",
  "diagnosis",
  "signature_url",
  "vin_captured",
  "mileage_captured",
  "started_at",
  "completed_at",
  "updated_at",
]);

const TECHNICIAN_STATUSES = new Set(["in_progress", "waiting_for_parts", "awaiting_approval", "completed"]);

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const workspaceId = new URL(request.url).searchParams.get("workspace_id");
    if (!workspaceId) throw new Error("workspace_id is required");
    const { supabase } = await requireWorkspaceMember(workspaceId, undefined, request);
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
    const { supabase, user, membership } = await requireWorkspaceMember(
      body.workspace_id,
      ["owner", "admin", "manager", "service_advisor", "dispatcher", "technician"],
      request,
    );

    if (membership.role === "technician") {
      const requestedFields = Object.keys(body);
      const forbiddenField = requestedFields.find((field) => !TECHNICIAN_FIELDS.has(field));
      if (forbiddenField) {
        throw new ApiError(403, `Technicians cannot change ${forbiddenField}`, "technician_field_forbidden");
      }
      if (body.status && !TECHNICIAN_STATUSES.has(body.status)) {
        throw new ApiError(403, "Technicians cannot set this work order status", "technician_status_forbidden");
      }

      const { data: assignment, error: assignmentError } = await supabase
        .from("work_order_assignments")
        .select("work_order_id")
        .eq("workspace_id", body.workspace_id)
        .eq("work_order_id", id)
        .eq("user_id", user.id)
        .is("unassigned_at", null)
        .maybeSingle();
      if (assignmentError) throw assignmentError;
      if (!assignment) {
        throw new ApiError(403, "Technicians may only update work orders actively assigned to them", "technician_assignment_required");
      }
    }

    const { workspace_id, updated_at: _ignoredOptimisticHint, ...patch } = body;

    const { error } = await (supabase as any).rpc("patch_work_order_v1", {
      p_workspace_id: workspace_id,
      p_work_order_id: id,
      p_patch: patch,
    });
    if (error) throw error;

    const { data, error: readError } = await supabase
      .from("work_orders")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("id", id)
      .single();
    if (readError) throw readError;
    return json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
