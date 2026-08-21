/**
 * Service Record Form Query — Abstracts lookups for service record creation
 */

import { supabase } from "@/integrations/supabase/client";
import { nextApi } from "@/lib/nextApiClient";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
export async function getAuthUser() {
  const { data: { user } } = await getCurrentAuthUser();
  return user;
}

export async function fetchServiceFormOptions() {
  return Promise.all([
    supabase.from("customers").select("id, name, email, phone").order("name"),
    supabase.from("service_catalog").select("id, name, description, default_price, labor_rate, estimated_duration").eq("is_active", true).order("name"),
  ]);
}

export async function findVehicleByVin(userId: string, vin: string) {
  return supabase.from("vehicles").select("id").eq("user_id", userId).eq("vin", vin).maybeSingle();
}

export async function upsertBookingVehicle(params: {
  p_business_user_id: string;
  p_customer_id: string | null;
  p_year: number;
  p_make: string;
  p_model: string;
  p_vin: string | null;
  p_engine: string | null;
}) {
  return supabase.rpc("upsert_booking_vehicle", params);
}

export async function upsertCustomerRpc(userId: string, email: string, name: string, phone: string | null) {
  return supabase.rpc("upsert_customer", {
    p_user_id: userId,
    p_email: email,
    p_name: name,
    p_phone: phone,
  });
}

export async function updateServiceRecord(serviceId: string, data: Record<string, unknown>): Promise<{ data: null; error: Error | null }> {
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) return { data: null, error: new Error("Select a workspace before updating a service record.") };
  try {
    await nextApi.serviceRecords.update(serviceId, {
      workspace_id,
      status: data.status === "pending" ? "draft" : data.status === "in_progress" ? "in_progress" : data.status === "completed" ? "completed" : undefined,
      work_performed: typeof data.description === "string" ? data.description : null,
      internal_notes: typeof data.notes === "string" ? data.notes : null,
      metadata: data,
    });
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Failed to update service record.") };
  }
}
