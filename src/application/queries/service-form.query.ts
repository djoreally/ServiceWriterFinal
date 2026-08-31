/** Service Record Form Query — canonical workspace lookups and writes. */
import { supabase } from "@/integrations/supabase/client";
import { nextApi } from "@/lib/nextApiClient";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";
import { getCurrentAuthUser } from "@/lib/auth/current-user";

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

interface ServiceFormCustomerRow {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
}

interface ServiceFormCatalogRow {
  id: string;
  name: string;
  description?: string | null;
  labor_price?: number | null;
  estimated_minutes?: number | null;
}

export async function fetchServiceFormOptions() {
  const id = workspaceId();
  const [customersResponse, catalogResponse] = await Promise.all([
    nextApi.customers.list(id),
    (supabase.from("service_catalog") as any)
      .select("id,name,description,labor_price,estimated_minutes")
      .eq("workspace_id", id)
      .eq("is_active", true)
      .order("name"),
  ]);

  const customers = ((customersResponse.data ?? []) as unknown as ServiceFormCustomerRow[]).map((row) => ({
    id: row.id,
    name: [row.first_name, row.last_name].filter(Boolean).join(" ").trim(),
    email: row.email ?? null,
    phone: row.phone ?? null,
  }));
  const catalog = ((catalogResponse.data ?? []) as unknown as ServiceFormCatalogRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    default_price: Number(row.labor_price ?? 0),
    labor_rate: Number(row.labor_price ?? 0),
    estimated_duration: row.estimated_minutes != null ? Number(row.estimated_minutes) : null,
  }));

  return [
    { data: customers, error: null },
    { data: catalog, error: catalogResponse.error ?? null },
  ] as const;
}

export async function findVehicleByVin(_userId: string, vin: string) {
  const id = workspaceId();
  return (supabase.from("vehicles") as any)
    .select("id")
    .eq("workspace_id", id)
    .eq("vin", vin.trim().toUpperCase())
    .neq("status", "archived")
    .maybeSingle();
}

/** Compatibility wrapper replacing the retired upsert_booking_vehicle RPC. */
export async function upsertBookingVehicle(params: {
  p_business_user_id: string;
  p_customer_id: string | null;
  p_year: number;
  p_make: string;
  p_model: string;
  p_vin: string | null;
  p_engine: string | null;
}) {
  const id = workspaceId();
  try {
    if (params.p_vin) {
      const existing = await findVehicleByVin(params.p_business_user_id, params.p_vin);
      if (existing.data?.id) return { data: existing.data.id, error: null };
    }
    const response = await nextApi.vehicles.create({
      workspace_id: id,
      customer_id: params.p_customer_id,
      year: params.p_year,
      make: params.p_make,
      model: params.p_model,
      vin: params.p_vin,
      engine: params.p_engine,
    });
    const vehicle = response.data as { id?: string };
    if (!vehicle.id) throw new Error("Vehicle creation returned no id.");
    return { data: vehicle.id, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Failed to create vehicle.") };
  }
}

/** Compatibility wrapper replacing the retired upsert_customer RPC. */
export async function upsertCustomerRpc(_userId: string, email: string, fullName: string, phone: string | null) {
  const id = workspaceId();
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const existingResponse = await nextApi.customers.list(id, normalizedEmail);
    const existing = ((existingResponse.data ?? []) as unknown as ServiceFormCustomerRow[]).find(
      (row) => typeof row.email === "string" && row.email.toLowerCase() === normalizedEmail,
    );
    if (existing?.id) return { data: existing.id, error: null };

    const { first_name, last_name } = splitName(fullName);
    const response = await nextApi.customers.create({
      workspace_id: id,
      first_name,
      last_name,
      email: normalizedEmail,
      phone: phone || undefined,
    });
    const customer = response.data as { id?: string };
    if (!customer.id) throw new Error("Customer creation returned no id.");
    return { data: customer.id, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Failed to create customer.") };
  }
}

export async function updateServiceRecord(serviceId: string, data: Record<string, unknown>): Promise<{ data: null; error: Error | null }> {
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) return { data: null, error: new Error("Select a workspace before updating a service record.") };
  try {
    const metadata = { ...data };
    await nextApi.serviceRecords.update(serviceId, {
      workspace_id,
      customer_id: typeof data.customer_id === "string" ? data.customer_id : null,
      vehicle_id: typeof data.vehicle_id === "string" ? data.vehicle_id : null,
      status: data.status === "pending" ? "draft" : data.status === "in_progress" ? "in_progress" : data.status === "completed" ? "completed" : undefined,
      work_performed: typeof data.description === "string" ? data.description : null,
      internal_notes: typeof data.notes === "string" ? data.notes : null,
      subtotal: data.labor_cost != null || data.parts_cost != null || data.shop_supplies != null
        ? Number(data.labor_cost ?? 0) + Number(data.parts_cost ?? 0) + Number(data.shop_supplies ?? 0)
        : undefined,
      tax_rate: data.tax_rate != null ? Number(data.tax_rate) : null,
      discount_amount: data.discount_amount != null ? Number(data.discount_amount) : null,
      total_amount: data.total_cost != null ? Number(data.total_cost) : null,
      metadata,
    });
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Failed to update service record.") };
  }
}
