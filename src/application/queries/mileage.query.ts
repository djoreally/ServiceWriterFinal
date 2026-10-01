import { apiClient } from "@/lib/api-client";
import { fetchBusinessSettings, resolveCurrentWorkspace } from "@/application/queries/settings.query";

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
  const { data } = await apiClient.get<{ data: Record<string, unknown>[] }>("/v1/mileage/candidates", {
    query: { selected_workspace_id: workspace.workspaceId },
  });
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
  const { data } = await apiClient.get<{ data: Record<string, unknown>[] }>("/v1/mileage/trips", {
    query: { selected_workspace_id: workspace.workspaceId },
  });
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
  const { data } = await apiClient.get<{ data: Record<string, unknown> | null }>("/v1/mileage/bookkeeping-settings", {
    query: { selected_workspace_id: workspace.workspaceId },
  });
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
  await apiClient.put("/v1/mileage/bookkeeping-settings", {
    ...next,
    selected_workspace_id: workspace.workspaceId,
  });
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
  await apiClient.post("/v1/mileage/trips", {
    ...input,
    selected_workspace_id: workspace.workspaceId,
  });
}
