import { errorResponse, json, paginationSchema, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const paymentSchema = z.object({
  workspace_id: z.string().uuid(),
  invoice_id: z.string().uuid().nullable().optional(),
  customer_id: z.string().uuid().nullable().optional(),
  provider: z.string().trim().max(40).nullable().optional(),
  provider_payment_id: z.string().trim().max(200).nullable().optional(),
  status: z.string().trim().max(40).default("pending"),
  amount: z.number().nonnegative(),
  currency_code: z.string().trim().length(3).toUpperCase().default("USD"),
  paid_at: z.string().datetime().nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = z.string().uuid().parse(url.searchParams.get("workspace_id"));
    const { supabase, user } = await requireWorkspaceMember(workspaceId);
    const { limit, offset } = paginationSchema.parse(Object.fromEntries(url.searchParams));
    const { data, error } = await supabase.from("payments").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw error;
    return json({ data: data ?? [], pagination: { limit, offset } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const body = paymentSchema.parse(await request.json());
    const { workspace_id, ...payload } = body;
    const { supabase, user } = await requireWorkspaceMember(workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist"]);
    const { data, error } = await supabase.from("payments").insert({ ...payload, workspace_id, created_by: user.id }).select().single();
    if (error) throw error;
    return json({ data }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
