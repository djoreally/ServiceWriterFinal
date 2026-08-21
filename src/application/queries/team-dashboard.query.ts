/**
 * Team Dashboard Query — Read operations for the team member dashboard.
 */
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

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

export async function getAuthUser() {
  const { data: { user } } = await getCurrentAuthUser();
  return user;
}

export async function fetchTechProfile(authUserId: string): Promise<TechProfile | null> {
  const { data, error } = await supabase
    .from("technicians")
    .select("*")
    .eq("auth_user_id", authUserId as any)
    .single() as { data: any; error: any };

  if (error || !data) return null;

  return {
    ...data,
    working_hours: data.working_hours as TechProfile["working_hours"],
    address: (data as any).address,
    drivers_license_number: (data as any).drivers_license_number,
    drivers_license_expiry: (data as any).drivers_license_expiry,
    drivers_license_url: (data as any).drivers_license_url,
    emergency_contact_name: (data as any).emergency_contact_name,
    emergency_contact_phone: (data as any).emergency_contact_phone,
  } as TechProfile;
}

export async function fetchTeamAssignments(technicianId: string): Promise<TeamAssignment[]> {
  const { data } = await supabase
    .from("appointments")
    .select("*")
    .eq("assigned_technician_id", technicianId)
    .gte("scheduled_date", format(new Date(), "yyyy-MM-dd"))
    .order("scheduled_date")
    .order("scheduled_time");

  return (data ?? []) as TeamAssignment[];
}
