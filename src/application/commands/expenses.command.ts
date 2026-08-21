/**
 * Expenses Commands — Write operations for the Expense Tracking module.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
type ExpenseActivityEventType = "created" | "edited" | "approved" | "rejected" | "deleted";
type ExpenseRecord = Database["public"]["Tables"]["expenses"]["Row"];
type ExpenseMutationResult = { data: ExpenseRecord | null; error: Error | null };

async function getActorLabel(userId: string) {
  const { data } = await getCurrentAuthUser();
  if (data.user?.id === userId) {
    const fullName = [data.user.user_metadata?.first_name, data.user.user_metadata?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    return fullName || data.user.user_metadata?.full_name || data.user.email || "Unknown user";
  }
  return "Team member";
}

async function logExpenseActivity(input: {
  expenseId: string;
  userId: string;
  actorUserId: string;
  eventType: ExpenseActivityEventType;
  details?: Json;
}) {
  const actorName = await getActorLabel(input.actorUserId);
  const { error } = await supabase.from("expense_activity").insert({
    expense_id: input.expenseId,
    user_id: input.userId,
    actor_user_id: input.actorUserId,
    actor_name: actorName,
    event_type: input.eventType,
    details: input.details ?? {},
  });
  if (error) throw error;
}

export interface CreateExpenseInput {
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
  const { line_items = [], ...header } = input;
  const { data: expense, error } = await supabase
    .from("expenses")
    .insert([header])
    .select()
    .single();
  if (error) throw error;

  if (line_items.length > 0) {
    const rows = line_items.map((li, idx) => ({ ...li, expense_id: expense.id, sort_order: idx }));
    const { error: liErr } = await supabase.from("expense_line_items").insert(rows);
    if (liErr) throw liErr;
  }

  await logExpenseActivity({
    expenseId: expense.id,
    userId: expense.user_id,
    actorUserId: input.submitted_by_user_id ?? input.user_id,
    eventType: "created",
    details: {
      status: expense.status,
      total_amount: expense.total_amount,
      vendor_name_raw: expense.vendor_name_raw,
    },
  });

  return expense;
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

export async function updateExpense(expenseId: string, input: UpdateExpenseInput, actorUserId?: string) {
  const { line_items, ...header } = input;
  const { data: expense, error } = await supabase
    .from("expenses")
    .update(header)
    .eq("id", expenseId)
    .select()
    .single();
  if (error) throw error;

  if (line_items) {
    const { error: deleteErr } = await supabase.from("expense_line_items").delete().eq("expense_id", expenseId);
    if (deleteErr) throw deleteErr;

    if (line_items.length > 0) {
      const rows = line_items.map((li, idx) => ({ ...li, expense_id: expenseId, sort_order: idx }));
      const { error: insertErr } = await supabase.from("expense_line_items").insert(rows);
      if (insertErr) throw insertErr;
    }
  }

  await logExpenseActivity({
    expenseId: expense.id,
    userId: expense.user_id,
    actorUserId: actorUserId ?? expense.submitted_by_user_id ?? expense.user_id,
    eventType: "edited",
    details: {
      total_amount: expense.total_amount,
      vendor_name_raw: expense.vendor_name_raw,
      line_items_count: line_items?.length ?? null,
    },
  });

  return expense;
}

export async function approveExpense(expenseId: string, approverUserId: string): Promise<ExpenseMutationResult> {
  const { data, error } = await supabase
    .from("expenses")
    .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: approverUserId })
    .eq("id", expenseId)
    .select()
    .single();
  if (error) return { error, data: null };
  await logExpenseActivity({
    expenseId: data.id,
    userId: data.user_id,
    actorUserId: approverUserId,
    eventType: "approved",
    details: {
      status: data.status,
      approved_at: data.approved_at,
    },
  });
  return { data, error: null };
}

export async function rejectExpense(expenseId: string, reason: string, actorUserId?: string): Promise<ExpenseMutationResult> {
  const { data, error } = await supabase
    .from("expenses")
    .update({ status: "rejected", rejected_reason: reason })
    .eq("id", expenseId)
    .select()
    .single();
  if (error) return { error, data: null };
  await logExpenseActivity({
    expenseId: data.id,
    userId: data.user_id,
    actorUserId: actorUserId ?? data.submitted_by_user_id ?? data.user_id,
    eventType: "rejected",
    details: {
      reason,
      status: data.status,
    },
  });
  return { data, error: null };
}

export async function softDeleteExpense(expenseId: string, actorUserId?: string): Promise<ExpenseMutationResult> {
  const { data, error } = await supabase
    .from("expenses")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", expenseId)
    .select()
    .single();
  if (error) return { error, data: null };
  await logExpenseActivity({
    expenseId: data.id,
    userId: data.user_id,
    actorUserId: actorUserId ?? data.submitted_by_user_id ?? data.user_id,
    eventType: "deleted",
    details: {
      deleted_at: data.deleted_at,
      vendor_name_raw: data.vendor_name_raw,
    },
  });
  return { data, error: null };
}

export async function createVendor(input: {
  user_id: string;
  name: string;
  default_category_id?: string | null;
  vendor_type?: string | null;
}) {
  const normalized = input.name.trim().toLowerCase().replace(/\s+/g, " ");
  const { data, error } = await supabase
    .from("vendors")
    .insert([{
      user_id: input.user_id,
      name: input.name.trim(),
      normalized_name: normalized,
      default_category_id: input.default_category_id ?? null,
      vendor_type: input.vendor_type ?? null,
      is_active: true,
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function uploadReceipt(userId: string, file: Blob, fileName: string): Promise<string> {
  const path = `${userId}/${crypto.randomUUID()}-${fileName}`;
  const { error } = await supabase.storage.from("receipts").upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

export async function getReceiptSignedUrl(path: string, expiresIn = 60 * 60): Promise<string | null> {
  const { data } = await supabase.storage.from("receipts").createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
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
  const { data, error } = await supabase.functions.invoke("expense-receipt-ocr", {
    body: { imageBase64, mimeType },
  });
  if (error) throw error;
  return data as OcrResult;
}
