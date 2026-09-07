import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const idSchema = z.string().uuid();
const updateSchema = z.object({
  workspace_id: z.string().uuid(),
  customer_id: z.string().uuid().nullable().optional(),
  vehicle_id: z.string().uuid().nullable().optional(),
  work_order_id: z.string().uuid().nullable().optional(),
  technician_id: z.string().uuid().nullable().optional(),
  quote_id: z.string().uuid().nullable().optional(),
  status: z.enum(["draft", "in_progress", "completed", "voided"]).optional(),
  complaint: z.string().max(10000).nullable().optional(),
  diagnosis: z.string().max(10000).nullable().optional(),
  work_performed: z.string().max(20000).nullable().optional(),
  oil_quarts_used: z.number().finite().min(0).max(1000).nullable().optional(),
  customer_notes: z.string().max(10000).nullable().optional(),
  internal_notes: z.string().max(10000).nullable().optional(),
  subtotal: z.number().nonnegative().nullable().optional(),
  tax_rate: z.number().min(0).max(100).nullable().optional(),
  tax_amount: z.number().nonnegative().nullable().optional(),
  discount_amount: z.number().nonnegative().nullable().optional(),
  total_amount: z.number().nonnegative().nullable().optional(),
  currency_code: z.string().trim().length(3).toUpperCase().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  started_at: z.string().datetime().nullable().optional(),
  completed_at: z.string().datetime().nullable().optional(),
}).strict();

function hasOwn(value: object, key: string) { return Object.prototype.hasOwnProperty.call(value, key); }

async function validateTargetReferences(supabase: any, workspaceId: string, target: { customer_id: string | null; vehicle_id: string | null; work_order_id: string | null; quote_id: string | null; technician_id: string | null }) {
  if (target.customer_id) {
    const { data, error } = await supabase.from("customers").select("id,status").eq("workspace_id", workspaceId).eq("id", target.customer_id).maybeSingle();
    if (error) throw error;
    if (!data || data.status === "archived") return json({ error: { code: "customer_not_found", message: "Customer does not belong to this workspace." } }, { status: 409 });
  }
  if (target.vehicle_id) {
    const { data, error } = await supabase.from("vehicles").select("id,customer_id,status").eq("workspace_id", workspaceId).eq("id", target.vehicle_id).maybeSingle();
    if (error) throw error;
    if (!data || data.status === "archived") return json({ error: { code: "vehicle_not_found", message: "Vehicle does not belong to this workspace." } }, { status: 409 });
    if (target.customer_id && data.customer_id && data.customer_id !== target.customer_id) return json({ error: { code: "vehicle_customer_mismatch", message: "Vehicle does not belong to the selected customer." } }, { status: 409 });
  }
  for (const [table, id, label] of [["work_orders", target.work_order_id, "work_order"], ["quotes", target.quote_id, "quote"]] as const) {
    if (!id) continue;
    const { data, error } = await supabase.from(table).select("id,customer_id,vehicle_id").eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return json({ error: { code: `${label}_not_found`, message: `Referenced ${label.replace("_", " ")} does not belong to this workspace.` } }, { status: 409 });
    if (target.customer_id && data.customer_id && data.customer_id !== target.customer_id) return json({ error: { code: "source_customer_mismatch", message: "Referenced source belongs to a different customer." } }, { status: 409 });
    if (target.vehicle_id && data.vehicle_id && data.vehicle_id !== target.vehicle_id) return json({ error: { code: "source_vehicle_mismatch", message: "Referenced source belongs to a different vehicle." } }, { status: 409 });
  }
  if (target.technician_id) {
    const { data, error } = await supabase.from("workspace_members").select("user_id,is_active").eq("workspace_id", workspaceId).eq("user_id", target.technician_id).maybeSingle();
    if (error) throw error;
    if (!data?.is_active) return json({ error: { code: "technician_not_found", message: "Technician is not an active member of this workspace." } }, { status: 409 });
  }
  return null;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = idSchema.parse((await context.params).id);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const { supabase } = await requireWorkspaceMember(workspaceId, undefined, request);
    const { data, error } = await supabase.from("service_records").select("*").eq("workspace_id", workspaceId).eq("id", id).single();
    if (error) throw error;
    return json({ data });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = idSchema.parse((await context.params).id);
    const body = updateSchema.parse(await request.json());
    const { supabase, user } = await requireWorkspaceMember(body.workspace_id, ["owner", "admin", "manager", "service_advisor", "dispatcher", "technician"], request);
    const { workspace_id, ...updates } = body;

    const { data: current, error: currentError } = await supabase.from("service_records").select("id,customer_id,vehicle_id,work_order_id,quote_id,technician_id,subtotal,tax_amount,discount_amount,total_amount,status,metadata").eq("workspace_id", workspace_id).eq("id", id).single();
    if (currentError) throw currentError;

    const target = {
      customer_id: hasOwn(updates, "customer_id") ? updates.customer_id ?? null : current.customer_id ?? null,
      vehicle_id: hasOwn(updates, "vehicle_id") ? updates.vehicle_id ?? null : current.vehicle_id ?? null,
      work_order_id: hasOwn(updates, "work_order_id") ? updates.work_order_id ?? null : current.work_order_id ?? null,
      quote_id: hasOwn(updates, "quote_id") ? updates.quote_id ?? null : current.quote_id ?? null,
      technician_id: hasOwn(updates, "technician_id") ? updates.technician_id ?? null : current.technician_id ?? null,
    };
    const refError = await validateTargetReferences(supabase, workspace_id, target);
    if (refError) return refError;

    const subtotal = updates.subtotal ?? current.subtotal;
    const discount = updates.discount_amount ?? current.discount_amount ?? 0;
    const taxAmount = updates.tax_amount ?? current.tax_amount ?? 0;
    const total = updates.total_amount ?? current.total_amount;
    if (subtotal != null && discount > subtotal) return json({ error: { code: "discount_exceeds_subtotal", message: "Discount cannot exceed subtotal." } }, { status: 400 });
    if (subtotal != null && total != null) {
      const expected = Number((Number(subtotal) - Number(discount) + Number(taxAmount)).toFixed(2));
      if (Math.abs(Number(total) - expected) > 0.01) return json({ error: { code: "financial_math_mismatch", message: "Service record total does not match subtotal, discount, and tax." } }, { status: 400 });
    }

    const payload = {
      ...updates,
      ...(updates.status === "completed" ? { completed_by: user.id, completed_at: updates.completed_at ?? new Date().toISOString() } : {}),
      ...(updates.status && updates.status !== "completed" && hasOwn(updates, "completed_at") ? {} : {}),
    };
    const { data, error } = await supabase.from("service_records").update(payload).eq("workspace_id", workspace_id).eq("id", id).select().single();
    if (error) throw error;
    return json({ data });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = idSchema.parse((await context.params).id);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const { supabase, user } = await requireWorkspaceMember(workspaceId, ["owner", "admin", "manager", "service_advisor"], request);
    const { data: current, error: currentError } = await supabase.from("service_records").select("id,status,metadata").eq("workspace_id", workspaceId).eq("id", id).single();
    if (currentError || !current) throw currentError ?? new Error("Service record not found");
    const metadata = current.metadata && typeof current.metadata === "object" ? current.metadata as Record<string, unknown> : {};
    const { data, error } = await (supabase.from("service_records") as any).update({ status: "voided", metadata: { ...metadata, voided_at: new Date().toISOString(), voided_by: user.id } }).eq("workspace_id", workspaceId).eq("id", id).select("id,status").single();
    if (error) throw error;
    return json({ data });
  } catch (error) { return errorResponse(error); }
}
