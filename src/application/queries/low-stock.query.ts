/**
 * Low Stock Alert Query
 * Fetches inventory items below their stock thresholds.
 */
import { supabase } from "@/integrations/supabase/client";

export interface LowStockItem {
  id: string;
  name: string;
  quantity: number;
  low_stock_threshold: number;
}

export async function fetchLowStockItems(): Promise<LowStockItem[]> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id ?? null;
  if (!userId) return [];

  const { data, error } = await supabase
    .from("inventory_items")
    .select("id, name, quantity, low_stock_threshold")
    .eq("user_id", userId);

  if (error || !data) return [];

  return data.filter(
    (item: LowStockItem) => item.quantity <= item.low_stock_threshold
  );
}
