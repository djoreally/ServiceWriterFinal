/**
 * Team Dashboard Commands — Write operations for team member dashboard.
 */
import { supabase } from "@/integrations/supabase/client";
import type { TechProfile } from "@/application/queries/team-dashboard.query";

export async function updateTechProfile(
  techId: string,
  updates: Partial<TechProfile>,
): Promise<void> {
  const { error } = await supabase
    .from("technicians")
    .update({
      phone: updates.phone,
      working_hours: updates.working_hours as any,
      ...({
        address: updates.address,
        drivers_license_number: updates.drivers_license_number,
        drivers_license_expiry: updates.drivers_license_expiry,
        emergency_contact_name: updates.emergency_contact_name,
        emergency_contact_phone: updates.emergency_contact_phone,
      } as any),
    })
    .eq("id", techId);

  if (error) throw error;
}

export async function updateAppointmentDispatchStatus(
  appointmentId: string,
  newStatus: string,
): Promise<void> {
  const { error } = await supabase
    .from("appointments")
    .update({
      dispatch_status: newStatus,
      status: newStatus === "completed" ? "completed" : undefined,
    })
    .eq("id", appointmentId);

  if (error) throw error;
}

export async function signOutUser(): Promise<void> {
  await supabase.auth.signOut();
}

export async function uploadDriversLicense(
  userId: string,
  techId: string,
  file: File,
): Promise<string> {
  const filePath = `${userId}/${techId}/drivers-license.${file.name.split(".").pop()}`;

  const { error: uploadError } = await supabase.storage
    .from("team-documents")
    .upload(filePath, file, { upsert: true });

  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage
    .from("team-documents")
    .getPublicUrl(filePath);

  await supabase
    .from("technicians")
    .update({ drivers_license_url: publicUrl } as any)
    .eq("id", techId);

  return publicUrl;
}
