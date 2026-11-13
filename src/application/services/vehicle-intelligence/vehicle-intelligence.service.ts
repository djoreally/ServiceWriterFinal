import { supabase } from "@/integrations/supabase/client";
import { evaluateVehicleIntelligence } from "./rules";
import type { VehicleIntelligenceDefaults, VehicleIntelligenceInput } from "./types";

type DynamicQuery = {
  eq: (column: string, value: unknown) => DynamicQuery;
  single: () => Promise<{ data: unknown; error: { message: string } | null }>;
};

type DynamicTable = {
  upsert: (payload: unknown, options?: { onConflict?: string }) => Promise<{ error: { message: string } | null }>;
  select: (columns?: string) => DynamicQuery;
  update: (payload: unknown) => { eq: (column: string, value: unknown) => Promise<{ error: { message: string } | null }> };
};

const db = supabase as unknown as { from: (table: string) => DynamicTable };

export function deriveVehicleIntelligence(input: VehicleIntelligenceInput): VehicleIntelligenceDefaults {
  return evaluateVehicleIntelligence(input);
}

export async function upsertVehicleIntelligenceProfiles(inputs: VehicleIntelligenceInput[]): Promise<void> {
  if (!inputs.length) return;

  const payload = inputs.map((input) => ({
    vehicle_id: input.vehicleId,
    user_id: input.userId,
    workspace_id: input.workspaceId,
    vin: input.vin || null,
    source_profile: input,
    derived_defaults: deriveVehicleIntelligence(input),
  }));

  const { error } = await db
    .from("vehicle_intelligence_profiles")
    .upsert(payload, { onConflict: "vehicle_id" });

  if (error) {
    console.warn("[vehicle-intelligence] upsert failed", error.message);
  }
}

export async function applyVehicleIntelligenceOverride(vehicleId: string, overrideDefaults: Partial<VehicleIntelligenceDefaults>): Promise<void> {
  const { data, error } = await db
    .from("vehicle_intelligence_profiles")
    .select("derived_defaults, override_defaults")
    .eq("vehicle_id", vehicleId)
    .single();

  if (error) {
    console.warn("[vehicle-intelligence] override read failed", error.message);
    return;
  }

  const row = data as { derived_defaults?: VehicleIntelligenceDefaults; override_defaults?: Partial<VehicleIntelligenceDefaults> } | null;
  const derived = (row?.derived_defaults || {}) as VehicleIntelligenceDefaults;
  // Partial-update guard (SW-42): an override call carries only the keys it
  // changes. Merge it over the stored overrides instead of replacing
  // override_defaults outright — replacing silently dropped every previously
  // overridden key from both override_defaults and effective_defaults.
  const storedOverrides = (row?.override_defaults || {}) as Partial<VehicleIntelligenceDefaults>;
  const mergedOverrides = {
    ...storedOverrides,
    ...overrideDefaults,
    maintenanceProfile: {
      ...(storedOverrides.maintenanceProfile || {}),
      ...(overrideDefaults.maintenanceProfile || {}),
    },
  };
  const effective = {
    ...derived,
    ...mergedOverrides,
    maintenanceProfile: {
      ...derived.maintenanceProfile,
      ...(mergedOverrides.maintenanceProfile || {}),
    },
  };

  const { error: updateError } = await db
    .from("vehicle_intelligence_profiles")
    .update({
      override_defaults: mergedOverrides,
      effective_defaults: effective,
      updated_at: new Date().toISOString(),
    })
    .eq("vehicle_id", vehicleId);

  if (updateError) {
    console.warn("[vehicle-intelligence] override write failed", updateError.message);
  }
}
