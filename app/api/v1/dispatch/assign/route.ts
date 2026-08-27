import { z } from "zod";
import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { dispatchAppointmentLifecycle } from "@/server/messaging/appointment-events";
import { LIFECYCLE_EVENT_KEYS } from "@/server/messaging/lifecycle-events";

const assignmentSchema = z.object({
  workspace_id: z.string().uuid(),
  job_source: z.enum(["appointment", "work_order"]),
  job_id: z.string().uuid(),
  technician_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const body = assignmentSchema.parse(await request.json());
    const { supabase } = await requireWorkspaceMember(body.workspace_id, ["owner", "admin", "manager", "service_advisor", "dispatcher"], request);
    let previousTechnicianId: string | null | undefined;
    if (body.job_source === "appointment") {
      const previousAssignment = await supabase.from("appointments").select("assigned_user_id").eq("workspace_id", body.workspace_id).eq("id", body.job_id).single();
      previousTechnicianId = previousAssignment.data?.assigned_user_id;
    } else {
      const previousAssignment = await supabase.from("work_order_assignments").select("user_id").eq("workspace_id", body.workspace_id).eq("work_order_id", body.job_id).is("unassigned_at", null).order("assigned_at", { ascending: false }).limit(1).maybeSingle();
      previousTechnicianId = previousAssignment.data?.user_id;
    }
    const { data, error } = await supabase.rpc("assign_dispatch_job_v1", {
      p_workspace_id: body.workspace_id,
      p_job_source: body.job_source,
      p_job_id: body.job_id,
      p_technician_id: body.technician_id ?? null,
      p_notes: body.notes ?? null,
    });
    if (error) throw error;
    try {
      const appointmentId = body.job_source === "appointment"
        ? body.job_id
        : (await supabase.from("work_orders").select("appointment_id").eq("workspace_id", body.workspace_id).eq("id", body.job_id).single()).data?.appointment_id;
      if (appointmentId) {
        const [{ data: appointment }, { data: workspace }] = await Promise.all([
          supabase
            .from("appointments")
            .select("id,workspace_id,customer_id,starts_at,ends_at,status,notes,metadata,updated_at,customers(id,first_name,last_name,email),vehicles(id,year,make,model)")
            .eq("workspace_id", body.workspace_id)
            .eq("id", appointmentId)
            .single(),
          supabase.from("workspaces").select("name,timezone").eq("id", body.workspace_id).single(),
        ]);
        if (appointment) {
          const admin = createSupabaseAdminClient();
          const newTechnician = body.technician_id ? await admin.auth.admin.getUserById(body.technician_id) : null;
          const technicianName = String(
            newTechnician?.data?.user?.user_metadata?.full_name
            || newTechnician?.data?.user?.user_metadata?.name
            || newTechnician?.data?.user?.email?.split("@")[0]
            || "Unassigned",
          );
          const customerUrl = new URL("/my-bookings", request.url).toString();
          const staffUrl = new URL(`/appointments/${appointmentId}`, request.url).toString();
          if (body.technician_id) {
            await dispatchAppointmentLifecycle({
              eventKey: LIFECYCLE_EVENT_KEYS.technicianAssigned,
              eventId: `${appointmentId}:customer-assignment:${body.technician_id}`,
              appointment,
              workspaceName: workspace?.name ?? "Service Writer",
              workspaceTimezone: workspace?.timezone ?? "UTC",
              actionUrl: customerUrl,
              technicianName,
            });
            const newTechnicianEmail = newTechnician?.data?.user?.email;
            if (newTechnicianEmail) {
              await dispatchAppointmentLifecycle({
                eventKey: LIFECYCLE_EVENT_KEYS.jobAssigned,
                eventId: `${appointmentId}:technician-assignment:${body.technician_id}`,
                appointment,
                workspaceName: workspace?.name ?? "Service Writer",
                workspaceTimezone: workspace?.timezone ?? "UTC",
                actionUrl: staffUrl,
                recipientEmail: newTechnicianEmail,
                recipientRole: "technician",
                technicianName,
              });
            }
          }
          if (previousTechnicianId && previousTechnicianId !== body.technician_id) {
            const previousTechnician = await admin.auth.admin.getUserById(previousTechnicianId);
            if (previousTechnician.data.user?.email) {
              await dispatchAppointmentLifecycle({
                eventKey: LIFECYCLE_EVENT_KEYS.assignmentChanged,
                eventId: `${appointmentId}:previous-technician:${previousTechnicianId}:${body.technician_id ?? "unassigned"}`,
                appointment,
                workspaceName: workspace?.name ?? "Service Writer",
                workspaceTimezone: workspace?.timezone ?? "UTC",
                actionUrl: staffUrl,
                recipientEmail: previousTechnician.data.user.email,
                recipientRole: "technician",
                technicianName,
              });
            }
          }
        }
      }
    } catch (dispatchError) {
      console.error("[Lifecycle] dispatch-assignment email enqueue failed", dispatchError);
    }
    return json({ data: data ?? null });
  } catch (error) {
    return errorResponse(error);
  }
}
