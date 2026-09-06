import { supabase } from "@/integrations/supabase/client";

export async function searchCommandPalette(workspaceId: string, query: string) {
  const q = query.trim();
  if (!workspaceId || q.length < 2) {
    return { customers: [], appointments: [] };
  }

  const [customersRes, appointmentsRes] = await Promise.all([
    supabase
      .from("customers")
      .select("id, first_name, last_name, company_name, email, phone")
      .eq("workspace_id", workspaceId)
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,company_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(8),
    supabase
      .from("appointments")
      .select("id, starts_at, status, notes, metadata")
      .eq("workspace_id", workspaceId)
      .or(`notes.ilike.%${q}%,status.ilike.%${q}%`)
      .order("starts_at", { ascending: false })
      .limit(8),
  ]);

  const customers = (customersRes.data ?? []).map((customer) => ({
    ...customer,
    name:
      customer.company_name ||
      [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
      "Customer",
  }));

  const appointments = (appointmentsRes.data ?? []).map((appointment) => {
    const startsAt = appointment.starts_at ? new Date(appointment.starts_at) : null;
    const metadata = appointment.metadata && typeof appointment.metadata === "object" && !Array.isArray(appointment.metadata)
      ? appointment.metadata as Record<string, unknown>
      : {};
    const metadataTitle = typeof metadata.title === "string" ? metadata.title : null;
    return {
      ...appointment,
      title: metadataTitle || appointment.notes || "Appointment",
      scheduled_date: startsAt ? startsAt.toISOString().slice(0, 10) : "",
      scheduled_time: startsAt ? startsAt.toISOString().slice(11, 16) : "",
    };
  });

  return { customers, appointments };
}
