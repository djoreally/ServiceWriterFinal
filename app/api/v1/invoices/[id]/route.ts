import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const invoiceStatusInputSchema = z.enum(["draft", "issued", "sent", "partially_paid", "partial", "paid", "void", "past_due"]);
const lineSchema = z.object({
  vehicle_id: z.string().uuid().nullable().optional(),
  service_catalog_id: z.string().uuid().nullable().optional(),
  description: z.string().trim().min(1).max(1000),
  quantity: z.number().positive(),
  unit_price: z.number().nonnegative(),
  tax_rate: z.number().min(0).max(100).optional(),
  display_order: z.number().int().min(0).optional(),
  vin: z.string().max(40).nullable().optional(),
  vehicle_year: z.number().int().min(1880).max(2200).nullable().optional(),
  vehicle_make: z.string().max(120).nullable().optional(),
  vehicle_model: z.string().max(120).nullable().optional(),
  vehicle_trim: z.string().max(120).nullable().optional(),
  vehicle_engine: z.string().max(120).nullable().optional(),
  oil_type: z.string().max(120).nullable().optional(),
  oil_capacity: z.string().max(40).nullable().optional(),
  oil_filter: z.string().max(120).nullable().optional(),
  vehicle_mileage: z.number().int().min(0).nullable().optional(),
  license_plate: z.string().max(40).nullable().optional(),
  odometer_measure: z.string().max(20).nullable().optional(),
});

const patchSchema = z.object({
  workspace_id: z.string().uuid(),
  customer_id: z.string().uuid().optional(),
  vehicle_id: z.string().uuid().nullable().optional(),
  work_order_id: z.string().uuid().nullable().optional(),
  status: invoiceStatusInputSchema.optional(),
  due_date: z.string().date().nullable().optional(),
  issue_date: z.string().date().nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
  contact_name: z.string().max(200).nullable().optional(),
  contact_email: z.string().email().max(320).nullable().optional(),
  contact_phone: z.string().max(40).nullable().optional(),
  payment_terms: z.string().max(120).nullable().optional(),
  terms_text: z.string().max(10000).nullable().optional(),
  subtotal: z.number().nonnegative().optional(),
  tax_amount: z.number().nonnegative().optional(),
  total: z.number().nonnegative().optional(),
  line_items: z.array(lineSchema).max(500).optional(),
}).refine((value) => Object.keys(value).some((key) => key !== "workspace_id"), {
  message: "At least one invoice field is required",
});

function isoDate(value?: string | null): string | null | undefined {
  if (value === undefined) return undefined;
  return value ? new Date(`${value}T00:00:00.000Z`).toISOString() : null;
}

function canonicalStatus(value?: z.infer<typeof invoiceStatusInputSchema>) {
  if (value === "sent") return "issued";
  if (value === "partial") return "partially_paid";
  return value;
}

function mergeMetadata(current: unknown, patch: Record<string, unknown>) {
  const base = current && typeof current === "object" && !Array.isArray(current) ? current as Record<string, unknown> : {};
  return { ...base, ...patch };
}

function lineRows(items: z.infer<typeof lineSchema>[]) {
  return items.map((item, index) => ({
    vehicle_id: item.vehicle_id ?? null,
    service_catalog_id: item.service_catalog_id ?? null,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unit_price,
    tax_rate: item.tax_rate ?? 0,
    sort_order: item.display_order ?? index,
    metadata: {
      vin: item.vin ?? null,
      vehicle_year: item.vehicle_year ?? null,
      vehicle_make: item.vehicle_make ?? null,
      vehicle_model: item.vehicle_model ?? null,
      vehicle_trim: item.vehicle_trim ?? null,
      vehicle_engine: item.vehicle_engine ?? null,
      oil_type: item.oil_type ?? null,
      oil_capacity: item.oil_capacity ?? null,
      oil_filter: item.oil_filter ?? null,
      vehicle_mileage: item.vehicle_mileage ?? null,
      license_plate: item.license_plate ?? null,
      odometer_measure: item.odometer_measure ?? null,
    },
  }));
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const { supabase } = await requireWorkspaceMember(workspaceId);
    const { data, error } = await supabase
      .from("invoices")
      .select("*, invoice_lines(*), customers(id,first_name,last_name,company_name,email,phone,address_line1,address_line2,city,region,postal_code,metadata), vehicles(id,year,make,model,vin,license_plate)")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .single();
    if (error) throw error;
    return json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const body = patchSchema.parse(await request.json());
    const normalizedStatus = canonicalStatus(body.status);
    const { supabase } = await requireWorkspaceMember(body.workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist"]);

    const { data: current, error: currentError } = await supabase
      .from("invoices")
      .select("id,status,metadata")
      .eq("id", id)
      .eq("workspace_id", body.workspace_id)
      .single();
    if (currentError || !current) throw currentError ?? new Error("Invoice not found");

    if (body.line_items !== undefined && current.status !== "draft") {
      return json({ error: { code: "invoice_locked", message: "Line items can only be replaced while an invoice is draft." } }, { status: 409 });
    }

    const metadataPatch: Record<string, unknown> = {};
    for (const key of ["notes", "contact_name", "contact_email", "contact_phone", "payment_terms", "terms_text"] as const) {
      if (body[key] !== undefined) metadataPatch[key] = body[key];
    }

    const patch: Record<string, unknown> = {};
    if (body.customer_id !== undefined) patch.customer_id = body.customer_id;
    if (body.vehicle_id !== undefined) patch.vehicle_id = body.vehicle_id;
    if (body.work_order_id !== undefined) patch.work_order_id = body.work_order_id;
    if (normalizedStatus !== undefined) patch.status = normalizedStatus;
    if (body.subtotal !== undefined) patch.subtotal = body.subtotal;
    if (body.tax_amount !== undefined) patch.tax_total = body.tax_amount;
    if (body.total !== undefined) patch.total = body.total;
    if (body.due_date !== undefined) patch.due_at = isoDate(body.due_date);
    if (body.issue_date !== undefined) patch.issued_at = isoDate(body.issue_date);
    if (normalizedStatus === "issued" && body.issue_date === undefined && current.status === "draft") patch.issued_at = new Date().toISOString();
    if (Object.keys(metadataPatch).length) patch.metadata = mergeMetadata(current.metadata, metadataPatch);

    if (body.line_items !== undefined) {
      const { error: atomicError } = await (supabase as any).rpc("patch_draft_invoice_v1", {
        p_workspace_id: body.workspace_id,
        p_invoice_id: id,
        p_patch: patch,
        p_lines: lineRows(body.line_items),
      });
      if (atomicError) throw atomicError;

      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("workspace_id", body.workspace_id)
        .eq("id", id)
        .single();
      if (error) throw error;
      return json({ data });
    }

    const { data, error } = await (supabase.from("invoices") as any)
      .update(patch)
      .eq("id", id)
      .eq("workspace_id", body.workspace_id)
      .select()
      .single();
    if (error) throw error;
    return json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const { supabase } = await requireWorkspaceMember(workspaceId, ["owner", "admin", "manager"]);
    const { data, error } = await supabase
      .from("invoices")
      .update({ status: "void" })
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .select()
      .single();
    if (error) throw error;
    return json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
