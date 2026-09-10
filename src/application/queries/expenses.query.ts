/**
 * Expenses Query — canonical workspace-scoped read access.
 *
 * UI signatures retain the historical userId argument for compatibility, but
 * tenant authority is resolved from the active workspace. No expense read is
 * scoped by a user-owned tenant key or the retired technicians table.
 */
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

const db = supabase as any;

export interface ExpenseRow {
  id: string;
  workspace_id: string;
  user_id?: string;
  submitted_by?: string | null;
  submitted_by_user_id: string | null;
  vendor_id: string | null;
  vendor_name_raw: string;
  category_id: string | null;
  transaction_date: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  currency_code?: string;
  payment_method: string | null;
  last4: string | null;
  reference_number: string | null;
  notes: string | null;
  receipt_url: string | null;
  receipt_thumbnail_url: string | null;
  status: "pending" | "approved" | "rejected" | "reimbursed";
  is_billable: boolean;
  appointment_id: string | null;
  ocr_confidence: number | null;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
}

export interface ExpenseCategoryRow {
  id: string;
  name: string;
  is_active: boolean;
  is_system: boolean;
  sort_order: number;
}

export interface VendorRow {
  id: string;
  name: string;
  normalized_name: string;
  default_category_id: string | null;
  vendor_type: string | null;
  is_active: boolean;
  times_seen: number;
}

export interface ExpenseActivityRow {
  id: string;
  expense_id: string;
  workspace_id: string;
  user_id?: string;
  actor_user_id: string | null;
  actor_name: string | null;
  event_type: "created" | "edited" | "approved" | "rejected" | "reimbursed" | "deleted" | "receipt_attached" | "line_items_changed";
  details: Record<string, unknown> | null;
  created_at: string;
}

async function workspaceId(): Promise<string | null> {
  const context = await resolveCurrentWorkspace();
  return context?.workspaceId ?? null;
}

export async function fetchExpenseCategories(_userId: string) {
  const id = await workspaceId();
  if (!id) return { data: [], error: null };
  return db
    .from("expense_categories")
    .select("id, name, is_active, is_system, sort_order")
    .eq("workspace_id", id)
    .eq("is_active", true)
    .order("sort_order");
}

export async function fetchExpenses(userId: string, sinceIso?: string, untilIso?: string) {
  const id = await workspaceId();
  if (!id) return { data: [], error: null };
  let q = db
    .from("expenses")
    .select("*")
    .eq("workspace_id", id)
    .is("deleted_at", null)
    .order("transaction_date", { ascending: false });
  if (sinceIso) q = q.gte("transaction_date", sinceIso);
  if (untilIso) q = q.lt("transaction_date", untilIso);
  const result = await q;
  if (result.error) return result;
  return {
    data: (result.data ?? []).map((row: Record<string, unknown>) => ({
      ...row,
      // Compatibility-only aliases for legacy components; not tenant authority.
      user_id: userId,
      submitted_by: null,
    })),
    error: null,
  };
}

export async function fetchExpensesByAppointment(appointmentId: string) {
  const id = await workspaceId();
  if (!id) return { data: [], error: null };
  return db
    .from("expenses")
    .select("*")
    .eq("workspace_id", id)
    .eq("appointment_id", appointmentId)
    .is("deleted_at", null)
    .order("transaction_date", { ascending: false });
}

export async function fetchExpenseLineItems(expenseId: string) {
  const id = await workspaceId();
  if (!id) return { data: [], error: null };
  return db
    .from("expense_line_items")
    .select("*")
    .eq("workspace_id", id)
    .eq("expense_id", expenseId)
    .order("sort_order");
}

export async function fetchVendors(_userId: string) {
  const id = await workspaceId();
  if (!id) return { data: [], error: null };
  return db
    .from("vendors")
    .select("id, name, normalized_name, default_category_id, vendor_type, is_active, times_seen")
    .eq("workspace_id", id)
    .eq("is_active", true)
    .order("name");
}

export async function fetchExpenseActivity(expenseId: string) {
  const id = await workspaceId();
  if (!id) return { data: [], error: null };
  return db
    .from("expense_activity")
    .select("id, workspace_id, expense_id, actor_user_id, actor_name, event_type, details, created_at")
    .eq("workspace_id", id)
    .eq("expense_id", expenseId)
    .order("created_at", { ascending: false });
}

export async function ensureDefaultCategoriesSeeded(_userId: string) {
  const id = await workspaceId();
  if (!id) return { seeded: false };
  const { count, error } = await db
    .from("expense_categories")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", id);
  if (error) throw error;
  if ((count ?? 0) > 0) return { seeded: false };
  const { data, error: rpcError } = await db.rpc("seed_default_expense_categories", { p_workspace_id: id });
  if (rpcError) throw rpcError;
  return { seeded: Number(data ?? 0) > 0 };
}

/** Vendors are real workspace data; do not silently manufacture vendor history. */
export async function ensureDefaultVendorsSeeded(_userId: string) {
  return { seeded: false };
}

export interface ExpenseSubmitterContext {
  ownerUserId: string;
  technicianId: string | null;
  submittedByUserId: string | null;
  workspaceId?: string | null;
}

/**
 * Tenant identity now comes from workspace membership. `ownerUserId` is kept
 * only so existing dialog props do not break; writes resolve workspace again.
 */
export async function resolveExpenseSubmitterContext(userId: string): Promise<ExpenseSubmitterContext> {
  const context = await resolveCurrentWorkspace();
  return {
    ownerUserId: userId,
    technicianId: null,
    submittedByUserId: userId,
    workspaceId: context?.workspaceId ?? null,
  };
}
