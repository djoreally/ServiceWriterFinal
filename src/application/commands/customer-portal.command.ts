/**
 * Customer Portal Commands — Write operations for the customer-facing portal.
 */
import { apiClient } from "@/lib/api-client";

/** Reschedule an appointment by management token. */
export async function rescheduleAppointment(
  managementToken: string,
  newDate: string,
  newTime: string,
): Promise<{ success: boolean; message?: string }> {
  const { data } = await apiClient.post<{ data: { success: boolean; message?: string } }>(
    "/v1/crm/customer-portal/appointments/reschedule-by-token",
    {
      management_token: managementToken,
      new_date: newDate,
      new_time: newTime,
    },
  );

  if (data?.success === false) {
    return { success: false, message: data.message };
  }
  return { success: true };
}
