/**
 * Admin Audit Logs Query
 * Fetches audit log entries for the admin dashboard.
 */
import { apiClient } from "@/lib/api-client";

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
  const data = await apiClient.get<AuditLog[]>("/v1/platform/admin/audit-logs", {
    query: { action: actionFilter ?? undefined },
  });
  return data ?? [];
}
