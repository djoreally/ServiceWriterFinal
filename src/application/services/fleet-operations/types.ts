export type FleetVehicleServiceStatus = "due" | "overdue" | "upcoming" | "ok";

export type FleetServiceRule = {
  id: string;
  fleetClientId: string | null;
  serviceClass: string;
  intervalMiles: number;
  intervalMonths: number;
  baseLaborPackage: string;
  basePrice: number;
  isActive: boolean;
};

export type FleetVehicleOpsRow = {
  vehicleId: string;
  fleetClientId: string | null;
  fleetClientName: string | null;
  locationId: string | null;
  locationName: string | null;
  serviceClass: string;
  unitNumber: string | null;
  vin: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  lastServiceDate: string | null;
  lastServiceMileage: number | null;
  nextDueDate: string | null;
  nextDueMileage: number | null;
  status: FleetVehicleServiceStatus;
  ruleId: string | null;
  baseLaborPackage: string;
  basePrice: number;
};

export type FleetOperationsOverview = {
  vehiclesDue: FleetVehicleOpsRow[];
  vehiclesOverdue: FleetVehicleOpsRow[];
  upcomingWorkload: Array<{ weekStart: string; count: number }>;
  serviceHistoryRollups: Array<{ fleetClientId: string | null; fleetClientName: string; completedServices30d: number; completedServices90d: number }>;
  groupedCounts: {
    byFleet: Array<{ key: string; label: string; count: number }>;
    byCustomer: Array<{ key: string; label: string; count: number }>;
    byLocation: Array<{ key: string; label: string; count: number }>;
    byServiceClass: Array<{ key: string; label: string; count: number }>;
  };
};

export type FleetUpcomingQueueRow = {
  id: string;
  fleetClientId: string | null;
  fleetClientName: string | null;
  locationName: string | null;
  vehicleLabel: string;
  dueDate: string | null;
  dueMileage: number | null;
  queueStatus: string;
  proposedScheduledDate: string | null;
  proposedScheduledTime: string | null;
  routeBatchKey: string | null;
};
