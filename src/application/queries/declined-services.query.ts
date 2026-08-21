/**
 * Declined Services Queries — Read operations for declined service tracking.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
async function requireUser() {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Authentication required");
  return user;
}

// ── Types ──

export interface DeclinedServiceRow {
  id: string;
  customer_id: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  vehicle_id: string;
  vehicle_info?: string;
  recommended_service: string;
  catalog_item_id: string | null;
  estimated_cost: number;
  urgency: "required" | "recommended" | "optional";
  decline_reason: string | null;
  decline_notes: string | null;
  declined_at: string;
  follow_up_scheduled_for: string | null;
  follow_up_sent_at: string | null;
  follow_up_status: "pending" | "sent" | "converted" | "expired";
  was_converted: boolean;
  potential_revenue: number;
}

export interface DeclinedServiceMetrics {
  totalDeclined: number;
  totalLostRevenue: number;
  pendingFollowUps: number;
  converted: number;
  conversionRate: number;
  recoveredRevenue: number;
}

export interface DeclinedServicesDataResult {
  services: DeclinedServiceRow[];
  metrics: DeclinedServiceMetrics;
  customers: Array<{ id: string; name: string }>;
  vehicles: Array<{ id: string; info: string; customer_id: string }>;
}

// ── Queries ──

export async function fetchDeclinedServicesData(): Promise<DeclinedServicesDataResult> {
  const user = await requireUser();

  const [declinedRes, customerRes, vehicleRes] = await Promise.all([
    supabase
      .from("declined_services")
      .select("*, customers(name, email, phone), vehicles(year, make, model)")
      .eq("user_id", user.id)
      .order("declined_at", { ascending: false }),
    supabase
      .from("customers")
      .select("id, name")
      .eq("user_id", user.id)
      .order("name"),
    supabase
      .from("vehicles")
      .select("id, customer_id, year, make, model")
      .order("make"),
  ]);

  if (declinedRes.error) throw declinedRes.error;

  const formattedData = (declinedRes.data || []).map((d: any) => ({
    ...d,
    customer_name: d.customers?.name || "Unknown",
    customer_email: d.customers?.email,
    customer_phone: d.customers?.phone,
    vehicle_info: d.vehicles
      ? `${d.vehicles.year} ${d.vehicles.make} ${d.vehicles.model}`
      : "Unknown",
  })) as DeclinedServiceRow[];

  const totalLostRevenue = formattedData.reduce((sum, d) => sum + (d.potential_revenue || 0), 0);
  const converted = formattedData.filter((d) => d.was_converted).length;
  const recoveredRevenue = formattedData
    .filter((d) => d.was_converted)
    .reduce((sum, d) => sum + (d.potential_revenue || 0), 0);
  const pendingFollowUps = formattedData.filter((d) => d.follow_up_status === "pending").length;

  return {
    services: formattedData,
    metrics: {
      totalDeclined: formattedData.length,
      totalLostRevenue,
      pendingFollowUps,
      converted,
      conversionRate: formattedData.length > 0 ? (converted / formattedData.length) * 100 : 0,
      recoveredRevenue,
    },
    customers: customerRes.data ?? [],
    vehicles: (vehicleRes.data ?? []).map((v: any) => ({
      id: v.id,
      info: `${v.year} ${v.make} ${v.model}`,
      customer_id: v.customer_id,
    })),
  };
}
