import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { dispatchAppointmentLifecycle } from "@/server/messaging/appointment-events";
import { LIFECYCLE_EVENT_KEYS } from "@/server/messaging/lifecycle-events";
import { z } from "zod";

const schema = z.object({ workspace_id: z.string().uuid() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const { workspace_id } = schema.parse(await request.json());
    const { supabase } = await requireWorkspaceMember(workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist", "dispatcher", "technician"], request);

    const { data: serviceRecordId, error } = await supabase.rpc(
      "complete_appointment_v1" as never,
      { p_workspace_id: workspace_id, p_appointment_id: id } as never,
    );
    if (error) throw error;

    try {
      const [{ data: appointment }, { data: workspace }] = await Promise.all([
        supabase
          .from("appointments")
          .select("id,workspace_id,customer_id,starts_at,ends_at,status,notes,metadata,updated_at,customers(id,first_name,last_name,email),vehicles(id,year,make,model)")
          .eq("workspace_id", workspace_id)
          .eq("id", id)
          .single(),
        supabase.from("workspaces").select("name,timezone").eq("id", workspace_id).single(),
      ]);
      if (appointment) {
        await dispatchAppointmentLifecycle({
          eventKey: LIFECYCLE_EVENT_KEYS.serviceCompleted,
          eventId: `${id}:completed:${String(serviceRecordId)}`,
          appointment,
          workspaceName: workspace?.name ?? "Service Writer",
          workspaceTimezone: workspace?.timezone ?? "UTC",
          actionUrl: new URL("/my-bookings", request.url).toString(),
        });
      }
    } catch (dispatchError) {
      console.error("[Lifecycle] service-completed email enqueue failed", dispatchError);
    }

    return json({ data: { appointment_id: id, service_record_id: serviceRecordId } });
  } catch (error) {
    return errorResponse(error);
  }
}
