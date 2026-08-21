import { getSemanticStatus } from "@/lib/semantic-status";

export type AppointmentStatusStyle = {
  badgeClass: string;
  chipClass: string;
  surfaceClass: string;
};

/**
 * Appointment surfaces now consume the application-wide semantic registry.
 * This keeps schedule, dispatch, technician, and detail views aligned.
 */
export function getAppointmentStatusStyle(
  status: string | null | undefined,
): AppointmentStatusStyle {
  const semantic = getSemanticStatus("appointment", status);
  return {
    badgeClass: semantic.badgeClass,
    chipClass: semantic.chipClass,
    surfaceClass: semantic.surfaceClass,
  };
}
