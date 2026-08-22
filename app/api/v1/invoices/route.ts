import { errorResponse, json, paginationSchema, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const invoiceSchema = z.object({
  workspace_id: z.string().uuid(),
  invoice_number: z.string().trim().min(1).max(80),
  bill_to_type: z.string().trim().max(40),
  customer_id: z.string().uuid().nullable().optional(),
  fleet_client_id: z.string().uuid().nullable().optional(),
  contact_name: z.string().max(200).nullable().optional(),
  contact_email: z.string().email().max(320).nullable().optional(),
  contact_phone: z.string().max(40).nullable().optional(),
  issue_date: z.string().date().optional(),
  due_date: z.string().date().nullable().optional(),
  status: z.string().max(40).default("draft"),
  subtotal: z.number().nonnegative().default(0),
  tax_amount: z.number().nonnegative().default(0),
  total: z.number().nonnegative().default(0),
  notes: z.string().max(10000).nullable().optional(),
  payment_terms: z.string().max(120).nullable().optional(),
  terms_text: z.string().max(10000).nullable().optional(),
  line_items: z.array(z.object({ vehicle_id: z.string().uuid().nullable().optional(), service_catalog_id: z.string().uuid().nullable().optional(), description: z.string().min(1).max(1000), quantity: z.number().positive(), unit_price: z.number().nonnegative(), display_order: z.number().int().min(0).optional(), vin: z.string().max(40).nullable().optional(), vehicle_year: z.number().int().min(1880).max(2200).nullable().optional(), vehicle_make: z.string().max(120).nullable().optional(), vehicle_model: z.string().max(120).nullable().optional(), vehicle_trim: z.string().max(120).nullable().optional(), vehicle_engine: z.string().max(120).nullable().optional(), oil_type: z.string().max(120).nullable().optional(), oil_capacity: z.string().max(40).nullable().optional(), oil_filter: z.string().max(120).nullable().optional(), vehicle_mileage: z.number().int().min(0).nullable().optional(), license_plate: z.string().max(40).nullable().optional(), odometer_measure: z.string().max(20).nullable().optional() })).max(500).default([]),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = z.string().uuid().parse(url.searchParams.get("workspace_id"));
    const { supabase, user } = await requireWorkspaceMember(workspaceId);
    const { limit, offset } = paginationSchema.parse(Object.fromEntries(url.searchParams));
    const { data, error } = await supabase.from("invoices").select("*").eq("user_id", user.id).is("deleted_at", null).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw error;
    return json({ data: data ?? [], pagination: { limit, offset } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const body = invoiceSchema.parse(await request.json());
    const { workspace_id, ...payload } = body;
    const { supabase, user } = await requireWorkspaceMember(workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist"]);
    const { line_items, ...header } = payload;
    const { data, error } = await supabase.from("invoices").insert({ ...header, user_id: user.id }).select().single();
    if (error || !data) throw error ?? new Error("Failed to create invoice");
    if (line_items.length) {
      const { error: lineError } = await supabase.from("invoice_line_items").insert(line_items.map((item) => ({ ...item, invoice_id: data.id, user_id: user.id, line_total: item.quantity * item.unit_price })));
      if (lineError) throw lineError;
    }
    return json({ data }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
