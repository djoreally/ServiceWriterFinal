export type ServiceDefaults = {
  oilSpec: string;
  oilCapacityQuarts: number;
  recommendedServiceType: string;
  baseLaborServicePackage: string;
  source: "vehicle_intelligence" | "derived_fallback" | "manual";
};
