/**
 * Admin Database Explorer Query — Read operations for admin database access.
 */
import { apiClient } from "@/lib/api-client";

export async function fetchTableRows(tableName: string, limit = 50): Promise<Record<string, unknown>[]> {
  const data = await apiClient.post<Record<string, unknown>[]>(
    "/v1/platform/admin/database-explorer/rows",
    { tableName, limit },
  );
  return data ?? [];
}

export async function executeSelectQuery(tableName: string): Promise<{ data: Record<string, unknown>[]; executionTime: number }> {
  const result = await apiClient.post<{ data: Record<string, unknown>[]; executionTime: number }>(
    "/v1/platform/admin/database-explorer/query",
    { tableName },
  );
  return { data: result.data ?? [], executionTime: result.executionTime };
}
