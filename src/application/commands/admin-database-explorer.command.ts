/**
 * Admin Database Explorer Commands — Write operations for admin database access.
 */
import { apiClient } from "@/lib/api-client";

export interface AdminAiMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AdminAiProposal {
  summary: string;
  sql: string;
  queryType: "SELECT" | "INSERT" | "UPDATE" | "DELETE";
  tableName: string;
  requiresConfirmation: boolean;
  previewSql?: string | null;
  affectedRowsEstimate?: number | null;
}

export interface AdminAiResponse {
  answer: string;
  proposal: AdminAiProposal | null;
  previewRows?: Record<string, unknown>[];
  warnings: string[];
}

export async function executeInsertQuery(
  tableName: string,
  insertData: Record<string, string>,
): Promise<void> {
  await apiClient.post("/v1/platform/admin/database-explorer/insert", {
    tableName,
    data: insertData,
  });
}

export async function executeUpdateQuery(
  tableName: string,
  updates: Record<string, unknown>,
  whereColumn: string,
  whereValue: string,
): Promise<void> {
  await apiClient.post("/v1/platform/admin/database-explorer/update", {
    tableName,
    updates,
    whereColumn,
    whereValue,
  });
}

export async function executeDeleteQuery(
  tableName: string,
  whereColumn: string,
  whereValue: string,
): Promise<void> {
  await apiClient.post("/v1/platform/admin/database-explorer/delete", {
    tableName,
    whereColumn,
    whereValue,
  });
}

/**
 * Shadow Data Audit Finding #12: Do not persist raw SQL query strings
 * which may contain PII in WHERE clauses. Only store type and table.
 */
export async function logAdminQuery(queryType: string, tableName: string, _query: string): Promise<void> {
  await apiClient.post("/v1/platform/admin/database-explorer/log", {
    queryType,
    tableName,
  });
}

export async function runAdminAiAssistant(
  messages: AdminAiMessage[],
  writeEnabled: boolean,
): Promise<AdminAiResponse> {
  const data = await apiClient.post<AdminAiResponse>(
    "/v1/platform/admin/database-explorer/ai",
    { messages, writeEnabled },
  );
  return data as AdminAiResponse;
}
