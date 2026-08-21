/**
 * Declined Services Commands — Write operations for declined service tracking.
 */
import { supabase } from "@/integrations/supabase/client";
import type { DeclinedServiceRow } from "@/application/queries/declined-services.query";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
async function requireUser() {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Authentication required");
  return user;
}

export interface TrackDeclinedServicePayload {
  customer_id: string;
  vehicle_id: string | null;
  recommended_service: string;
  catalog_item_id: string | null;
  estimated_cost: number;
  urgency: string;
  decline_reason: string | null;
  decline_notes: string | null;
  appointment_id?: string | null;
}

export async function trackDeclinedService(payload: TrackDeclinedServicePayload): Promise<void> {
  const { error } = await supabase.rpc("track_declined_service", {
    p_customer_id: payload.customer_id,
    p_vehicle_id: payload.vehicle_id,
    p_recommended_service: payload.recommended_service,
    p_estimated_cost: payload.estimated_cost,
    p_urgency: payload.urgency,
    p_decline_reason: payload.decline_reason,
    p_notes: payload.decline_notes,
    p_appointment_id: payload.appointment_id ?? null,
    p_catalog_item_id: payload.catalog_item_id,
  });
  if (error) throw error;
}

export async function sendDeclinedServiceFollowUp(service: DeclinedServiceRow): Promise<void> {
  const user = await requireUser();

  const { error } = await supabase
    .from("declined_services")
    .update({
      follow_up_status: "sent",
      follow_up_sent_at: new Date().toISOString(),
    })
    .eq("id", service.id);
  if (error) throw error;

  await supabase.from("email_queue").insert({
    user_id: user.id,
    customer_id: service.customer_id,
    email_type: "declined_service_followup",
    recipient_email: service.customer_email,
    recipient_name: service.customer_name,
    scheduled_for: new Date().toISOString(),
    metadata: {
      service_name: service.recommended_service,
      estimated_cost: service.estimated_cost,
      urgency: service.urgency,
    },
  });
}

export async function markDeclinedServiceConverted(serviceId: string): Promise<void> {
  const { error } = await supabase
    .from("declined_services")
    .update({
      follow_up_status: "converted",
      was_converted: true,
      converted_at: new Date().toISOString(),
    })
    .eq("id", serviceId);
  if (error) throw error;
}
