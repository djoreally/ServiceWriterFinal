/**
 * Expenses Query — canonical workspace-scoped read access via the Hono billing API.
 *
 * UI signatures retain the historical userId argument for compatibility, but
 * tenant authority is resolved from the active workspace server-side. No
 * expense read is scoped by a user-owned tenant key or the retired
 * technicians table.
 */
import { apiClient, ApiClientError } from "@/lib/api-client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

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

async function hasWorkspace(): Promise<boolean> {
  const context = await resolveCurrentWorkspace();
  return Boolean(context?.workspaceId);
}

export async function fetchExpenseCategories(_userId: string) {
  if (!(await hasWorkspace())) return { data: [], error: null };
  try {
    const { data } = await apiClient.get<{ data: ExpenseCategoryRow[] }>("/v1/billing/expense-categories");
    return { data: data ?? [], error: null };
  } catch (error) {
    return { data: [], error };
  }
}

export async function fetchExpenses(userId: string, sinceIso?: string, untilIso?: string) {
  if (!(await hasWorkspace())) return { data: [], error: null };
  try {
    const { data } = await apiClient.get<{ data: Record<string, unknown>[] }>("/v1/billing/expenses", {
      query: {
        ...(sinceIso ? { since: sinceIso } : {}),
        ...(untilIso ? { until: untilIso } : {}),
      },
    });
    return {
      data: (data ?? []).map((row) => ({
        ...row,
        // Compatibility-only aliases for legacy components; not tenant authority.
        user_id: userId,
        submitted_by: null,
      })) as ExpenseRow[],
      error: null,
    };
  } catch (error) {
    return { data: [], error };
  }
}

export async function fetchExpensesByAppointment(appointmentId: string) {
  if (!(await hasWorkspace())) return { data: [], error: null };
  try {
    const { data } = await apiClient.get<{ data: ExpenseRow[] }>("/v1/billing/expenses", {
      query: { appointment_id: appointmentId },
    });
    return { data: data ?? [], error: null };
  } catch (error) {
    return { data: [], error };
  }
}

export async function fetchExpenseLineItems(expenseId: string) {
  if (!(await hasWorkspace())) return { data: [], error: null };
  try {
    const { data } = await apiClient.get<{ data: Record<string, unknown>[] }>("/v1/billing/expense-line-items", {
      query: { expense_id: expenseId },
    });
    return { data: data ?? [], error: null };
  } catch (error) {
    return { data: [], error };
  }
}

export async function fetchVendors(_userId: string) {
  if (!(await hasWorkspace())) return { data: [], error: null };
  try {
    const { data } = await apiClient.get<{ data: VendorRow[] }>("/v1/billing/vendors");
    return { data: data ?? [], error: null };
  } catch (error) {
    return { data: [], error };
  }
}

export async function fetchExpenseActivity(expenseId: string) {
  if (!(await hasWorkspace())) return { data: [], error: null };
  try {
    const { data } = await apiClient.get<{ data: ExpenseActivityRow[] }>("/v1/billing/expense-activity", {
      query: { expense_id: expenseId },
    });
    return { data: data ?? [], error: null };
  } catch (error) {
    return { data: [], error };
  }
}

export async function ensureDefaultCategoriesSeeded(_userId: string) {
  if (!(await hasWorkspace())) return { seeded: false };
  try {
    const { data } = await apiClient.post<{ data: { seeded: boolean } }>("/v1/billing/expense-categories/seed");
    return { seeded: data.seeded === true };
  } catch (error) {
    throw error instanceof ApiClientError ? new Error(error.message) : error;
  }
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
