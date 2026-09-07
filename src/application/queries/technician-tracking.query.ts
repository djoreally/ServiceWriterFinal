/** Technician Tracking Query — canonical appointment schema. */
import { supabase } from "@/integrations/supabase/client";

function meta(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function customerName(customer: any): string | null {
  if (!customer) return null;
  return customer.company_name || [customer.first_name, customer.last_name].filter(Boolean).join(" ") || null;
}

export async function fetchTrackingTechnicians() {
  return supabase.from("technicians").select("*").order("display_name");
}

export async function fetchActiveDispatchJobs() {
  const db = supabase as any;
  const [{ data: technicians, error: techError }, { data: appointments, error: appointmentError }] = await Promise.all([
    db.from("technicians").select("id,auth_user_id"),
    db.from("appointments")
      .select("id,starts_at,ends_at,status,assigned_user_id,location_lat,location_lng,location_address,metadata,customers(first_name,last_name,company_name),vehicles(year,make,model)")
      .not("assigned_user_id", "is", null)
      .not("status", "in", '("cancelled","completed","no_show")')
      .order("starts_at"),
  ]);
  const error = techError ?? appointmentError;
  if (error) return { data: null, error };
  const byAuth = new Map<string, string>((technicians ?? []).filter((t: any) => t.auth_user_id).map((t: any) => [t.auth_user_id, t.id]));
  const data = (appointments ?? []).map((row: any) => {
    const m = meta(row.metadata);
    const start = new Date(row.starts_at);
    return {
      ...row,
      scheduled_date: row.starts_at ? row.starts_at.slice(0, 10) : null,
      scheduled_time: row.starts_at ? start.toISOString().slice(11, 19) : null,
      dispatch_status: typeof m.dispatch_status === "string" ? m.dispatch_status : row.status,
      assigned_technician_id: row.assigned_user_id ? byAuth.get(row.assigned_user_id) ?? null : null,
      customer: row.customers ? { name: customerName(row.customers) } : null,
      service_catalog: { name: String(m.service_name ?? m.title ?? "Service") },
    };
  });
  return { data, error: null };
}

export async function fetchTechLocationHistory(technicianId: string) {
  return supabase.from("location_history").select("*").eq("technician_id", technicianId).order("recorded_at", { ascending: false }).limit(50);
}

export function subscribeToTrackingChanges(onTechChange: () => void, onLocationChange: () => void) {
  const channel = supabase.channel("technician-tracking")
    .on("postgres_changes", { event: "*", schema: "public", table: "technicians" }, onTechChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "location_history" }, onLocationChange)
    .subscribe();
  return { channel, unsubscribe: () => supabase.removeChannel(channel) };
}
