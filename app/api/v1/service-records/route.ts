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
});

function uuidFromMetadata(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

function numberFromMetadata(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function mergeMetadata(current: unknown, incoming: Record<string, unknown>): Record<string, unknown> {
  const base = current && typeof current === "object" && !Array.isArray(current)
    ? current as Record<string, unknown>
    : {};
  return { ...base, ...incoming };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspace_id");
    if (!workspaceId) throw new Error("workspace_id is required");
    const { supabase } = await requireWorkspaceMember(workspaceId);
    const { limit, offset } = paginationSchema.parse(Object.fromEntries(url.searchParams));
    const { data, error } = await supabase
      .from("service_records")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return json({ data: data ?? [], pagination: { limit, offset } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = serviceRecordSchema.parse(await request.json());
    const { supabase, user } = await requireWorkspaceMember(body.workspace_id, ["owner", "admin", "manager", "service_advisor", "dispatcher", "technician"]);
    const now = new Date().toISOString();
    const meta = body.metadata ?? {};

    const customerId = body.customer_id ?? uuidFromMetadata(meta.customer_id);
    const vehicleId = body.vehicle_id ?? uuidFromMetadata(meta.vehicle_id);
    const laborCost = numberFromMetadata(meta.labor_cost) ?? 0;
    const partsCost = numberFromMetadata(meta.parts_cost) ?? 0;
    const shopSupplies = numberFromMetadata(meta.shop_supplies) ?? 0;
    const promotedSubtotal = body.subtotal ?? Number((laborCost + partsCost + shopSupplies).toFixed(2));
    const promotedTaxRate = body.tax_rate ?? numberFromMetadata(meta.tax_rate);
    const promotedTaxAmount = body.tax_amount ?? numberFromMetadata(meta.tax_amount);
    const promotedDiscount = body.discount_amount ?? numberFromMetadata(meta.discount_amount);
    const promotedTotal = body.total_amount ?? numberFromMetadata(meta.total_cost);

    if (customerId) {
      const { data: customer, error: customerError } = await supabase
        .from("customers").select("id").eq("workspace_id", body.workspace_id).eq("id", customerId).maybeSingle();
      if (customerError) throw customerError;
      if (!customer) return json({ error: { code: "customer_not_found", message: "Customer does not belong to this workspace." } }, { status: 409 });
    }
    if (vehicleId) {
      const { data: vehicle, error: vehicleError } = await supabase
        .from("vehicles").select("id,customer_id").eq("workspace_id", body.workspace_id).eq("id", vehicleId).maybeSingle();
      if (vehicleError) throw vehicleError;
      if (!vehicle) return json({ error: { code: "vehicle_not_found", message: "Vehicle does not belong to this workspace." } }, { status: 409 });
      if (customerId && vehicle.customer_id && vehicle.customer_id !== customerId) {
        return json({ error: { code: "vehicle_customer_mismatch", message: "Vehicle does not belong to the selected customer." } }, { status: 409 });
      }
    }

    const payload = {
      ...body,
      customer_id: customerId,
      vehicle_id: vehicleId,
      subtotal: promotedSubtotal,
      tax_rate: promotedTaxRate,
      tax_amount: promotedTaxAmount,
      discount_amount: promotedDiscount,
      total_amount: promotedTotal,
      completed_by: body.status === "completed" ? user.id : null,
      completed_at: body.status === "completed" ? body.completed_at ?? now : body.completed_at ?? null,
    };

    // Appointment completion already creates a service record transactionally.
    // If an older client tries to create again, enrich/reuse that row instead of duplicating history.
    if (body.appointment_id) {
      const { data: existing, error: existingError } = await supabase
        .from("service_records")
        .select("id,metadata")
        .eq("workspace_id", body.workspace_id)
        .eq("appointment_id", body.appointment_id)
        .neq("status", "voided")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        const { data, error } = await (supabase.from("service_records") as any)
          .update({ ...payload, metadata: mergeMetadata(existing.metadata, meta) })
          .eq("workspace_id", body.workspace_id)
          .eq("id", existing.id)
          .select()
          .single();
        if (error) throw error;
        return json({ data, reused: true });
      }
    }

    const { data, error } = await supabase.from("service_records").insert(payload).select().single();
    if (error) throw error;
    return json({ data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
