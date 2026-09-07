/** Mobile Dispatch Query — canonical appointment schema. */
import { supabase } from "@/integrations/supabase/client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";

function meta(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function getAuthUser() {
  const { data: { user } } = await getCurrentAuthUser();
  return user;
}

export async function fetchTechnicianRecord(userId: string) {
  return supabase.from("technicians").select("id,status,auth_user_id").eq("auth_user_id", userId).maybeSingle();
}

export async function fetchActiveClockEntry(userId: string) {
  return supabase.from("time_clock_entries").select("id").eq("user_id", userId).in("status", ["active", "on_break"]).limit(1);
}

export async function fetchTechnicianJobs(technicianId: string) {
  const db = supabase as any;
  const { data: tech, error: techError } = await db.from("technicians").select("auth_user_id").eq("id", technicianId).maybeSingle();
  if (techError) return { data: null, error: techError };
  if (!tech?.auth_user_id) return { data: [], error: null };
  const { data, error } = await db.from("appointments")
    .select("id,starts_at,ends_at,status,notes,metadata,customers(first_name,last_name,company_name,phone),vehicles(year,make,model,color,license_plate)")
    .eq("assigned_user_id", tech.auth_user_id)
    .not("status", "in", '("completed","cancelled","no_show")')
    .order("starts_at");
  if (error) return { data: null, error };
  return {
    data: (data ?? []).map((row: any) => {
      const m = meta(row.metadata);
      const customer = row.customers;
      const name = customer?.company_name || [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || null;
      const duration = row.starts_at && row.ends_at ? Math.max(5, Math.round((Date.parse(row.ends_at) - Date.parse(row.starts_at)) / 60000)) : 60;
      return {
        ...row,
        scheduled_date: row.starts_at?.slice(0, 10) ?? null,
        scheduled_time: row.starts_at?.slice(11, 19) ?? null,
        estimated_duration_minutes: duration,
        dispatch_status: typeof m.dispatch_status === "string" ? m.dispatch_status : row.status,
        job_priority: typeof m.job_priority === "string" ? m.job_priority : "normal",
        actual_start_time: typeof m.actual_start_time === "string" ? m.actual_start_time : null,
        actual_end_time: typeof m.actual_end_time === "string" ? m.actual_end_time : null,
        customer: customer ? { name, phone: customer.phone ?? null, address: null } : null,
        vehicle: row.vehicles ?? null,
        service_catalog: { name: String(m.service_name ?? m.title ?? "Service") },
      };
    }),
    error: null,
  };
}

export function subscribeMobileDispatch(callback: () => void) {
  const channel = supabase.channel("mobile-dispatch").on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, callback).subscribe();
  return { channel, unsubscribe: () => supabase.removeChannel(channel) };
}
