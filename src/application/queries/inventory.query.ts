/**
 * Inventory Query - canonical workspace-scoped inventory reads.
 * Oil usage is intentionally not sourced from these tables.
 *
 * Phase 2: data access goes through the typed API client (`@/lib/api-client`)
 * to the platform Hono router (`GET /v1/platform/inventory/overview`), which
 * attaches the session token automatically. Exported signatures are unchanged.
 */
import { apiClient } from "@/lib/api-client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface InventoryItem { id:string; name:string; description:string|null; sku:string|null; quantity:number; unit:string; unit_cost:number; sell_price:number; category:string|null; low_stock_threshold:number; image_url?:string|null; reorder_url?:string|null; tire_size?:string|null; tire_load_index?:string|null; tire_speed_rating?:string|null; tire_season?:string|null; tire_position?:string|null }
export interface Van { id:string; name:string }
export interface VanInventoryLink { inventory_item_id:string; van_id:string; quantity:number }
export interface ReservationLink { inventory_item_id:string; quantity:number; source:string; van_id:string|null }
export interface InventoryOverviewResult { items:InventoryItem[]; vans:Van[]; vanInventory:VanInventoryLink[]; reservations:ReservationLink[] }

const EMPTY_OVERVIEW: InventoryOverviewResult = { items:[], vans:[], vanInventory:[], reservations:[] };

export async function fetchInventoryOverview(): Promise<InventoryOverviewResult> {
  const workspace = await resolveCurrentWorkspace();
  if (!workspace?.workspaceId) return EMPTY_OVERVIEW;
  return apiClient.get<InventoryOverviewResult>("/v1/platform/inventory/overview", {
    query: { selected_workspace_id: workspace.workspaceId },
  });
}
