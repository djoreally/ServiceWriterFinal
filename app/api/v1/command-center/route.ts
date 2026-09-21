import { z } from "zod";
import { json, requireWorkspaceMember } from "@/server/api";

const querySchema = z.object({
  workspace_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const input = querySchema.parse({
    workspace_id: url.searchParams.get("workspace_id"),
    date: url.searchParams.get("date"),
  });
  const { supabase } = await requireWorkspaceMember(input.workspace_id, ["owner","admin","manager","service_advisor","receptionist","dispatcher","viewer"], request);
  const { data: workspace, error: workspaceError } = await supabase.from("workspaces").select("timezone").eq("id", input.workspace_id).single();
  if (workspaceError) throw workspaceError;
  const timezone = workspace?.timezone || "UTC";
  const start = new Date(`${input.date}T00:00:00`);
  const end = new Date(`${input.date}T23:59:59.999`);
  const [appointments, workOrders, members] = await Promise.all([
    supabase.from("appointments")
      .select("id,status,starts_at,ends_at,assigned_user_id,updated_at,metadata,customers(first_name,last_name,company_name,phone,address_line1,address_line2,city,region,postal_code),vehicles(year,make,model),locations(address_line1,address_line2,city,region,postal_code,latitude,longitude)")
      .eq("workspace_id", input.workspace_id).gte("starts_at", start.toISOString()).lte("starts_at", end.toISOString()).order("starts_at"),
    supabase.from("work_orders")
      .select("id,number,status,priority,opened_at,created_at,updated_at,technician_notes,metadata,customers(first_name,last_name,company_name,phone,address_line1,address_line2,city,region,postal_code),vehicles(year,make,model),locations(address_line1,address_line2,city,region,postal_code,latitude,longitude),work_order_assignments(user_id,assigned_at,unassigned_at)")
      .eq("workspace_id", input.workspace_id).is("appointment_id", null).gte("created_at", start.toISOString()).lte("created_at", end.toISOString()).order("created_at"),
    supabase.from("workspace_members")
      .select("user_id,role,is_active,profiles!workspace_members_user_id_fkey(display_name)")
      .eq("workspace_id", input.workspace_id).eq("is_active", true),
  ]);
  const error = appointments.error || workOrders.error || members.error;
  if (error) throw error;
  const technicians = (members.data || []).filter((m:any)=>m.role==="technician").map((m:any)=>({
    id:m.user_id,name:m.profiles?.display_name || "Technician",status:"active",current_location:null,
  }));
  return json({ data: { timezone, appointments: appointments.data || [], work_orders: workOrders.data || [], members: members.data || [], technicians } });
}
