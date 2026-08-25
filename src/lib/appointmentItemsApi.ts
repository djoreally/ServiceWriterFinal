import { supabase } from "@/integrations/supabase/client";

const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || "/api").replace(/\/$/, "");

export async function syncAppointmentPrimaryService(params: {
  workspaceId: string;
  appointmentId: string;
  serviceCatalogId: string | null;
}): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch(`${baseUrl}/v1/appointment-items`, {
    method: "PUT",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({
      workspace_id: params.workspaceId,
      appointment_id: params.appointmentId,
      service_catalog_id: params.serviceCatalogId,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(payload.error?.message || "Failed to synchronize appointment service");
  }
}
