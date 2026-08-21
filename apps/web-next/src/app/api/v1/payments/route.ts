import { errorResponse, json, paginationSchema, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const paymentSchema = z.object({
  workspace_id: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.string().trim().length(3).default("USD"),
  appointment_id: z.string().uuid().nullable().optional(),
  customer_name: z.string().max(200).nullable().optional(),
  customer_email: z.string().email().max(320).nullable().optional(),
  payment_type: z.string().max(40).nullable().optional(),
  status: z.string().max(40).default("pending"),
  source_type: z.string().max(40).nullable().optional(),
  source_id: z.string().max(200).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = z.string().uuid().parse(url.searchParams.get("workspace_id"));
    const { supabase, user } = await requireWorkspaceMember(workspaceId);
    const { limit, offset } = paginationSchema.parse(Object.fromEntries(url.searchParams));
    const { data, error } = await supabase.from("payment_records").select("*").eq("user_id", user.id).is("deleted_at", null).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw error;
    return json({ data: data ?? [], pagination: { limit, offset } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const body = paymentSchema.parse(await request.json());
    const { workspace_id, ...payload } = body;
    const { supabase, user } = await requireWorkspaceMember(workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist"]);
    const { data, error } = await supabase.from("payment_records").insert({ ...payload, user_id: user.id, processor_fee_amount: 0, data_origin: "manual" }).select().single();
    if (error) throw error;
    return json({ data }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
