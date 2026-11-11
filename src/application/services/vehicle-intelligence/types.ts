export type ServiceClass = "light_duty" | "van" | "diesel" | "euro" | "heavy_duty" | "ev";

export type MaintenanceProfile = {
  oilChangeMiles: number;
  oilChangeMonths: number;
  inspectionMiles: number;
  inspectionMonths: number;
  severity: "normal" | "severe";
};

export type VehicleIntelligenceDefaults = {
  oilSpecification: string;
  estimatedOilCapacityQuarts: number;
  oilFilterCategory: string;
  serviceClass: ServiceClass;
  maintenanceProfile: MaintenanceProfile;
};

export type VehicleIntelligenceInput = {
  vehicleId: string;
  userId: string;
  /** Step 9: tenancy for vehicle_intelligence_profiles (user_id stays the actor). */
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
};
