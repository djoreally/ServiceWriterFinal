/** Team Dashboard Query — canonical appointment schema. */
import { supabase } from "@/integrations/supabase/client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";

export interface TechProfile {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  avatar_url: string | null;
  status: string;
  working_hours: Record<string, { start: string; end: string }> | null;
  drivers_license_number: string | null;
  drivers_license_expiry: string | null;
  drivers_license_url: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  user_id: string;
}

export interface TeamAssignment {
  id: string;
  title: string;
  description: string | null;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  status: string;
  dispatch_status: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  estimated_cost: number | null;
  notes: string | null;
}

function meta(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function getAuthUser() {
  const { data: { user } } = await getCurrentAuthUser();
  return user;
}

export async function fetchTechProfile(authUserId: string): Promise<TechProfile | null> {
  const { data, error } = await supabase.from("technicians").select("*").eq("auth_user_id", authUserId).single();
  if (error || !data) return null;
  return { ...data, working_hours: data.working_hours as TechProfile["working_hours"] } as TechProfile;
}

export async function fetchTeamAssignments(technicianId: string): Promise<TeamAssignment[]> {
  const db = supabase as any;
  const { data: tech } = await db.from("technicians").select("auth_user_id").eq("id", technicianId).maybeSingle();
  if (!tech?.auth_user_id) return [];
  const { data, error } = await db.from("appointments")
    .select("id,starts_at,ends_at,status,notes,metadata")
    .eq("assigned_user_id", tech.auth_user_id)
    .gte("starts_at", new Date().toISOString())
    .not("status", "in", '("cancelled","completed","no_show")')
    .order("starts_at");
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const m = meta(row.metadata);
    return {
      id: row.id,
      title: String(m.title ?? "Service Appointment"),
      description: typeof m.description === "string" ? m.description : null,
      scheduled_date: row.starts_at?.slice(0, 10) ?? "",
      scheduled_time: row.starts_at?.slice(11, 19) ?? "",
      duration_minutes: row.starts_at && row.ends_at ? Math.max(5, Math.round((Date.parse(row.ends_at) - Date.parse(row.starts_at)) / 60000)) : 60,
      status: row.status,
      dispatch_status: typeof m.dispatch_status === "string" ? m.dispatch_status : row.status,
      guest_name: typeof m.guest_name === "string" ? m.guest_name : null,
      guest_phone: typeof m.guest_phone === "string" ? m.guest_phone : null,
      estimated_cost: typeof m.estimated_cost === "number" ? m.estimated_cost : null,
      notes: row.notes ?? null,
    };
  });
}
