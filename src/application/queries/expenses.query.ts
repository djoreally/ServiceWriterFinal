/**
 * Expenses Query — Read access for the Expense Tracking module.
 */
import { supabase } from "@/integrations/supabase/client";

export interface ExpenseRow {
  id: string;
  user_id: string;
  submitted_by: string | null;
  submitted_by_user_id: string | null;
  vendor_id: string | null;
  vendor_name_raw: string;
  category_id: string | null;
  transaction_date: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
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
}

export interface ExpenseCategoryRow {
  id: string;
  name: string;
  is_active: boolean;
  is_system: boolean;
  sort_order: number;
}

export async function fetchExpenseCategories(userId: string) {
  return supabase
    .from("expense_categories")
    .select("id, name, is_active, is_system, sort_order")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("sort_order");
}

export async function fetchExpenses(userId: string, sinceIso?: string, untilIso?: string) {
  let q = supabase
    .from("expenses")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("transaction_date", { ascending: false });
  if (sinceIso) q = q.gte("transaction_date", sinceIso);
  if (untilIso) q = q.lt("transaction_date", untilIso);
  return q;
}

export async function fetchExpensesByAppointment(appointmentId: string) {
  return supabase
    .from("expenses")
    .select("*")
    .eq("appointment_id", appointmentId)
    .is("deleted_at", null)
    .order("transaction_date", { ascending: false });
}

export async function fetchExpenseLineItems(expenseId: string) {
  return supabase
    .from("expense_line_items")
    .select("*")
    .eq("expense_id", expenseId)
    .order("sort_order");
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
  user_id: string;
  actor_user_id: string;
  actor_name: string | null;
  event_type: "created" | "edited" | "approved" | "rejected" | "deleted";
  details: Record<string, unknown> | null;
  created_at: string;
}

export async function fetchVendors(userId: string) {
  return supabase
    .from("vendors")
    .select("id, name, normalized_name, default_category_id, vendor_type, is_active, times_seen")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("name");
}

export async function fetchExpenseActivity(expenseId: string) {
  return supabase
    .from("expense_activity")
    .select("id, expense_id, user_id, actor_user_id, actor_name, event_type, details, created_at")
    .eq("expense_id", expenseId)
    .order("created_at", { ascending: false });
}

export async function ensureDefaultCategoriesSeeded(userId: string) {
  // Check first to avoid unnecessary RPC calls
  const { count } = await supabase
    .from("expense_categories")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if ((count ?? 0) > 0) return { seeded: false };
  const { error } = await supabase.rpc("seed_default_expense_categories", { p_user_id: userId });
  if (error) throw error;
  return { seeded: true };
}

/**
 * Seed common auto-shop vendor templates (AutoZone, NAPA, Walmart, Shell, etc.)
 * for the given user. Idempotent — safe to call repeatedly. Also ensures the
 * default expense categories exist (vendors are tied to default categories).
 */
export async function ensureDefaultVendorsSeeded(userId: string) {
  const { count } = await supabase
    .from("vendors")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if ((count ?? 0) > 0) return { seeded: false };
  const { error } = await supabase.rpc("seed_default_vendors", { p_user_id: userId });
  if (error) throw error;
  return { seeded: true };
}

// ─────────────────────────────────────────────────────────────
// Expense submitter context — resolves the owner (tenant) and
// technician submitter row so ScanReceiptDialog can store an
// expense against the correct tenant regardless of who scanned it.
// ─────────────────────────────────────────────────────────────
export interface ExpenseSubmitterContext {
  ownerUserId: string;
  technicianId: string | null;
  submittedByUserId: string | null;
}

export async function resolveExpenseSubmitterContext(
  userId: string,
): Promise<ExpenseSubmitterContext> {
  const { data: tech } = await supabase
    .from("technicians")
    .select("id, user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!tech) {
    return { ownerUserId: userId, technicianId: null, submittedByUserId: null };
  }

  const techRow = tech as unknown as { id: string; user_id: string | null };
  // Look up which business this tech belongs to (owner user_id on technicians row)
  let ownerUserId = userId;
  const { data: techOwner } = await supabase
    .from("technicians")
    .select("user_id")
    .eq("id", techRow.id)
    .maybeSingle();
  const ownerRow = techOwner as unknown as { user_id: string | null } | null;
  if (ownerRow?.user_id) ownerUserId = ownerRow.user_id;

  return {
    ownerUserId,
    technicianId: techRow.id,
    submittedByUserId: userId,
  };
}
