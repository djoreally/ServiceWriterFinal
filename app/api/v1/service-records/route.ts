import { json, errorResponse, paginationSchema, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const serviceRecordSchema = z.object({
  workspace_id: z.string().uuid(),
  appointment_id: z.string().uuid().nullable().optional(),
  work_order_id: z.string().uuid().nullable().optional(),
  customer_id: z.string().uuid().nullable().optional(),
  vehicle_id: z.string().uuid().nullable().optional(),
  technician_id: z.string().uuid().nullable().optional(),
  quote_id: z.string().uuid().nullable().optional(),
  status: z.enum(["draft", "in_progress", "completed", "voided"]).default("completed"),
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
  metadata: z.record(z.string(), z.unknown()).default({}),
  started_at: z.string().datetime().nullable().optional(),
  completed_at: z.string().datetime().nullable().optional(),
}).strict();

type RefBody = z.infer<typeof serviceRecordSchema>;

function uuidFromMetadata(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
}
function numberFromMetadata(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function mergeMetadata(current: unknown, incoming: Record<string, unknown>): Record<string, unknown> {
  const base = current && typeof current === "object" && !Array.isArray(current) ? current as Record<string, unknown> : {};
  return { ...base, ...incoming };
}

async function resolveReferences(supabase: any, body: RefBody): Promise<{ customerId: string | null; vehicleId: string | null } | { error: Response }> {
  let customerId = body.customer_id ?? uuidFromMetadata(body.metadata.customer_id);
  let vehicleId = body.vehicle_id ?? uuidFromMetadata(body.metadata.vehicle_id);
  const sourceRefs = [
    body.appointment_id ? ["appointments", body.appointment_id, "appointment"] as const : null,
    body.work_order_id ? ["work_orders", body.work_order_id, "work_order"] as const : null,
    body.quote_id ? ["quotes", body.quote_id, "quote"] as const : null,
  ].filter(Boolean) as Array<readonly [string, string, string]>;

  for (const [table, id, label] of sourceRefs) {
    const { data, error } = await supabase.from(table).select("id,customer_id,vehicle_id").eq("workspace_id", body.workspace_id).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return { error: json({ error: { code: `${label}_not_found`, message: `Referenced ${label.replace("_", " ")} does not belong to this workspace.` } }, { status: 409 }) };
    if (customerId && data.customer_id && customerId !== data.customer_id) return { error: json({ error: { code: "source_customer_mismatch", message: "Referenced source belongs to a different customer." } }, { status: 409 }) };
    if (vehicleId && data.vehicle_id && vehicleId !== data.vehicle_id) return { error: json({ error: { code: "source_vehicle_mismatch", message: "Referenced source belongs to a different vehicle." } }, { status: 409 }) };
    customerId ??= data.customer_id ?? null;
    vehicleId ??= data.vehicle_id ?? null;
  }

  if (customerId) {
    const { data, error } = await supabase.from("customers").select("id,status").eq("workspace_id", body.workspace_id).eq("id", customerId).maybeSingle();
    if (error) throw error;
    if (!data || data.status === "archived") return { error: json({ error: { code: "customer_not_found", message: "Customer does not belong to this workspace." } }, { status: 409 }) };
  }
  if (vehicleId) {
    const { data, error } = await supabase.from("vehicles").select("id,customer_id,status").eq("workspace_id", body.workspace_id).eq("id", vehicleId).maybeSingle();
    if (error) throw error;
    if (!data || data.status === "archived") return { error: json({ error: { code: "vehicle_not_found", message: "Vehicle does not belong to this workspace." } }, { status: 409 }) };
    if (customerId && data.customer_id && data.customer_id !== customerId) return { error: json({ error: { code: "vehicle_customer_mismatch", message: "Vehicle does not belong to the selected customer." } }, { status: 409 }) };
  }
  if (body.technician_id) {
    const { data, error } = await supabase.from("workspace_members").select("user_id,is_active").eq("workspace_id", body.workspace_id).eq("user_id", body.technician_id).maybeSingle();
    if (error) throw error;
    if (!data?.is_active) return { error: json({ error: { code: "technician_not_found", message: "Technician is not an active member of this workspace." } }, { status: 409 }) };
  }
  return { customerId, vehicleId };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = z.string().uuid().parse(url.searchParams.get("workspace_id"));
    const { supabase } = await requireWorkspaceMember(workspaceId, undefined, request);
    const { limit, offset } = paginationSchema.parse(Object.fromEntries(url.searchParams));
    const { data, error } = await supabase.from("service_records").select("*").eq("workspace_id", workspaceId).order("completed_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw error;
    return json({ data: data ?? [], pagination: { limit, offset } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const body = serviceRecordSchema.parse(await request.json());
    const { supabase, user } = await requireWorkspaceMember(body.workspace_id, ["owner", "admin", "manager", "service_advisor", "dispatcher", "technician"], request);
    const refs = await resolveReferences(supabase, body);
    if ("error" in refs) return refs.error;

    const meta = body.metadata ?? {};
    const laborCost = numberFromMetadata(meta.labor_cost) ?? 0;
    const partsCost = numberFromMetadata(meta.parts_cost) ?? 0;
    const shopSupplies = numberFromMetadata(meta.shop_supplies) ?? 0;
    const subtotal = body.subtotal ?? Number((laborCost + partsCost + shopSupplies).toFixed(2));
    const discount = body.discount_amount ?? numberFromMetadata(meta.discount_amount) ?? 0;
    if (discount > subtotal) return json({ error: { code: "discount_exceeds_subtotal", message: "Discount cannot exceed subtotal." } }, { status: 400 });
    const taxRate = body.tax_rate ?? numberFromMetadata(meta.tax_rate);
    const taxAmount = body.tax_amount ?? numberFromMetadata(meta.tax_amount) ?? (taxRate == null ? 0 : Number(((subtotal - discount) * taxRate / 100).toFixed(2)));
    const expectedTotal = Number((subtotal - discount + taxAmount).toFixed(2));
    const total = body.total_amount ?? numberFromMetadata(meta.total_cost) ?? expectedTotal;
    if (Math.abs(total - expectedTotal) > 0.01) return json({ error: { code: "financial_math_mismatch", message: "Service record total does not match subtotal, discount, and tax." } }, { status: 400 });

    const now = new Date().toISOString();
    const payload = { ...body, customer_id: refs.customerId, vehicle_id: refs.vehicleId, subtotal, tax_rate: taxRate, tax_amount: taxAmount, discount_amount: discount, total_amount: total, completed_by: body.status === "completed" ? user.id : null, completed_at: body.status === "completed" ? body.completed_at ?? now : body.completed_at ?? null };

    if (body.appointment_id) {
      const { data: existing, error: existingError } = await supabase.from("service_records").select("id,metadata").eq("workspace_id", body.workspace_id).eq("appointment_id", body.appointment_id).neq("status", "voided").order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        const { data, error } = await (supabase.from("service_records") as any).update({ ...payload, metadata: mergeMetadata(existing.metadata, meta) }).eq("workspace_id", body.workspace_id).eq("id", existing.id).select().single();
        if (error) throw error;
        return json({ data, reused: true });
      }
    }
    const { data, error } = await supabase.from("service_records").insert(payload).select().single();
    if (error) throw error;
    return json({ data }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
