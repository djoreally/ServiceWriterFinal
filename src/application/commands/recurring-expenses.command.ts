/**
 * Recurring Expenses — Write operations.
 */
import { supabase } from "@/integrations/supabase/client";
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

export async function createRecurringExpense(userId: string, input: RecurringExpenseInput) {
  const { data, error } = await supabase
    .from("recurring_expenses" as any)
    .insert([{ user_id: userId, interval_count: 1, is_active: true, autopost: true, ...input }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateRecurringExpense(id: string, patch: Partial<RecurringExpenseInput>) {
  const { data, error } = await supabase
    .from("recurring_expenses" as any)
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteRecurringExpense(id: string) {
  const { error } = await supabase.from("recurring_expenses" as any).delete().eq("id", id);
  if (error) throw error;
}

export async function toggleRecurringExpenseActive(id: string, isActive: boolean) {
  return updateRecurringExpense(id, { is_active: isActive });
}
