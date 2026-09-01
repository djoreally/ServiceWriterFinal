import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { dispatchAppointmentLifecycle } from "@/server/messaging/appointment-events";
import { LIFECYCLE_EVENT_KEYS } from "@/server/messaging/lifecycle-events";
import { z } from "zod";

const bodySchema = z.object({ workspace_id: z.string().uuid() });

/** Explicit staff-triggered customer confirmation email. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const appointmentId = z.string().uuid().parse((await context.params).id);
    const { workspace_id } = bodySchema.parse(await request.json());
    const { supabase } = await requireWorkspaceMember(
      workspace_id,
      ["owner", "admin", "manager", "service_advisor", "receptionist", "dispatcher"],
      request,
    );

    const { data: appointment, error } = await supabase
      .from("appointments")
      .select("id,workspace_id,customer_id,starts_at,ends_at,status,notes,metadata,customers(id,first_name,last_name,email),vehicles(id,year,make,model)")
      .eq("workspace_id", workspace_id)
      .eq("id", appointmentId)
      .single();
    if (error || !appointment) throw error ?? new Error("Appointment not found.");

    const { data: workspace } = await supabase
      .from("workspaces")
      .select("name,timezone")
      .eq("id", workspace_id)
      .single();

    const result = await dispatchAppointmentLifecycle({
      eventKey: LIFECYCLE_EVENT_KEYS.bookingCreated,
      eventId: `${appointmentId}:staff-confirmation:${appointment.updated_at ?? appointment.starts_at}`,
      appointment,
      workspaceName: workspace?.name ?? "Service Writer",
      workspaceTimezone: workspace?.timezone ?? "UTC",
      actionUrl: new URL("/my-bookings", request.url).toString(),
    });

    if (!result) return json({ error: { code: "missing_recipient", message: "The appointment has no customer email address." } }, { status: 422 });
    return json({ data: { status: result.status } });
  } catch (error) {
    return errorResponse(error);
  }
}
