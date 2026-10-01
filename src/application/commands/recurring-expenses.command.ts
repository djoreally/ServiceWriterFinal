/**
 * Recurring Expenses — Write operations via the Hono billing API.
 */
import { apiClient, ApiClientError } from "@/lib/api-client";
import type { RecurringFrequency } from "@/application/queries/recurring-expenses.query";

export interface RecurringExpenseInput {
  name: string;
  vendor_id?: string | null;
  vendor_name: string;
  category_id?: string | null;
  amount: number;
  frequency: RecurringFrequency;
  interval_count?: number;
  day_of_month?: number | null;
  start_date: string;
  end_date?: string | null;
  next_due_date: string;
  payment_method?: "cash" | "card" | "check" | "ach" | "other" | null;
  last4?: string | null;
  notes?: string | null;
  is_active?: boolean;
  autopost?: boolean;
}

function toError(error: unknown): Error {
  return new Error(error instanceof ApiClientError ? error.message : "Recurring expense request failed");
}

export async function createRecurringExpense(userId: string, input: RecurringExpenseInput) {
  try {
    const { data } = await apiClient.post<{ data: Record<string, unknown> }>("/v1/billing/recurring-expenses", input);
    return data;
  } catch (error) {
    throw toError(error);
  }
}

export async function updateRecurringExpense(id: string, patch: Partial<RecurringExpenseInput>) {
  try {
    const { data } = await apiClient.put<{ data: Record<string, unknown> }>(`/v1/billing/recurring-expenses/${id}`, patch);
    return data;
  } catch (error) {
    throw toError(error);
  }
}

export async function deleteRecurringExpense(id: string) {
  try {
    await apiClient.delete(`/v1/billing/recurring-expenses/${id}`);
  } catch (error) {
    throw toError(error);
  }
}

export async function toggleRecurringExpenseActive(id: string, isActive: boolean) {
  try {
    const { data } = await apiClient.patch<{ data: Record<string, unknown> }>(`/v1/billing/recurring-expenses/${id}`, {
      is_active: isActive,
    });
    return data;
  } catch (error) {
    throw toError(error);
  }
}
