/**
 * Admin Database Explorer Commands — Write operations for admin database access.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type AdminTableName = keyof Database["public"]["Tables"];

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
  const { error } = await supabase
    .from(tableName as AdminTableName)
    .insert(insertData as never);
  if (error) throw error;
}

export async function executeUpdateQuery(
  tableName: string,
  updates: Record<string, unknown>,
  whereColumn: string,
  whereValue: string,
): Promise<void> {
  const { error } = await supabase
    .from(tableName as AdminTableName)
    .update(updates as never)
    .eq(whereColumn as never, whereValue);
  if (error) throw error;
}

export async function executeDeleteQuery(
  tableName: string,
  whereColumn: string,
  whereValue: string,
): Promise<void> {
  const { error } = await supabase
    .from(tableName as AdminTableName)
    .delete()
    .eq(whereColumn as never, whereValue);
  if (error) throw error;
}

/**
 * Shadow Data Audit Finding #12: Do not persist raw SQL query strings
 * which may contain PII in WHERE clauses. Only store type and table.
 */
export async function logAdminQuery(queryType: string, tableName: string, _query: string): Promise<void> {
  await supabase.from("audit_logs").insert({
    action: `ADMIN_${queryType}`,
    table_name: tableName,
    new_data: { queryType, tableName, timestamp: new Date().toISOString() },
  });
}

export async function runAdminAiAssistant(
  messages: AdminAiMessage[],
  writeEnabled: boolean,
): Promise<AdminAiResponse> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : undefined;

  const { data, error } = await supabase.functions.invoke("admin-db-ai", {
    headers,
    body: { messages, writeEnabled },
  });

  if (error) throw error;
  return data as AdminAiResponse;
}
