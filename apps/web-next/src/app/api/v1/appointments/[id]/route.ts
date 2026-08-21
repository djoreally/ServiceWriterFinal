import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const patchSchema = z.object({
  workspace_id: z.string().uuid(),
  title: z.string().trim().min(1).max(200).optional(),
  scheduled_date: z.string().date().optional(),
  scheduled_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  duration_minutes: z.number().int().min(5).max(1440).optional(),
  status: z.string().trim().max(40).optional(),
  notes: z.string().max(5000).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  guest_name: z.string().max(200).nullable().optional(),
  guest_email: z.string().email().max(320).nullable().optional(),
  guest_phone: z.string().max(40).nullable().optional(),
  estimated_cost: z.number().nonnegative().nullable().optional(),
  tax_amount: z.number().nonnegative().nullable().optional(),
  location_address: z.string().max(500).nullable().optional(),
  customer_city: z.string().max(120).nullable().optional(),
  customer_state: z.string().max(120).nullable().optional(),
  customer_postal_code: z.string().max(24).nullable().optional(),
  customer_id: z.string().uuid().nullable().optional(),
  vehicle_id: z.string().uuid().nullable().optional(),
}).refine((value) => Object.keys(value).some((key) => key !== "workspace_id"), { message: "At least one appointment field is required" });

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const { supabase } = await requireWorkspaceMember(workspaceId);
    const { data, error } = await supabase.from("appointments").select("*").eq("workspace_id", workspaceId).eq("id", id).single();
    if (error) throw error;
    return json({ data });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const body = patchSchema.parse(await request.json());
    const { workspace_id, ...patch } = body;
    const { supabase } = await requireWorkspaceMember(workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist", "dispatcher"]);
    const { data: current, error: currentError } = await supabase.from("appointments").select("id, starts_at, ends_at").eq("id", id).eq("workspace_id", workspace_id).single();
    if (currentError || !current) throw currentError ?? new Error("Appointment was not found in this workspace.");
    if (patch.scheduled_date || patch.scheduled_time || patch.duration_minutes) {
      const date = patch.scheduled_date ?? current.starts_at.slice(0, 10);
      const time = patch.scheduled_time ?? current.starts_at.slice(11, 19);
      const startsAt = new Date(`${date}T${time}`);
      const endsAt = new Date(startsAt.getTime() + (patch.duration_minutes ?? 60) * 60000);
      const { data: conflicts, error: conflictError } = await supabase.from("appointments").select("id").eq("workspace_id", workspace_id).neq("id", id).neq("status", "cancelled").lt("starts_at", endsAt.toISOString()).gt("ends_at", startsAt.toISOString()).limit(1);
      if (conflictError) throw conflictError;
      if (conflicts?.length) return json({ error: { code: "schedule_conflict", message: "The requested time overlaps an existing appointment." } }, { status: 409 });
      Object.assign(patch, { starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() });
      delete patch.scheduled_date; delete patch.scheduled_time;
    }
    const { data, error } = await supabase.from("appointments").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", workspace_id).select().single();
    if (error) throw error;
    return json({ data });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const { supabase } = await requireWorkspaceMember(workspaceId, ["owner", "admin", "manager", "service_advisor", "receptionist", "dispatcher"]);
    const { data, error } = await supabase.from("appointments").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", workspaceId).select().single();
    if (error) throw error;
    return json({ data });
  } catch (error) { return errorResponse(error); }
}
