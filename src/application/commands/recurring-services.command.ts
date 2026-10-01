/**
 * Recurring Services Commands — Write operations for recurring service records.
 *
 * Phase 2: all data access goes through the typed API client
 * (`@/lib/api-client`) to the work-orders Hono router. Exported signatures
 * are unchanged.
 */
import { apiClient } from "@/lib/api-client";
import type { CreateRecurringServiceInput, RecurringServiceRecord } from "@/application/queries/recurring-services.query";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
function addInterval(date: Date, frequency: CreateRecurringServiceInput["frequency"], interval: number): Date {
  const next = new Date(date);
  if (frequency === "days") next.setDate(next.getDate() + interval);
  if (frequency === "weeks") next.setDate(next.getDate() + interval * 7);
  if (frequency === "months") next.setMonth(next.getMonth() + interval);
  if (frequency === "years") next.setFullYear(next.getFullYear() + interval);
  return next;
}

export async function createRecurringService(input: CreateRecurringServiceInput): Promise<RecurringServiceRecord> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Authentication required");

  const startDate = new Date(input.start_date);
  const nextDueDate = addInterval(startDate, input.frequency, input.interval).toISOString().split("T")[0];

  const response = await apiClient.post<{ data: RecurringServiceRecord }>("/v1/recurring-services", {
    user_id: user.id,
    service_catalog_id: input.service_catalog_id,
    customer_id: input.customer_id || null,
    vehicle_id: input.vehicle_id || null,
    frequency: input.frequency,
    interval: input.interval,
    start_date: input.start_date,
    next_due_date: nextDueDate,
  });
  return response.data;
}
