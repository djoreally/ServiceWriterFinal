/**
 * Inspections Queries - read operations for templates, items, and vehicle-scoped appointment gates.
 *
 * Phase 2: all data access goes through the typed API client
 * (`@/lib/api-client`) to the appointments Hono router. Exported signatures
 * are unchanged.
 */
import { apiClient } from "@/lib/api-client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";

export interface InspectionTemplate { id: string; name: string; description: string | null; category: string; is_active: boolean; created_at: string; }
export interface InspectionItem { id: string; template_id: string; name: string; description: string | null; category: string | null; is_required: boolean; sort_order: number; }
export interface InspectionTemplateData { templates: InspectionTemplate[]; items: Record<string, InspectionItem[]>; }

export async function fetchInspectionTemplates(): Promise<InspectionTemplateData> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Authentication required");
  const response = await apiClient.get<{ data: InspectionTemplateData }>("/v1/inspections/templates");
  return {
    templates: response.data?.templates ?? [],
    items: response.data?.items ?? {},
  };
}

export interface AppointmentInspectionRequirement {
  templateId: string;
  templateName: string;
  vehicleId: string | null;
  completed: boolean;
}
export interface AppointmentInspectionGate { required: AppointmentInspectionRequirement[]; pendingCount: number; }

/** Required inspections are scoped to the service's vehicle, not the whole appointment. */
export async function fetchAppointmentInspectionGate(appointmentId: string): Promise<AppointmentInspectionGate> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return { required: [], pendingCount: 0 };
  const response = await apiClient.get<{ data: AppointmentInspectionGate }>(
    "/v1/inspections/appointment-gate",
    { query: { appointment_id: appointmentId } },
  );
  return response.data ?? { required: [], pendingCount: 0 };
}
