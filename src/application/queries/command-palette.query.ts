import { apiClient } from "@/lib/api-client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export async function searchCommandPalette(_userId: string, query: string) {
  const q = query.trim();
  if (q.length < 2) {
    return { customers: [], appointments: [] };
  }

  const context = await resolveCurrentWorkspace();
  if (!context) return { customers: [], appointments: [] };

  const { customers, appointmentRows } = await apiClient.get<{
    customers: Array<{ id: string; name: string; email: string | null; phone: string | null }>;
    appointmentRows: any[];
  }>("/v1/platform/command-palette/search", {
    query: { q, selected_workspace_id: context.workspaceId },
  });

  const lower = q.toLowerCase();
  const appointments = (appointmentRows ?? [])
    .filter((appointment: any) => {
      const metadata = appointment.metadata && typeof appointment.metadata === "object" ? appointment.metadata : {};
      const searchable = [
        appointment.status,
        appointment.confirmation_code,
        metadata.title,
        metadata.service_name,
        metadata.customer_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return searchable.includes(lower);
    })
    .slice(0, 8)
    .map((appointment: any) => {
      const startsAt = appointment.starts_at ? new Date(appointment.starts_at) : null;
      const metadata = appointment.metadata && typeof appointment.metadata === "object" ? appointment.metadata : {};
      return {
        id: appointment.id,
        title: metadata.title || metadata.service_name || appointment.confirmation_code || "Appointment",
        scheduled_date: startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt.toLocaleDateString() : "",
        scheduled_time: startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "",
        status: appointment.status,
      };
    });

  return { customers: customers ?? [], appointments };
}
