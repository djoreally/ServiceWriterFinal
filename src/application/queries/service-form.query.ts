/** Service Record Form Query — canonical workspace lookups and writes. */
import { apiClient } from "@/lib/api-client";
import { nextApi } from "@/lib/nextApiClient";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { bankersRound } from "@/lib/financialMath";

export async function getAuthUser() {
  const { data: { user } } = await getCurrentAuthUser();
  return user;
}
function workspaceId(): string {
  const id = getSelectedWorkspaceId();
  if (!id) throw new Error("Select a workspace before managing service records.");
  return id;
}
function splitName(fullName: string): { first_name: string; last_name: string } {
  const normalized = fullName.trim().replace(/\s+/g, " ");
  const [first_name, ...rest] = normalized.split(" ");
  return { first_name, last_name: rest.join(" ") };
}
interface ServiceFormCustomerRow { id: string; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null; }
interface ServiceFormCatalogRow { id: string; name: string; description?: string | null; labor_price?: number | null; estimated_minutes?: number | null; }

export async function fetchServiceFormOptions() {
  const id = workspaceId();
  const [customersResponse, catalogResponse] = await Promise.all([
    nextApi.customers.list(id),
    apiClient.get<{ data: ServiceFormCatalogRow[] }>("/v1/service-catalog", {
      query: { workspace_id: id },
    }).then(
      (response) => ({ data: response.data, error: null as unknown }),
      (error: unknown) => ({ data: [] as ServiceFormCatalogRow[], error }),
    ),
  ]);
  const customers = ((customersResponse.data ?? []) as unknown as ServiceFormCustomerRow[]).map((row) => ({ id: row.id, name: [row.first_name, row.last_name].filter(Boolean).join(" ").trim(), email: row.email ?? null, phone: row.phone ?? null }));
  const catalog = ((catalogResponse.data ?? []) as unknown as ServiceFormCatalogRow[]).map((row) => ({ id: row.id, name: row.name, description: row.description ?? null, default_price: Number(row.labor_price ?? 0), labor_rate: Number(row.labor_price ?? 0), estimated_duration: row.estimated_minutes != null ? Number(row.estimated_minutes) : null }));
  return [{ data: customers, error: null }, { data: catalog, error: catalogResponse.error }] as const;
}

export async function findVehicleByVin(_userId: string, vin: string) {
  const id = workspaceId();
  try {
    const response = await apiClient.get<{ data: { id: string } | null }>("/v1/vehicles/by-vin", {
      query: { workspace_id: id, vin: vin.trim().toUpperCase() },
    });
    return { data: response.data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Request failed") };
  }
}

/** Compatibility wrapper replacing the retired upsert_booking_vehicle RPC. */
export async function upsertBookingVehicle(params: { p_business_user_id: string; p_customer_id: string | null; p_year: number; p_make: string; p_model: string; p_vin: string | null; p_engine: string | null; }) {
  const id = workspaceId();
  try {
    if (params.p_vin) {
      const existing = await findVehicleByVin(params.p_business_user_id, params.p_vin);
      if (existing.data?.id) return { data: existing.data.id, error: null };
    }
    const response = await nextApi.vehicles.create({ workspace_id: id, customer_id: params.p_customer_id, year: params.p_year, make: params.p_make, model: params.p_model, vin: params.p_vin, engine: params.p_engine });
    const vehicle = response.data as { id?: string };
    if (!vehicle.id) throw new Error("Vehicle creation returned no id.");
    return { data: vehicle.id, error: null };
  } catch (error) { return { data: null, error: error instanceof Error ? error : new Error("Failed to create vehicle.") }; }
}

/** Compatibility wrapper replacing the retired upsert_customer RPC. */
export async function upsertCustomerRpc(_userId: string, email: string, fullName: string, phone: string | null) {
  const id = workspaceId();
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const existingResponse = await nextApi.customers.list(id, normalizedEmail);
    const existing = ((existingResponse.data ?? []) as unknown as ServiceFormCustomerRow[]).find((row) => typeof row.email === "string" && row.email.toLowerCase() === normalizedEmail);
    if (existing?.id) return { data: existing.id, error: null };
    const { first_name, last_name } = splitName(fullName);
    const response = await nextApi.customers.create({ workspace_id: id, first_name, last_name, email: normalizedEmail, phone: phone || undefined });
    const customer = response.data as { id?: string };
    if (!customer.id) throw new Error("Customer creation returned no id.");
    return { data: customer.id, error: null };
  } catch (error) { return { data: null, error: error instanceof Error ? error : new Error("Failed to create customer.") }; }
}

