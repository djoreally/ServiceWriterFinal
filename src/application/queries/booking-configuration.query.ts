/**
 * Appointment booking configuration read.
 *
 * Phase 2: the immutable booking snapshot (with the canonical
 * appointment → vehicle → service-spec fallback) is resolved server-side in
 * the appointments Hono router
 * (`GET /v1/appointments/:id/booking-configuration`). Exported signatures are
 * unchanged.
 */
import type { AppointmentBookingConfiguration } from "@/lib/booking-configuration";
import { apiClient } from "@/lib/api-client";

export async function fetchAppointmentBookingConfiguration(appointmentId: string): Promise<AppointmentBookingConfiguration | null> {
  const response = await apiClient.get<{ configuration: AppointmentBookingConfiguration | null }>(
    `/v1/appointments/${encodeURIComponent(appointmentId)}/booking-configuration`,
  );
  return response.configuration ?? null;
}
