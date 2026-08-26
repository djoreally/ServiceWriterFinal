import { json, errorResponse, paginationSchema, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const appointmentSchema = z.object({
  workspace_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  vehicle_id: z.string().uuid().nullable().optional(),
  location_id: z.string().uuid().nullable().optional(),
  assigned_user_id: z.string().uuid().nullable().optional(),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  source: z.string().trim().max(40).default("staff"),
  status: z.string().trim().max(40).default("confirmed"),
  notes: z.string().max(5000).nullable().optional(),
  // Compatibility fields from the preserved frontend. They are intentionally
  // stored in metadata rather than reintroducing legacy appointment columns.
  title: z.string().trim().max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  guest_name: z.string().max(200).nullable().optional(),
  guest_email: z.string().email().max(320).nullable().optional(),
  guest_phone: z.string().max(40).nullable().optional(),
  service_catalog_id: z.string().uuid().nullable().optional(),
  estimated_cost: z.number().nonnegative().nullable().optional(),
  tax_amount: z.number().nonnegative().nullable().optional(),
  location_address: z.string().max(500).nullable().optional(),
  customer_city: z.string().max(120).nullable().optional(),
  customer_state: z.string().max(120).nullable().optional(),
  customer_postal_code: z.string().max(24).nullable().optional(),
}).superRefine((value, ctx) => {
  if (new Date(value.ends_at) <= new Date(value.starts_at)) {
    ctx.addIssue({ code: "custom", path: ["ends_at"], message: "ends_at must be after starts_at" });
  }
});

function compatibilityMetadata(body: z.infer<typeof appointmentSchema>) {
  return {
    title: body.title ?? null,
    description: body.description ?? null,
    guest_name: body.guest_name ?? null,
    guest_email: body.guest_email ?? null,
    guest_phone: body.guest_phone ?? null,
    service_catalog_id: body.service_catalog_id ?? null,
    estimated_cost: body.estimated_cost ?? null,
    tax_amount: body.tax_amount ?? null,
    location_address: body.location_address ?? null,
    customer_city: body.customer_city ?? null,
    customer_state: body.customer_state ?? null,
    customer_postal_code: body.customer_postal_code ?? null,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspace_id");
    if (!workspaceId) throw new Error("workspace_id is required");
    const { supabase } = await requireWorkspaceMember(workspaceId, undefined, request);
    const { limit, offset } = paginationSchema.parse(Object.fromEntries(url.searchParams));
    const { data, error } = await supabase
      .from("appointments")
      .select("*,customers(id,first_name,last_name,email,phone),vehicles(id,customer_id,year,make,model,vin,license_plate,plate_region,color,mileage,notes),locations(id,name)")
      .eq("workspace_id", workspaceId)
      .order("starts_at")
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return json({ data: data ?? [], pagination: { limit, offset } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = appointmentSchema.parse(await request.json());
    const { supabase, user } = await requireWorkspaceMember(body.workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist", "dispatcher"], request);

    const { data: conflicts, error: conflictError } = await supabase
      .from("appointments")
      .select("id")
      .eq("workspace_id", body.workspace_id)
      .neq("status", "cancelled")
      .lt("starts_at", body.ends_at)
      .gt("ends_at", body.starts_at)
      .limit(1);
    if (conflictError) throw conflictError;
    if (conflicts?.length) {
      return json({ error: { code: "schedule_conflict", message: "The requested time overlaps an existing appointment." } }, { status: 409 });
    }

    const { data, error } = await supabase.from("appointments").insert({
      workspace_id: body.workspace_id,
      customer_id: body.customer_id,
      vehicle_id: body.vehicle_id ?? null,
      location_id: body.location_id ?? null,
      assigned_user_id: body.assigned_user_id ?? null,
      starts_at: body.starts_at,
      ends_at: body.ends_at,
      source: body.source,
      status: body.status as any,
      notes: body.notes ?? null,
      created_by: user.id,
      metadata: compatibilityMetadata(body),
    }).select().single();
    if (error) throw error;
    return json({ data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
