import type { SupabaseClient } from "@supabase/supabase-js";
import { productionSupabase } from "@/integrations/supabase/client";
import { fetchBusinessSettings, resolveCurrentWorkspace } from "@/application/queries/settings.query";

const db = productionSupabase as unknown as SupabaseClient;

export type MileageCandidate = {
  id: string;
  starts_at: string;
  location_address: string | null;
  location_lat: number | null;
  location_lng: number | null;
  status: string;
};

export type MileageTrip = {
  id: string;
  appointment_id: string | null;
  trip_date: string;
  purpose: string;
  origin_address: string | null;
  destination_address: string | null;
  one_way_miles: number;
  total_miles: number;
  mileage_rate: number;
  deductible_value: number;
  calculation_method: "mapbox_route" | "haversine_fallback" | "manual";
  status: "tracked" | "review" | "excluded";
};

export type BookkeepingSettings = {
  mileage_enabled: boolean;
  mileage_round_trip: boolean;
  mileage_rate_per_mile: number;
  minimum_cash_reserve: number;
};

const DEFAULTS: BookkeepingSettings = {
  mileage_enabled: true,
  mileage_round_trip: true,
  mileage_rate_per_mile: 0,
  minimum_cash_reserve: 0,
};

async function context() {
  const workspace = await resolveCurrentWorkspace();
  if (!workspace) throw new Error("No active workspace.");
  return workspace;
}

export async function fetchMileageCandidates(): Promise<{
  businessAddress: string;
  businessCoordinates: { lat: number; lng: number } | null;
  appointments: MileageCandidate[];
}> {
  const workspace = await context();
  const settings = await fetchBusinessSettings();
  const { data, error } = await db
    .from("appointments")
    .select("id,starts_at,location_address,location_lat,location_lng,status")
    .eq("workspace_id", workspace.workspaceId)
    .eq("status", "completed")
    .not("location_lat", "is", null)
    .not("location_lng", "is", null)
    .order("starts_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return {
    businessAddress: settings?.service_address || settings?.address || "",
    businessCoordinates: settings?.service_coordinates ?? null,
    appointments: (data ?? []).map((row) => ({
      id: row.id as string,
      starts_at: row.starts_at as string,
      location_address: row.location_address as string | null,
      location_lat: Number(row.location_lat),
      location_lng: Number(row.location_lng),
      status: String(row.status),
    })),
  };
}

export async function fetchMileageTrips(): Promise<MileageTrip[]> {
  const workspace = await context();
  const { data, error } = await db
    .from("mileage_trips")
    .select("id,appointment_id,trip_date,purpose,origin_address,destination_address,one_way_miles,total_miles,mileage_rate,deductible_value,calculation_method,status")
    .eq("workspace_id", workspace.workspaceId)
    .order("trip_date", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    one_way_miles: Number(row.one_way_miles),
    total_miles: Number(row.total_miles),
    mileage_rate: Number(row.mileage_rate),
    deductible_value: Number(row.deductible_value),
  })) as MileageTrip[];
}

export async function fetchBookkeepingSettings(): Promise<BookkeepingSettings> {
  const workspace = await context();
  const { data, error } = await db
    .from("bookkeeping_settings")
    .select("mileage_enabled,mileage_round_trip,mileage_rate_per_mile,minimum_cash_reserve")
    .eq("workspace_id", workspace.workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULTS;
  return {
    mileage_enabled: data.mileage_enabled !== false,
    mileage_round_trip: data.mileage_round_trip !== false,
    mileage_rate_per_mile: Number(data.mileage_rate_per_mile ?? 0),
    minimum_cash_reserve: Number(data.minimum_cash_reserve ?? 0),
  };
}

export async function saveBookkeepingSettings(next: BookkeepingSettings) {
  const workspace = await context();
  const { error } = await db.from("bookkeeping_settings").upsert({
    workspace_id: workspace.workspaceId,
    ...next,
    updated_at: new Date().toISOString(),
  }, { onConflict: "workspace_id" });
  if (error) throw error;
}

export async function saveMileageTrip(input: {
  appointmentId: string;
  tripDate: string;
  originAddress: string;
  destinationAddress: string;
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  oneWayMiles: number;
  totalMiles: number;
  mileageRate: number;
  method: "mapbox_route" | "haversine_fallback";
}) {
  const workspace = await context();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error("Sign in to track mileage.");
  const deductible = Math.round(input.totalMiles * input.mileageRate * 100) / 100;
  const { error } = await db.from("mileage_trips").upsert({
    workspace_id: workspace.workspaceId,
    appointment_id: input.appointmentId,
    trip_date: input.tripDate,
    purpose: "Customer service appointment",
    origin_address: input.originAddress || null,
    destination_address: input.destinationAddress || null,
    origin_lat: input.origin.lat,
    origin_lng: input.origin.lng,
    destination_lat: input.destination.lat,
    destination_lng: input.destination.lng,
    one_way_miles: Math.round(input.oneWayMiles * 100) / 100,
    total_miles: Math.round(input.totalMiles * 100) / 100,
    mileage_rate: input.mileageRate,
    deductible_value: deductible,
    calculation_method: input.method,
    status: input.method === "mapbox_route" ? "tracked" : "review",
    created_by: user.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "workspace_id,appointment_id" });
  if (error) throw error;
}
