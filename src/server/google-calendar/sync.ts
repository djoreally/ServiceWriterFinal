/**
 * Google Calendar auto-sync — server-side hook for the appointment lifecycle.
 *
 * Call this after a successful appointment write (create, update/reschedule,
 * cancel). It pushes the appointment to the *caller's* connected Google
 * Calendar via the `google-calendar-sync` edge function:
 * - create  -> insert a calendar event
 * - update  -> patch the calendar event
 * - cancel  -> delete the calendar event
 * (The create/update/delete decision lives in the edge function, which reads
 * the appointment's current status.)
 *
 * Design notes:
 * - Tokens are per-user, so sync runs under the calling user's Google
 *   connection. Callers who never connected are skipped silently (no failure
 *   recorded — they never opted in).
 * - Sync failures NEVER fail the appointment write and NEVER throw: they are
 *   logged and the failure is recorded in `metadata.calendar_sync` so the UI
 *   can show an honest per-appointment sync status.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/server/api";

/** Metadata key carrying the last Google Calendar sync outcome. */
export const CALENDAR_SYNC_METADATA_KEY = "calendar_sync";

export type CalendarSyncStatus = "synced" | "failed";

export interface CalendarSyncRecord {
  status: CalendarSyncStatus;
  /** ISO timestamp of the sync attempt. */
  at: string;
  /** Edge-function action: created | updated | deleted. */
  action?: string;
  google_event_id?: string;
  /** Present only when status is "failed". */
  error?: string;
}

export interface AppointmentCalendarSyncContext {
  /** Supabase client authenticated as the caller (caller's JWT). */
  supabase: SupabaseClient;
  /** The caller's user id — Google tokens are stored per-user. */
  userId: string;
  /** Appointment id to sync. */
  appointmentId: string;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Merge the sync record into the appointment's metadata without touching any
 * other metadata keys. Never throws.
 */
async function recordCalendarSyncStatus(
  supabase: SupabaseClient,
  appointmentId: string,
  record: CalendarSyncRecord,
): Promise<void> {
  try {
    const { data: current, error: readError } = await supabase
      .from("appointments")
      .select("metadata")
      .eq("id", appointmentId)
      .maybeSingle();
    if (readError) throw readError;
    const existing =
      current?.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
        ? (current.metadata as Record<string, unknown>)
        : {};
    const { error: writeError } = await supabase
      .from("appointments")
      .update({ metadata: { ...existing, [CALENDAR_SYNC_METADATA_KEY]: record } })
      .eq("id", appointmentId);
    if (writeError) throw writeError;
  } catch (error) {
    console.error("[GoogleCalendar] failed to record calendar sync status", {
      appointmentId,
      error: describeError(error),
    });
  }
}

/**
 * Push one appointment to the caller's connected Google Calendar.
 * Safe to call from any appointment mutation handler: it never throws and
 * never affects the appointment write itself.
 */
export async function syncAppointmentToGoogleCalendar(
  ctx: AppointmentCalendarSyncContext,
): Promise<void> {
  try {
    // Only users who connected Google Calendar get synced. No token row (or a
    // disabled one) means the user never opted in — skip silently so their
    // appointments are not stamped with bogus "failed" records.
    const { data: tokenRow, error: tokenError } = await ctx.supabase
      .from("google_calendar_sync_tokens")
      .select("sync_enabled")
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (tokenError) throw tokenError;
    if (!tokenRow?.sync_enabled) return;

    try {
      const { data, error } = await ctx.supabase.functions.invoke("google-calendar-sync", {
        body: { mode: "sync_appointment", appointment: ctx.appointmentId },
      });
      if (error) throw error;
      const payload = (data ?? {}) as { action?: string; google_event_id?: string };
      await recordCalendarSyncStatus(ctx.supabase, ctx.appointmentId, {
        status: "synced",
        at: new Date().toISOString(),
        action: payload.action,
        google_event_id: payload.google_event_id,
      });
    } catch (syncError) {
      const message = describeError(syncError);
      console.error("[GoogleCalendar] auto-sync failed; appointment write is unaffected", {
        appointmentId: ctx.appointmentId,
        userId: ctx.userId,
        error: message,
      });
      await recordCalendarSyncStatus(ctx.supabase, ctx.appointmentId, {
        status: "failed",
        at: new Date().toISOString(),
        error: message,
      });
    }
  } catch (unexpected) {
    // Bookkeeping around the sync (token lookup, status write) must never
    // break the appointment response either.
    console.error("[GoogleCalendar] auto-sync bookkeeping failed", {
      appointmentId: ctx.appointmentId,
      error: describeError(unexpected),
    });
  }
}

/**
 * Handler-level convenience wrapper: resolves the caller from the request and
 * syncs. Never throws. Anonymous contexts (e.g. public booking) have no user
 * token to sync under and are skipped silently.
 */
export async function queueAppointmentCalendarSync(
  request: Request,
  appointmentId: string,
): Promise<void> {
  try {
    const { supabase, user } = await requireUser(request);
    await syncAppointmentToGoogleCalendar({ supabase, userId: user.id, appointmentId });
  } catch {
    // Not authenticated — nothing to sync under.
  }
}