export async function updateServiceRecord(serviceId: string, data: Record<string, unknown>): Promise<{ data: null; error: Error | null }> {
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) return { data: null, error: new Error("Select a workspace before updating a service record.") };
  try {
    // Partial-update guard (SW-42): write only the fields the caller actually
    // provided. This used to coerce every absent field — customer_id /
    // vehicle_id / work_performed / internal_notes to null, the whole money
    // block to values recomputed from 0 — and replace the stored metadata
    // with just the caller's keys, so a partial save erased stored data.
    // A key that IS provided keeps the historical coercion (non-string ->
    // null is the form's explicit clear); a key that is absent is not sent.
    const has = (key: string) => Object.prototype.hasOwnProperty.call(data, key) && data[key] !== undefined;
    const payload: Record<string, unknown> = { workspace_id };
    if (has("customer_id")) payload.customer_id = typeof data.customer_id === "string" ? data.customer_id : null;
    if (has("vehicle_id")) payload.vehicle_id = typeof data.vehicle_id === "string" ? data.vehicle_id : null;
    const status = data.status === "pending" ? "draft" : data.status === "in_progress" ? "in_progress" : data.status === "completed" ? "completed" : undefined;
    if (status !== undefined) payload.status = status;
    if (has("description")) payload.work_performed = typeof data.description === "string" ? data.description : null;
    if (has("notes")) payload.internal_notes = typeof data.notes === "string" ? data.notes : null;

    // The money block is one derived set: it is written only when the caller
    // provided at least one money input, and computed exactly as before.
    const moneyKeys = ["labor_cost", "parts_cost", "shop_supplies", "discount_amount", "tax_rate"] as const;
    if (moneyKeys.some((key) => has(key))) {
      const labor = bankersRound(Number(data.labor_cost ?? 0), 2);
      const parts = bankersRound(Number(data.parts_cost ?? 0), 2);
      const supplies = bankersRound(Number(data.shop_supplies ?? 0), 2);
      const subtotal = bankersRound(labor + parts + supplies, 2);
      const discount = bankersRound(Number(data.discount_amount ?? 0), 2);
      if (discount > subtotal) throw new Error("Discount cannot exceed subtotal.");
      const taxRate = bankersRound(Number(data.tax_rate ?? 0), 4);
      const taxAmount = bankersRound(Math.max(subtotal - discount, 0) * (taxRate / 100), 2);
      const total = bankersRound(Math.max(subtotal - discount, 0) + taxAmount, 2);
      payload.subtotal = subtotal;
      payload.tax_rate = taxRate;
      payload.tax_amount = taxAmount;
      payload.discount_amount = discount;
      payload.total_amount = total;
      payload.metadata = { labor_cost: labor, parts_cost: parts, shop_supplies: supplies, total_cost: total };
    }

    if (payload.metadata || Object.keys(data).length > 0) {
      // The server PATCH replaces the metadata column with what it is sent,
      // so merge the caller's keys over the record's stored metadata —
      // stored keys the caller never mentioned (service_number, completion
      // details, ...) must survive the save. Fail closed if the current
      // record cannot be read: an unmerged write would be destructive.
      const current = await nextApi.serviceRecords.get(workspace_id, serviceId);
      const currentRow = current.data as { metadata?: unknown } | null;
      const storedMetadata = currentRow?.metadata && typeof currentRow.metadata === "object" && !Array.isArray(currentRow.metadata)
        ? currentRow.metadata as Record<string, unknown>
        : {};
      const callerMetadata = payload.metadata && typeof payload.metadata === "object"
        ? payload.metadata as Record<string, unknown>
        : {};
      payload.metadata = { ...storedMetadata, ...data, ...callerMetadata };
    }

    await nextApi.serviceRecords.update(serviceId, payload);
    return { data: null, error: null };
  } catch (error) { return { data: null, error: error instanceof Error ? error : new Error("Failed to update service record.") }; }
}
