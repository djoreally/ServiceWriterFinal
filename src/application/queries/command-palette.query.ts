import { productionSupabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export async function searchCommandPalette(_userId: string, query: string) {
  const q = query.trim();
  if (q.length < 2) {
    return { customers: [], appointments: [] };
  }

  const context = await resolveCurrentWorkspace();
  if (!context) return { customers: [], appointments: [] };

  const db = productionSupabase as any;
  const [customersRes, appointmentsRes] = await Promise.all([
    db
      .from("customers")
      .select("id,first_name,last_name,email,phone")
      .eq("workspace_id", context.workspaceId)
      .neq("status", "archived")
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(8),
    db
      .from("appointments")
      .select("id,status,starts_at,confirmation_code,metadata")
      .eq("workspace_id", context.workspaceId)
      .order("starts_at", { ascending: false })
      .limit(30),
  ]);

  if (customersRes.error) throw customersRes.error;
  if (appointmentsRes.error) throw appointmentsRes.error;

  const customers = (customersRes.data ?? []).map((customer: any) => ({
    id: customer.id,
    name: [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Customer",
    email: customer.email,
    phone: customer.phone,
  }));

  const lower = q.toLowerCase();
  const appointments = (appointmentsRes.data ?? [])
    .filter((appointment: any) => {
      const metadata = appointment.metadata && typeof appointment.metadata === "object" ? appointment.metadata : {};
      const searchable = [
        appointment.status,
        appointment.confirmation_code,
        metadata.title,
        metadata.service_name,
        metadata.customer_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return searchable.includes(lower);
    })
    .slice(0, 8)
    .map((appointment: any) => {
      const startsAt = appointment.starts_at ? new Date(appointment.starts_at) : null;
      const metadata = appointment.metadata && typeof appointment.metadata === "object" ? appointment.metadata : {};
      return {
        id: appointment.id,
        title: metadata.title || metadata.service_name || appointment.confirmation_code || "Appointment",
        scheduled_date: startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt.toLocaleDateString() : "",
        scheduled_time: startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "",
        status: appointment.status,
      };
    });

  return { customers, appointments };
}
