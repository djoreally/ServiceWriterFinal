import { apiClient, ApiClientError } from "@/lib/api-client";
import type { AccountingClassification, ImportedBankRow } from "@/features/accounting/accounting-engine";

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

function toError(error: unknown, fallback: string): Error {
  if (error instanceof ApiClientError && error.code === "workspace_missing") {
    return new Error("No active workspace.");
  }
  return new Error(error instanceof ApiClientError ? error.message : fallback);
}

export async function createFinancialImport(params: {
  fileName: string;
  sourceHash: string;
  rows: Array<ImportedBankRow & { sourceRowHash: string }>;
}) {
  try {
    const { data } = await apiClient.post<{
      data: { batch_id: string; imported: number; duplicates: number };
    }>("/v1/billing/financial-imports", {
      file_name: params.fileName,
      source_hash: params.sourceHash,
      rows: params.rows.map((row) => ({
        source_row_hash: row.sourceRowHash,
        posted_on: row.postedOn,
        description_raw: row.description,
        amount: row.amount,
        direction: row.direction,
        classification: row.classification,
        confidence: row.confidence,
        source_data: (row.sourceRow ?? null) as Record<string, unknown> | null,
      })),
    });
    return { batchId: data.batch_id, imported: data.imported, duplicates: data.duplicates };
  } catch (error) {
    throw toError(error, "Unable to create import batch.");
  }
}

export async function fetchBankTransactions(limit = 1000): Promise<StoredBankTransaction[]> {
  try {
    const { data } = await apiClient.get<{ data: StoredBankTransaction[] }>("/v1/billing/bank-transactions", {
      query: { limit: String(limit) },
    });
    return data ?? [];
  } catch (error) {
    throw toError(error, "Failed to fetch bank transactions.");
  }
}

export async function classifyStoredTransaction(
  id: string,
  classification: AccountingClassification,
  notes?: string,
) {
  try {
    await apiClient.patch(`/v1/billing/bank-transactions/${id}`, {
      classification,
      notes: notes ?? null,
    });
  } catch (error) {
    throw toError(error, "Failed to classify transaction.");
  }
}
