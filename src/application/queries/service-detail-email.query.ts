/**
 * Service detail email + inspection queries
 */
import { supabase } from "@/integrations/supabase/client";

/** Send a service record email via edge function */
export async function emailServiceRecord(body: Record<string, unknown>): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const { error } = await supabase.functions.invoke("send-email", { body });
  if (error) throw error;
}

/** Fetch inspections for a service */
export async function fetchServiceInspections(serviceId: string) {
  const { data } = await (supabase as any)
    .from("service_inspections")
    .select("id, template_name, inspector_name, inspection_date, status, notes")
    .eq("service_id", serviceId)
    .order("inspection_date", { ascending: false });
  return data || [];
}
