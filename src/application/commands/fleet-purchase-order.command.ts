/**
 * Fleet Purchase Order Command - Write operations for purchase orders.
 */

import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface CreatePurchaseOrderPayload {
  fleet_client_id: string;
  po_number: string;
  description: string | null;
  amount_limit: number | null;
  issued_date: string | null;
  expiry_date: string | null;
  status: string;
}

export async function createPurchaseOrder(
  userId: string,
  payload: CreatePurchaseOrderPayload,
): Promise<{ warnings: string[] }> {
  const { validatePurchaseOrder, assertValid } = await import("@/application/validation/fleet-validation");
  const result = validatePurchaseOrder(payload);
  assertValid(result, "Cannot create PO");

  const { error } = await (supabase as any).from("fleet_purchase_orders").insert({
    user_id: userId,
    ...payload,
    amount_used: 0,
  });
  if (error) throw new Error("Failed to create PO");
  return { warnings: result.warnings };
}


/**
 * Fetch active fleet clients for dropdown options.
 */
export async function fetchFleetClientOptions(userId: string): Promise<Array<{ id: string; company_name: string }>> {
  const { data } = await supabase
    .from("fleet_clients")
    .select("id, company_name")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("company_name");
  return data ?? [];
}

/** Update a fleet purchase order. */
export async function updatePurchaseOrder(
  poId: string,
  payload: Partial<CreatePurchaseOrderPayload>
) {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Unauthorized");

  return supabase
    .from("fleet_purchase_orders")
    .update(payload)
    .eq("id", poId)
    .eq("user_id", user.id);
}

/** Delete a fleet purchase order. */
export async function deletePurchaseOrder(poId: string) {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Unauthorized");

  return supabase
    .from("fleet_purchase_orders")
    .delete()
    .eq("id", poId)
    .eq("user_id", user.id);
}
