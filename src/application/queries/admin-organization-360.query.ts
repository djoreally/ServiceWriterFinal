import type { Cents } from "@/lib/money";
import { apiClient } from "@/lib/api-client";

export interface Organization360FeatureUsage {
  appointments: boolean;
  customers: boolean;
  inventory: boolean;
  reports: boolean;
  newsletter: boolean;
  marketplace: boolean;
}

export interface Organization360Profile {
  organizationId: string;
  organizationName: string;
  planName: string;
  mrrCents: Cents;
  daysActive: number;
  employeeCount: number;
  customerCount: number;
  vehicleCount: number;
  appointmentCount: number;
  completedAppointmentCount: number;
  revenueCents: Cents;
  featureUsage: Organization360FeatureUsage;
  healthScore: number;
  risk: "Low" | "Medium" | "High";
  lastActiveLabel: string;
  firstValueLabel: string;
  retentionRate: number;
}

export async function fetchOrganization360Profiles(): Promise<Organization360Profile[]> {
  const data = await apiClient.get<Organization360Profile[]>(
    "/v1/platform/admin/organization-360",
  );
  return data ?? [];
}
