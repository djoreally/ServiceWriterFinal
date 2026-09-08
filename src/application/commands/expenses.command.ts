/**
 * Expenses Commands — canonical workspace-scoped write operations.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { getCurrentAuthUser } from "@/lib/auth/current-user";

const db = supabase as any;
type ExpenseActivityEventType = "created" | "edited" | "approved" | "rejected" | "reimbursed" | "deleted" | "receipt_attached" | "line_items_changed";
type ExpenseRecord = Record<string, any>;
type ExpenseMutationResult = { data: ExpenseRecord | null; error: Error | null };

async function commandContext() {
  const [workspace, auth] = await Promise.all([resolveCurrentWorkspace(), getCurrentAuthUser()]);
  const user = auth.data.user;
  if (!workspace?.workspaceId) throw new Error("Select a workspace before managing expenses.");
  if (!user?.id) throw new Error("Sign in before managing expenses.");
  return { workspaceId: workspace.workspaceId, user };
}

function actorLabel(user: { email?: string | null; user_metadata?: Record<string, any> | null }) {
  const meta = user.user_metadata ?? {};
  const fullName = [meta.first_name, meta.last_name].filter(Boolean).join(" ").trim();
  return fullName || meta.full_name || user.email || "Team member";
}

async function logExpenseActivity(input: {
  workspaceId: string;
  expenseId: string;
  actorUserId: string;
  actorName: string;
  eventType: ExpenseActivityEventType;
  details?: Json;
}) {
  const { error } = await db.from("expense_activity").insert({
    workspace_id: input.workspaceId,
    expense_id: input.expenseId,
    actor_user_id: input.actorUserId,
    actor_name: input.actorName,
    event_type: input.eventType,
    details: input.details ?? {},
  });
  if (error) throw error;
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
  const { workspaceId, user } = await commandContext();
  const { line_items = [] } = input;
  const metadata: Record<string, unknown> = {};
  if (input.submitted_by) metadata.submitted_by_label = input.submitted_by;
  if (input.ocr_raw_json != null) metadata.ocr_raw_json = input.ocr_raw_json;

  const { data: expense, error } = await db
    .from("expenses")
    .insert({
      workspace_id: workspaceId,
      submitted_by_user_id: user.id,
      vendor_name_raw: input.vendor_name_raw.trim(),
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
      status: "pending",
      metadata,
      created_by: user.id,
    })
    .select()
    .single();
  if (error) throw error;

  if (line_items.length > 0) {
    const rows = line_items.map((li, idx) => ({
      workspace_id: workspaceId,
      expense_id: expense.id,
      description: li.description,
      quantity: li.quantity,
      unit_cost: li.unit_price,
      line_total: li.line_total,
      sort_order: idx,
    }));
    const { error: liErr } = await db.from("expense_line_items").insert(rows);
    if (liErr) throw liErr;
  }

  await logExpenseActivity({
    workspaceId,
    expenseId: expense.id,
    actorUserId: user.id,
    actorName: actorLabel(user),
    eventType: "created",
    details: { status: expense.status, total_amount: expense.total_amount, vendor_name_raw: expense.vendor_name_raw },
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

export async function updateExpense(expenseId: string, input: UpdateExpenseInput, _actorUserId?: string) {
  const { workspaceId, user } = await commandContext();
  const { line_items, ...header } = input;
  const { data: expense, error } = await db
    .from("expenses")
    .update(header)
    .eq("workspace_id", workspaceId)
    .eq("id", expenseId)
    .select()
    .single();
  if (error) throw error;

  if (line_items) {
    const { error: deleteErr } = await db.from("expense_line_items").delete().eq("workspace_id", workspaceId).eq("expense_id", expenseId);
    if (deleteErr) throw deleteErr;
    if (line_items.length > 0) {
      const rows = line_items.map((li, idx) => ({
        workspace_id: workspaceId,
        expense_id: expenseId,
        description: li.description,
        quantity: li.quantity,
        unit_cost: li.unit_price,
        line_total: li.line_total,
        sort_order: idx,
      }));
      const { error: insertErr } = await db.from("expense_line_items").insert(rows);
      if (insertErr) throw insertErr;
    }
  }

  await logExpenseActivity({
    workspaceId,
    expenseId: expense.id,
    actorUserId: user.id,
    actorName: actorLabel(user),
    eventType: "edited",
    details: { total_amount: expense.total_amount, vendor_name_raw: expense.vendor_name_raw, line_items_count: line_items?.length ?? null },
  });
  return expense;
}

export async function approveExpense(expenseId: string, _approverUserId: string): Promise<ExpenseMutationResult> {
  try {
    const { workspaceId, user } = await commandContext();
    const approvedAt = new Date().toISOString();
    const { data: current, error: readError } = await db.from("expenses").select("metadata").eq("workspace_id", workspaceId).eq("id", expenseId).single();
    if (readError) return { data: null, error: readError };
    const metadata = { ...(current?.metadata ?? {}), approved_at: approvedAt, approved_by: user.id };
    const { data, error } = await db.from("expenses").update({ status: "approved", metadata }).eq("workspace_id", workspaceId).eq("id", expenseId).select().single();
    if (error) return { error, data: null };
    await logExpenseActivity({ workspaceId, expenseId: data.id, actorUserId: user.id, actorName: actorLabel(user), eventType: "approved", details: { status: data.status, approved_at: approvedAt } });
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

export async function rejectExpense(expenseId: string, reason: string, _actorUserId?: string): Promise<ExpenseMutationResult> {
  try {
    const { workspaceId, user } = await commandContext();
    const { data: current, error: readError } = await db.from("expenses").select("metadata").eq("workspace_id", workspaceId).eq("id", expenseId).single();
    if (readError) return { data: null, error: readError };
    const metadata = { ...(current?.metadata ?? {}), rejected_reason: reason, rejected_by: user.id, rejected_at: new Date().toISOString() };
    const { data, error } = await db.from("expenses").update({ status: "rejected", metadata }).eq("workspace_id", workspaceId).eq("id", expenseId).select().single();
    if (error) return { error, data: null };
    await logExpenseActivity({ workspaceId, expenseId: data.id, actorUserId: user.id, actorName: actorLabel(user), eventType: "rejected", details: { reason, status: data.status } });
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

export async function softDeleteExpense(expenseId: string, _actorUserId?: string): Promise<ExpenseMutationResult> {
  try {
    const { workspaceId, user } = await commandContext();
    const deletedAt = new Date().toISOString();
    const { data, error } = await db.from("expenses").update({ deleted_at: deletedAt }).eq("workspace_id", workspaceId).eq("id", expenseId).select().single();
    if (error) return { error, data: null };
    await logExpenseActivity({ workspaceId, expenseId: data.id, actorUserId: user.id, actorName: actorLabel(user), eventType: "deleted", details: { deleted_at: deletedAt, vendor_name_raw: data.vendor_name_raw } });
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

export async function createVendor(input: {
  user_id: string;
  name: string;
  default_category_id?: string | null;
  vendor_type?: string | null;
}) {
  const { workspaceId } = await commandContext();
  const normalized = input.name.trim().toLowerCase().replace(/\s+/g, " ");
  const { data, error } = await db.from("vendors").insert({
    workspace_id: workspaceId,
    name: input.name.trim(),
    normalized_name: normalized,
    default_category_id: input.default_category_id ?? null,
    vendor_type: input.vendor_type ?? null,
    is_active: true,
  }).select().single();
  if (error) throw error;
  return data;
}

export async function uploadReceipt(userId: string, file: Blob, fileName: string): Promise<string> {
  const { workspaceId } = await commandContext();
  const path = `${workspaceId}/${userId}/${crypto.randomUUID()}-${fileName}`;
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
  const { data, error } = await supabase.functions.invoke("expense-receipt-ocr", { body: { imageBase64, mimeType } });
  if (error) throw error;
  return data as OcrResult;
}
