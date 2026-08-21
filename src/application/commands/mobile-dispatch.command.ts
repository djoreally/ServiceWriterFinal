/**
 * Mobile Dispatch Commands — Write operations for field technician job management.
 */
import { supabase } from "@/integrations/supabase/client";
import { ingestLocationBatch } from "@/application/commands/location-service.command";

export async function updateDispatchStatusRpc(appointmentId: string, status: string) {
  return supabase.rpc("update_dispatch_status", {
    p_appointment_id: appointmentId,
    p_status: status,
  });
}

export async function updateTechnicianLocationRpc(
  lat: number,
  lng: number,
  speed: number | null,
  heading: number | null,
): Promise<{ data: Awaited<ReturnType<typeof ingestLocationBatch>> | null; error: unknown | null }> {
  try {
    const result = await ingestLocationBatch([{
      latitude: lat,
      longitude: lng,
      speedMps: speed,
      headingDegrees: heading,
      source: "legacy",
      capturedAt: new Date().toISOString(),
      qualityFlags: ["legacy_mobile_dispatch_command"],
    }]);
    return { data: result, error: null };
  } catch (error: unknown) {
    return { data: null, error };
  }
}

export async function sendSmsByFunction(
  _to: string,
  _text: string,
  _appointmentId: string,
): Promise<{ data: { skipped: true; reason: "decommissioned" } }> {
  console.log("Skipping SMS send — Telephony has been decommissioned.");
  return { data: { skipped: true, reason: "decommissioned" } };
}
