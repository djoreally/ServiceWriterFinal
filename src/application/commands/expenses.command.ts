/**
 * Expenses Commands — canonical workspace-scoped write operations via the Hono billing API.
 */
import { apiClient, ApiClientError } from "@/lib/api-client";
import type { Json } from "@/integrations/supabase/types";

type ExpenseActivityEventType = "created" | "edited" | "approved" | "rejected" | "reimbursed" | "deleted" | "receipt_attached" | "line_items_changed";
type ExpenseRecord = Record<string, any>;
type ExpenseMutationResult = { data: ExpenseRecord | null; error: Error | null };

function mutationError(error: unknown): Error {
  return error instanceof ApiClientError ? new Error(error.message) : error instanceof Error ? error : new Error(String(error));
}

export interface CreateExpenseInput {
  /** Compatibility-only. Workspace is resolved from the active session. */
  user_id: string;
  submitted_by_user_id?: string | null;
  submitted_by?: string | null;
  vendor_name_raw: string;
  category_id: string | null;
  transaction_date: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  payment_method: string | null;
  last4?: string | null;
  reference_number?: string | null;
  notes?: string | null;
  receipt_url?: string | null;
  is_billable?: boolean;
  appointment_id?: string | null;
  ocr_confidence?: number | null;
  ocr_raw_json?: Json | null;
  status?: "pending" | "approved";
  line_items?: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
}

export async function createExpense(input: CreateExpenseInput) {
  try {
    const { data } = await apiClient.post<{ data: ExpenseRecord }>("/v1/billing/expenses", {
      vendor_name_raw: input.vendor_name_raw,
      category_id: input.category_id,
      transaction_date: input.transaction_date,
      subtotal: input.subtotal,
      tax_amount: input.tax_amount,
      total_amount: input.total_amount,
      payment_method: input.payment_method,
      last4: input.last4 ?? null,
      reference_number: input.reference_number ?? null,
      notes: input.notes ?? null,
      receipt_url: input.receipt_url ?? null,
      is_billable: input.is_billable ?? false,
      appointment_id: input.appointment_id ?? null,
      ocr_confidence: input.ocr_confidence ?? null,
      ocr_raw_json: input.ocr_raw_json ?? null,
      submitted_by: input.submitted_by ?? null,
      line_items: input.line_items ?? [],
    });
    return data;
  } catch (error) {
    throw mutationError(error);
  }
}

export interface UpdateExpenseInput {
  vendor_name_raw: string;
  category_id: string | null;
  transaction_date: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  payment_method: string | null;
  last4?: string | null;
  reference_number?: string | null;
  notes?: string | null;
  receipt_url?: string | null;
  is_billable?: boolean;
  appointment_id?: string | null;
  line_items?: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
}

export async function updateExpense(expenseId: string, input: UpdateExpenseInput, _actorUserId?: string) {
  try {
    const { data } = await apiClient.put<{ data: ExpenseRecord }>(`/v1/billing/expenses/${expenseId}`, input);
    return data;
  } catch (error) {
    throw mutationError(error);
  }
}

export async function approveExpense(expenseId: string, _approverUserId: string): Promise<ExpenseMutationResult> {
  try {
    const { data } = await apiClient.post<{ data: ExpenseRecord }>(`/v1/billing/expenses/${expenseId}/approve`);
    return { data, error: null };
  } catch (error) {
    return { data: null, error: mutationError(error) };
  }
}

export async function rejectExpense(expenseId: string, reason: string, _actorUserId?: string): Promise<ExpenseMutationResult> {
  try {
    const { data } = await apiClient.post<{ data: ExpenseRecord }>(`/v1/billing/expenses/${expenseId}/reject`, { reason });
    return { data, error: null };
  } catch (error) {
    return { data: null, error: mutationError(error) };
  }
}

export async function softDeleteExpense(expenseId: string, _actorUserId?: string): Promise<ExpenseMutationResult> {
  try {
    const { data } = await apiClient.post<{ data: ExpenseRecord }>(`/v1/billing/expenses/${expenseId}/soft-delete`);
    return { data, error: null };
  } catch (error) {
    return { data: null, error: mutationError(error) };
  }
}

export async function createVendor(input: {
  user_id: string;
  name: string;
  default_category_id?: string | null;
  vendor_type?: string | null;
}) {
  try {
    const { data } = await apiClient.post<{ data: ExpenseRecord }>("/v1/billing/vendors", {
      name: input.name,
      default_category_id: input.default_category_id ?? null,
      vendor_type: input.vendor_type ?? null,
    });
    return data;
  } catch (error) {
    throw mutationError(error);
  }
}

export async function uploadReceipt(userId: string, file: Blob, fileName: string): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("file_name", fileName);
  try {
    const { data } = await apiClient.post<{ data: { path: string } }>("/v1/billing/receipts", formData);
    return data.path;
  } catch (error) {
    throw mutationError(error);
  }
}

export async function getReceiptSignedUrl(path: string, expiresIn = 60 * 60): Promise<string | null> {
  try {
    const { data } = await apiClient.get<{ data: { signed_url: string | null } }>("/v1/billing/receipt-signed-url", {
      query: { path, expires_in: String(expiresIn) },
    });
    return data.signed_url ?? null;
  } catch {
    return null;
  }
}

export interface OcrResult {
  success: boolean;
  extracted: {
    vendor_name: string | null;
    transaction_date: string | null;
    subtotal: number | null;
    tax_amount: number | null;
    total_amount: number | null;
    payment_method: string | null;
    last4: string | null;
    reference_number: string | null;
    line_items: Array<{ description: string; quantity: number; unit_price: number; line_total: number }>;
    suggested_category: string | null;
    confidence: number;
  };
  category: { id: string | null; name: string | null; source: "learned" | "ai_suggested" | "unmatched" };
}

export async function scanReceipt(imageBase64: string, mimeType: string): Promise<OcrResult> {
  try {
    return await apiClient.post<OcrResult>("/v1/billing/receipt-ocr", {
      image_base64: imageBase64,
      mime_type: mimeType,
    });
  } catch (error) {
    throw mutationError(error);
  }
}
