/**
 * Team Dashboard Commands — Write operations for team member dashboard.
 */
import { apiClient } from "@/lib/api-client";
import type { TechProfile } from "@/application/queries/team-dashboard.query";
import { resetCurrentAuthUserCache } from "@/lib/auth/current-user";
import { updateAppointmentStatus } from "@/application/commands/appointment-detail.command";

export async function updateTechProfile(
  techId: string,
  updates: Partial<TechProfile>,
): Promise<void> {
  await apiClient.patch(`/v1/team/dashboard/profile/${techId}`, {
    phone: updates.phone,
    working_hours: updates.working_hours,
    address: updates.address,
    drivers_license_number: updates.drivers_license_number,
    drivers_license_expiry: updates.drivers_license_expiry,
    emergency_contact_name: updates.emergency_contact_name,
    emergency_contact_phone: updates.emergency_contact_phone,
  });
}

export async function updateAppointmentDispatchStatus(
  appointmentId: string,
  newStatus: string,
): Promise<void> {
  await updateAppointmentStatus(appointmentId, newStatus);
}

/**
 * Local-scope sign-out. There is no sanctioned server endpoint for session
 * revocation in this domain, and the browser Supabase client is off-limits,
 * so this mirrors `supabase.auth.signOut({ scope: "local" })` (the semantics
 * of the canonical signout command): drop the cached user and the stored
 * session so the next apiClient call goes out unauthenticated.
 */
export async function signOutUser(): Promise<void> {
  resetCurrentAuthUserCache();
  if (typeof window !== "undefined") {
    for (const key of Object.keys(window.localStorage)) {
      if (/^sb-.*-auth-token(-code-verifier)?$/.test(key)) {
        window.localStorage.removeItem(key);
      }
    }
  }
}

export async function uploadDriversLicense(
  userId: string,
  techId: string,
  file: File,
): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("user_id", userId);
  form.append("tech_id", techId);
  const response = await apiClient.post<{ data: { public_url: string } }>(
    "/v1/team/dashboard/drivers-license",
    form,
  );
  return response.data.public_url;
}
