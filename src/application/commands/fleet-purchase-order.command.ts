/**
 * Fleet Purchase Order Command - Write operations for purchase orders.
 */

import { apiClient } from "@/lib/api-client";

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

  await apiClient.post("/v1/fleet/purchase-orders", { payload });
  return { warnings: result.warnings };
}


/**
 * Fetch active fleet clients for dropdown options.
 */
export async function fetchFleetClientOptions(userId: string): Promise<Array<{ id: string; company_name: string }>> {
  const { data } = await apiClient.get<{ data: Array<{ id: string; company_name: string }> }>(
    "/v1/fleet/clients/options",
  );
  return data ?? [];
}

/** Update a fleet purchase order. */
export async function updatePurchaseOrder(
  poId: string,
  payload: Partial<CreatePurchaseOrderPayload>
) {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Unauthorized");

  try {
    const { data } = await apiClient.patch<{ data: unknown }>(`/v1/fleet/purchase-orders/${poId}`, { payload });
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

/** Delete a fleet purchase order. */
export async function deletePurchaseOrder(poId: string) {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Unauthorized");

  try {
    const { data } = await apiClient.delete<{ data: unknown }>(`/v1/fleet/purchase-orders/${poId}`);
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}
