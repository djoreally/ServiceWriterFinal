/**
 * Recurring Expenses — Read access.
 */
import { supabase } from "@/integrations/supabase/client";

export type RecurringFrequency = "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";

export interface RecurringExpenseRow {
  id: string;
  user_id: string;
  name: string;
  vendor_id: string | null;
  vendor_name: string;
  category_id: string | null;
  amount: number;
  frequency: RecurringFrequency;
  interval_count: number;
  day_of_month: number | null;
  start_date: string;
  end_date: string | null;
  next_due_date: string;
  payment_method: "cash" | "card" | "check" | "ach" | "other" | null;
  last4: string | null;
  notes: string | null;
  is_active: boolean;
  autopost: boolean;
  last_generated_at: string | null;
  last_generated_expense_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchRecurringExpenses(userId: string) {
  return supabase
    .from("recurring_expenses" as any)
    .select("*")
    .eq("user_id", userId)
    .order("next_due_date", { ascending: true });
}

/**
 * Idempotently materializes expense rows for any recurring templates
 * whose next_due_date has arrived. Returns the count generated.
 */
export async function processDueRecurringExpenses(userId: string): Promise<number> {
  const { data, error } = await supabase.rpc("process_due_recurring_expenses" as any, {
    p_user_id: userId,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}
