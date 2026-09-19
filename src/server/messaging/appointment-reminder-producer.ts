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
const ACTIVE_STATUSES = ["confirmed"];
const CANONICAL_PRODUCTION_APP_URL = "https://servicewriter.xyz";
const MAX_CANDIDATES = 200;
const REMINDER_BUDGET_MS = 20_000;
function appBaseUrl(): string { const configured = process.env.NEXT_PUBLIC_APP_URL?.trim(); const vercelUrl = process.env.VERCEL_URL?.trim(); const value = configured || (process.env.VERCEL_ENV === "production" ? CANONICAL_PRODUCTION_APP_URL : vercelUrl ? `https://${vercelUrl}` : CANONICAL_PRODUCTION_APP_URL); return new URL(value).toString().replace(/\/$/, ""); }

export async function produceCustomerAppointmentReminders(now = new Date()) {
  const supabase = createSupabaseAdminClient(); const startedAt = Date.now();
  const maxTarget = Math.max(...CUSTOMER_REMINDERS.map(r => r.targetMs + r.windowMs));
  const minTarget = Math.min(...CUSTOMER_REMINDERS.map(r => r.targetMs - r.windowMs));
  const minFuture = new Date(now.getTime() + Math.max(0, minTarget)).toISOString();
  const maxFuture = new Date(now.getTime() + maxTarget).toISOString();
  const { data: appointments, error } = await supabase.from("appointments").select("id,workspace_id,customer_id,starts_at,ends_at,status,notes,metadata,updated_at,customers(id,first_name,last_name,email),vehicles(id,year,make,model)").in("status", ACTIVE_STATUSES).gte("starts_at", minFuture).lte("starts_at", maxFuture).order("starts_at", { ascending: true }).limit(MAX_CANDIDATES);
  if (error) throw error;
  const workspaceIds = [...new Set((appointments ?? []).map((a: any) => String(a.workspace_id)))];
  const { data: workspaces, error: workspaceError } = workspaceIds.length ? await supabase.from("workspaces").select("id,name,timezone").in("id", workspaceIds) : { data: [], error: null };
  if (workspaceError) throw workspaceError; const workspaceById = new Map((workspaces ?? []).map((w: any) => [String(w.id), w]));
  let queued = 0; let skipped = 0; let deferred = 0;
  outer: for (const appointment of appointments ?? []) {
    if (Date.now() - startedAt >= REMINDER_BUDGET_MS) { deferred += 1; continue; }
    const startsAt = new Date(appointment.starts_at); const untilStart = startsAt.getTime() - now.getTime(); const workspace = workspaceById.get(String(appointment.workspace_id)); if (!workspace) { skipped += 1; continue; }
    for (const reminder of CUSTOMER_REMINDERS) {
      if (Date.now() - startedAt >= REMINDER_BUDGET_MS) { deferred += 1; continue outer; }
      if (Math.abs(untilStart - reminder.targetMs) > reminder.windowMs) continue;
      const eventId = `${appointment.id}:reminder:${reminder.stage}:${appointment.starts_at}`;
      const result = await dispatchAppointmentLifecycle({ eventKey: reminder.key, eventId, appointment: appointment as AppointmentLifecycleRecord, workspaceName: workspace.name ?? "Service Writer", workspaceTimezone: workspace.timezone ?? "UTC", actionUrl: new URL("/my-bookings", `${appBaseUrl()}/`).toString() });
      if (result) queued += 1; else skipped += 1;
    }
  }
  return { scanned: appointments?.length ?? 0, queued, skipped, deferred, capped: (appointments?.length ?? 0) >= MAX_CANDIDATES };
}
