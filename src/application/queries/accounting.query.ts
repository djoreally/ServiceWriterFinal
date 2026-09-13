import type { SupabaseClient } from "@supabase/supabase-js";
import { productionSupabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import type { AccountingClassification, ImportedBankRow } from "@/features/accounting/accounting-engine";

const db = productionSupabase as unknown as SupabaseClient;

export type StoredBankTransaction = {
  id: string;
  posted_on: string;
  description_raw: string;
  amount: number;
  direction: "inflow" | "outflow";
  classification: AccountingClassification;
  confidence: number | null;
  review_status: "pending" | "approved" | "rejected";
  notes: string | null;
  created_at: string;
};

async function workspace() {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("No active workspace.");
  return context;
}

export async function createFinancialImport(params: {
  fileName: string;
  sourceHash: string;
  rows: Array<ImportedBankRow & { sourceRowHash: string }>;
}) {
  const context = await workspace();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error("Sign in to import financial records.");

  const { data: batch, error: batchError } = await db
    .from("financial_import_batches")
    .insert({
      workspace_id: context.workspaceId,
      created_by: user.id,
      source_type: "bank_upload",
      source_name: params.fileName,
      source_hash: params.sourceHash,
      row_count: params.rows.length,
      imported_count: 0,
      duplicate_count: 0,
      status: "pending",
    })
    .select("id")
    .single();
  if (batchError || !batch?.id) throw batchError ?? new Error("Unable to create import batch.");

  let imported = 0;
  let duplicates = 0;
  for (let i = 0; i < params.rows.length; i += 200) {
    const chunk = params.rows.slice(i, i + 200).map((row) => ({
      workspace_id: context.workspaceId,
      import_batch_id: batch.id,
      source_row_hash: row.sourceRowHash,
      posted_on: row.postedOn,
      description_raw: row.description,
      amount: row.amount,
      direction: row.direction,
      classification: row.classification,
      confidence: row.confidence,
      review_status: row.confidence >= 0.9 ? "approved" : "pending",
      source_data: row.sourceRow,
      classified_by: row.confidence >= 0.9 ? user.id : null,
      classified_at: row.confidence >= 0.9 ? new Date().toISOString() : null,
    }));
    const { data, error } = await db
      .from("bank_transactions")
      .upsert(chunk, { onConflict: "workspace_id,source_row_hash", ignoreDuplicates: true })
      .select("id");
    if (error) throw error;
    const inserted = data?.length ?? 0;
    imported += inserted;
    duplicates += chunk.length - inserted;
  }

  const { error: updateError } = await db
    .from("financial_import_batches")
    .update({ imported_count: imported, duplicate_count: duplicates, status: "completed" })
    .eq("id", batch.id)
    .eq("workspace_id", context.workspaceId);
  if (updateError) throw updateError;

  return { batchId: batch.id as string, imported, duplicates };
}

export async function fetchBankTransactions(limit = 1000): Promise<StoredBankTransaction[]> {
  const context = await workspace();
  const { data, error } = await db
    .from("bank_transactions")
    .select("id,posted_on,description_raw,amount,direction,classification,confidence,review_status,notes,created_at")
    .eq("workspace_id", context.workspaceId)
    .order("posted_on", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as StoredBankTransaction[];
}

export async function classifyStoredTransaction(
  id: string,
  classification: AccountingClassification,
  notes?: string,
) {
  const context = await workspace();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error("Sign in to classify financial records.");
  const { error } = await db
    .from("bank_transactions")
    .update({
      classification,
      review_status: classification === "unresolved" ? "pending" : "approved",
      confidence: classification === "unresolved" ? 0 : 1,
      classified_by: user.id,
      classified_at: new Date().toISOString(),
      notes: notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", context.workspaceId)
    .eq("id", id);
  if (error) throw error;
}
