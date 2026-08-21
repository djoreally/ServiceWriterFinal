/**
 * Admin Database Explorer Query — Read operations for admin database access.
 */
import { supabase } from "@/integrations/supabase/client";

export async function fetchTableRows(tableName: string, limit = 50): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from(tableName as "appointments")
    .select("*")
    .limit(limit);
  if (error) throw error;
  return (data || []) as Record<string, unknown>[];
}

export async function executeSelectQuery(tableName: string): Promise<{ data: Record<string, unknown>[]; executionTime: number }> {
  const start = Date.now();
  const { data, error } = await supabase
    .from(tableName as "appointments")
    .select("*")
    .limit(100);
  const executionTime = Date.now() - start;
  if (error) throw error;
  return { data: (data || []) as Record<string, unknown>[], executionTime };
}
