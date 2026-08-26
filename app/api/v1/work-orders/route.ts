import { json, errorResponse, paginationSchema, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const workOrderSchema = z.object({
  workspace_id: z.string().uuid(),
  appointment_id: z.string().uuid().nullable().optional(),
  customer_id: z.string().uuid(),
  vehicle_id: z.string().uuid().nullable().optional(),
  location_id: z.string().uuid().nullable().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  complaint: z.string().max(10000).optional(),
  diagnosis: z.string().max(10000).nullable().optional(),
  technician_notes: z.string().max(10000).nullable().optional(),
  location_address: z.string().max(500).nullable().optional(),
  location_lat: z.number().finite().nullable().optional(),
  location_lng: z.number().finite().nullable().optional(),
  technician_id: z.string().uuid().nullable().optional(),
  van_id: z.string().uuid().nullable().optional(),
  customer_notes: z.string().max(10000).nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspace_id");
    if (!workspaceId) throw new Error("workspace_id is required");
    const { supabase, user } = await requireWorkspaceMember(workspaceId, undefined, request);
    const { limit, offset } = paginationSchema.parse(Object.fromEntries(url.searchParams));
    const { data, error } = await supabase
      .from("work_orders")
      .select("*")
      .eq("user_id", user.id)
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
    const body = workOrderSchema.parse(await request.json());
    const { supabase } = await requireWorkspaceMember(body.workspace_id, ["owner", "admin", "manager", "service_advisor", "dispatcher", "technician"], request);

    const metadata = {
      ...(body.location_address ? { location_address: body.location_address } : {}),
      ...(body.location_lat != null ? { location_lat: body.location_lat } : {}),
      ...(body.location_lng != null ? { location_lng: body.location_lng } : {}),
      ...(body.customer_notes ? { customer_notes: body.customer_notes } : {}),
      ...(body.van_id ? { legacy_van_id: body.van_id } : {}),
    };

    const { data, error } = await (supabase as any).rpc("create_work_order_v1", {
      p_workspace_id: body.workspace_id,
      p_payload: {
        appointment_id: body.appointment_id ?? null,
        customer_id: body.customer_id,
        vehicle_id: body.vehicle_id ?? null,
        location_id: body.location_id ?? null,
        priority: body.priority,
        complaint: body.complaint ?? null,
        diagnosis: body.diagnosis ?? null,
        technician_notes: body.technician_notes ?? null,
        technician_id: body.technician_id ?? null,
        metadata,
      },
    });
    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.id || row.number == null) throw new Error("Work order creation returned no identifier.");
    return json({ data: row }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
