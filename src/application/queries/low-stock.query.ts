/**
 * Low Stock Alert Query
 * Derives dashboard alerts from the same canonical workspace-scoped inventory
 * overview used by the Inventory module.
 */
import { fetchInventoryOverview } from "@/application/queries/inventory.query";

export interface LowStockItem {
  id: string;
  name: string;
  quantity: number;
  low_stock_threshold: number;
}

export async function fetchLowStockItems(): Promise<LowStockItem[]> {
  const { items } = await fetchInventoryOverview();
  return items
    .filter((item) => item.quantity <= item.low_stock_threshold)
    .map(({ id, name, quantity, low_stock_threshold }) => ({ id, name, quantity, low_stock_threshold }));
}
