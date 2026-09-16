import { createSupabaseAdminClient } from "@/lib/supabase";
import { dispatchAppointmentLifecycle, type AppointmentLifecycleRecord } from "@/server/messaging/appointment-events";
import { LIFECYCLE_EVENT_KEYS } from "@/server/messaging/lifecycle-events";

const MINUTE = 60_000;
const CUSTOMER_REMINDERS = [
  { key: LIFECYCLE_EVENT_KEYS.reminder7Days, targetMs: 7 * 24 * 60 * MINUTE, windowMs: 10 * MINUTE, stage: "7d" },
  { key: LIFECYCLE_EVENT_KEYS.reminder72Hours, targetMs: 72 * 60 * MINUTE, windowMs: 10 * MINUTE, stage: "72h" },
  { key: LIFECYCLE_EVENT_KEYS.reminder24Hours, targetMs: 24 * 60 * MINUTE, windowMs: 10 * MINUTE, stage: "24h" },
  { key: LIFECYCLE_EVENT_KEYS.reminder60Minutes, targetMs: 60 * MINUTE, windowMs: 10 * MINUTE, stage: "60m" },
] as const;

const ACTIVE_STATUSES = ["scheduled", "confirmed", "approved", "pending"];

export async function produceCustomerAppointmentReminders(now = new Date()) {
  const supabase = createSupabaseAdminClient();
  const maxFuture = new Date(now.getTime() + 7 * 24 * 60 * MINUTE + 10 * MINUTE).toISOString();
  const { data: appointments, error } = await supabase
    .from("appointments")
    .select("id,workspace_id,customer_id,starts_at,ends_at,status,notes,metadata,updated_at,customers(id,first_name,last_name,email),vehicles(id,year,make,model)")
    .in("status", ACTIVE_STATUSES)
    .gt("starts_at", now.toISOString())
    .lte("starts_at", maxFuture)
    .order("starts_at", { ascending: true });
  if (error) throw error;

  const workspaceIds = [...new Set((appointments ?? []).map((a: any) => String(a.workspace_id)))];
  const { data: workspaces, error: workspaceError } = workspaceIds.length
    ? await supabase.from("workspaces").select("id,name,timezone").in("id", workspaceIds)
    : { data: [], error: null };
  if (workspaceError) throw workspaceError;
  const workspaceById = new Map((workspaces ?? []).map((w: any) => [String(w.id), w]));

  let queued = 0;
  let skipped = 0;
  for (const appointment of appointments ?? []) {
    const startsAt = new Date(appointment.starts_at);
    const untilStart = startsAt.getTime() - now.getTime();
    const workspace = workspaceById.get(String(appointment.workspace_id));
    if (!workspace) { skipped += 1; continue; }

    for (const reminder of CUSTOMER_REMINDERS) {
      if (Math.abs(untilStart - reminder.targetMs) >= reminder.windowMs) continue;
      const eventId = `${appointment.id}:reminder:${reminder.stage}:${appointment.starts_at}`;
      const result = await dispatchAppointmentLifecycle({
        eventKey: reminder.key,
        eventId,
        appointment: appointment as AppointmentLifecycleRecord,
        workspaceName: workspace.name ?? "Service Writer",
        workspaceTimezone: workspace.timezone ?? "UTC",
        actionUrl: "/my-bookings",
      });
      if (result) queued += 1;
      else skipped += 1;
    }
  }
  return { scanned: appointments?.length ?? 0, queued, skipped };
}
