/**
 * Admin Audit Logs Query
 * Fetches audit log entries for the admin dashboard.
 */
import { supabase } from "@/integrations/supabase/client";

export interface AuditLog {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  table_name: string | null;
  record_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export async function fetchAuditLogs(actionFilter?: string): Promise<AuditLog[]> {
  let query = supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (actionFilter && actionFilter !== "all") {
    query = query.eq("action", actionFilter);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AuditLog[];
}
