import { supabase } from "@/integrations/supabase/client";
import { deriveVehicleIntelligence } from "@/application/services/vehicle-intelligence/vehicle-intelligence.service";
import type { VehicleIntelligenceDefaults, VehicleIntelligenceInput } from "@/application/services/vehicle-intelligence/types";
import type { ServiceDefaults } from "./types";

const PACKAGE_BY_CLASS: Record<string, { serviceType: string; package: string }> = {
  light_duty: { serviceType: "Preventive Maintenance", package: "PM-A Standard" },
  van: { serviceType: "Fleet Van Service", package: "PM-B Van Duty" },
  diesel: { serviceType: "Diesel Maintenance", package: "PM-C Diesel" },
  euro: { serviceType: "Euro Synthetic Service", package: "PM-E Euro" },
  heavy_duty: { serviceType: "Heavy-Duty Service", package: "PM-HD" },
  ev: { serviceType: "EV Multi-Point Inspection", package: "EV-Inspect" },
};

type IntelligenceRow = {
  derived_defaults?: VehicleIntelligenceDefaults;
  effective_defaults?: VehicleIntelligenceDefaults;
};

type QueryResult = { data: unknown; error?: { message: string } | null };
type DynamicQuery = { eq: (column: string, value: unknown) => DynamicQuery; maybeSingle: () => Promise<QueryResult> };
type DynamicSupabase = { from: (table: string) => { select: (columns: string) => DynamicQuery } };

const db = supabase as unknown as DynamicSupabase;

function toServiceDefaults(defaults: VehicleIntelligenceDefaults, source: ServiceDefaults["source"]): ServiceDefaults {
  const packageConfig = PACKAGE_BY_CLASS[defaults.serviceClass] || PACKAGE_BY_CLASS.light_duty;
  return {
    oilSpec: defaults.oilSpecification,
    oilCapacityQuarts: defaults.estimatedOilCapacityQuarts,
    recommendedServiceType: packageConfig.serviceType,
    baseLaborServicePackage: packageConfig.package,
    source,
  };
}

export async function resolveServiceDefaultsForVehicle(input: {
  vehicleId: string;
  userId: string;
  /** Step 9: profiles are workspace-keyed; null means no workspace context. */
  workspaceId: string | null;
  vin?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  engine?: string | null;
  engineCylinders?: number | null;
  displacementLiters?: number | null;
  fuelTypePrimary?: string | null;
  vehicleType?: string | null;
}): Promise<ServiceDefaults | null> {
  // Step 9 translation: the profile read keys on workspace_id, not the
  // actor's user_id. With no workspace context there is no profile to
  // read — fall through to the derived fallback below.
  const { data } = input.workspaceId
    ? await db
        .from("vehicle_intelligence_profiles")
        .select("derived_defaults,effective_defaults")
        .eq("vehicle_id", input.vehicleId)
        .eq("workspace_id", input.workspaceId)
        .maybeSingle()
    : { data: null };

  const fromProfile = data as IntelligenceRow | null;
  if (fromProfile?.effective_defaults) {
    return toServiceDefaults(fromProfile.effective_defaults, "vehicle_intelligence");
  }

  if (fromProfile?.derived_defaults) {
    return toServiceDefaults(fromProfile.derived_defaults, "vehicle_intelligence");
  }

  const intelligenceInput: VehicleIntelligenceInput = {
    vehicleId: input.vehicleId,
    userId: input.userId,
    workspaceId: input.workspaceId,
    vin: input.vin || null,
    year: input.year || null,
    make: input.make || null,
    model: input.model || null,
    engine: input.engine || null,
    engineCylinders: input.engineCylinders || null,
    displacementLiters: input.displacementLiters || null,
    fuelTypePrimary: input.fuelTypePrimary || null,
    vehicleType: input.vehicleType || null,
  };

  const derived = deriveVehicleIntelligence(intelligenceInput);
  return toServiceDefaults(derived, "derived_fallback");
}
