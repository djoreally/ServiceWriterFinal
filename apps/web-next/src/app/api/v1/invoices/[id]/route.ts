import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const patchSchema = z.object({
  workspace_id: z.string().uuid(),
  status: z.string().max(40).optional(),
  due_date: z.string().date().nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
  amount_paid: z.number().nonnegative().optional(),
  paid_at: z.string().datetime().nullable().optional(),
  contact_name: z.string().max(200).nullable().optional(),
  contact_email: z.string().email().max(320).nullable().optional(),
  contact_phone: z.string().max(40).nullable().optional(),
  subtotal: z.number().nonnegative().optional(),
  tax_amount: z.number().nonnegative().optional(),
  total: z.number().nonnegative().optional(),
  line_items: z.array(z.object({ vehicle_id: z.string().uuid().nullable().optional(), service_catalog_id: z.string().uuid().nullable().optional(), description: z.string().min(1).max(1000), quantity: z.number().positive(), unit_price: z.number().nonnegative(), display_order: z.number().int().min(0).optional(), vin: z.string().max(40).nullable().optional(), vehicle_year: z.number().int().min(1880).max(2200).nullable().optional(), vehicle_make: z.string().max(120).nullable().optional(), vehicle_model: z.string().max(120).nullable().optional(), vehicle_trim: z.string().max(120).nullable().optional(), vehicle_engine: z.string().max(120).nullable().optional(), oil_type: z.string().max(120).nullable().optional(), oil_capacity: z.string().max(40).nullable().optional(), oil_filter: z.string().max(120).nullable().optional(), vehicle_mileage: z.number().int().min(0).nullable().optional(), license_plate: z.string().max(40).nullable().optional(), odometer_measure: z.string().max(20).nullable().optional() })).optional(),
}).refine((value) => Object.keys(value).some((key) => key !== "workspace_id"), { message: "At least one invoice field is required" });

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const { supabase, user } = await requireWorkspaceMember(workspaceId);
    const { data, error } = await supabase.from("invoices").select("*").eq("id", id).eq("user_id", user.id).is("deleted_at", null).single();
    if (error) throw error;
    return json({ data });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const body = patchSchema.parse(await request.json());
    const { workspace_id, line_items, ...patch } = body;
    const { supabase, user } = await requireWorkspaceMember(workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist"]);
    const { data, error } = await supabase.from("invoices").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id).is("deleted_at", null).select().single();
    if (error) throw error;
    if (line_items) {
      const { error: deleteError } = await supabase.from("invoice_line_items").update({ deleted_at: new Date().toISOString(), deleted_by: user.id, deleted_reason: "replaced_on_update" }).eq("invoice_id", id).eq("user_id", user.id).is("deleted_at", null);
      if (deleteError) throw deleteError;
      if (line_items.length) {
        const { error: insertError } = await supabase.from("invoice_line_items").insert(line_items.map((item) => ({ ...item, invoice_id: id, user_id: user.id, line_total: item.quantity * item.unit_price })));
        if (insertError) throw insertError;
      }
    }
    return json({ data });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const { supabase, user } = await requireWorkspaceMember(workspaceId, ["owner", "admin", "manager"]);
    const { data, error } = await supabase.from("invoices").update({ deleted_at: new Date().toISOString(), deleted_by: user.id, deleted_reason: "user_requested" }).eq("id", id).eq("user_id", user.id).is("deleted_at", null).select().single();
    if (error) throw error;
    return json({ data });
  } catch (error) { return errorResponse(error); }
}
