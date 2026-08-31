/**
 * useGoogleCalendar — Hook to manage Google Calendar sync state
 *
 * Provides connection status, connect/disconnect actions,
 * and a method to push individual appointments to Google Calendar.
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getGoogleCalendarStatus,
} from "@/application/queries/google-calendar.query";
import {
  exchangeGoogleTokens,
  syncAppointmentToGoogle,
  disconnectGoogleCalendar,
  runGoogleCalendarBackfill,
} from "@/application/commands/google-calendar.command";
import { toast } from "@/components/ui/sonner";

export interface GoogleCalendarStatus {
  connected: boolean;
  syncEnabled: boolean;
  /** True when Google revoked/expired the grant — sync is stopped until the user reconnects. */
  needsReauth: boolean;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  calendarId: string | null;
  connectedAt: string | null;
}

const DEFAULT_STATUS: GoogleCalendarStatus = {
  connected: false,
  syncEnabled: false,
  needsReauth: false,
  lastSyncAt: null,
  lastSyncError: null,
  calendarId: null,
  connectedAt: null,
};

export function useGoogleCalendar() {
  const [status, setStatus] = useState<GoogleCalendarStatus>(DEFAULT_STATUS);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  /** Fetch current connection status from edge function */
  const refreshStatus = useCallback(async () => {
    try {
      const { data, error } = await getGoogleCalendarStatus();
      if (error) throw error;
      setStatus({
        connected: data?.connected ?? false,
        syncEnabled: data?.sync_enabled ?? false,
        needsReauth: data?.needs_reauth ?? false,
        lastSyncAt: data?.last_sync_at ?? null,
        lastSyncError: data?.last_sync_error ?? null,
        calendarId: data?.calendar_id ?? null,
        connectedAt: data?.connected_at ?? null,
      });

    } catch {
      // If fetch fails, assume disconnected
      setStatus(DEFAULT_STATUS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => refreshStatus());
  }, [refreshStatus]);

  /**
   * Listen for Google OAuth sign-in and auto-exchange provider tokens.
   * When a user signs in with Google and has calendar scope,
   * Supabase provides provider_token and provider_refresh_token on the session.
   */
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (
          event === "SIGNED_IN" &&
          session?.provider_token
        ) {
          try {
            await exchangeGoogleTokens(
              session.provider_token,
              session.provider_refresh_token ?? null
            );
            await refreshStatus();
          } catch {
            // Silent — user can connect manually later
          }
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [refreshStatus]);

  /** Push a single appointment to Google Calendar */
  const syncAppointment = useCallback(
    async (appointment: Record<string, unknown>) => {
      if (!status.connected) {
        toast.error("Google Calendar is not connected");
        return null;
      }

      setSyncing(true);
      try {
        const { data, error } = await syncAppointmentToGoogle(appointment);
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        toast.success("Appointment synced to Google Calendar");
        await refreshStatus();
        return data;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Sync failed";
        toast.error(`Calendar sync failed: ${msg}`);
        return null;
      } finally {
        setSyncing(false);
      }
    },
    [status.connected, refreshStatus]
  );

  /** Manually re-push all upcoming unsynced appointments */
  const runSyncNow = useCallback(async () => {
    setSyncing(true);
    try {
      const { data, error } = await runGoogleCalendarBackfill();
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const pushed = data?.backfill?.pushed ?? 0;
      const failed = data?.backfill?.failed ?? 0;
      const repaired = data?.backfill?.repaired ?? 0;
      if (failed > 0) {
        toast.warning(`Synced ${pushed} appointment(s), ${failed} failed`);
      } else if (pushed > 0 || repaired > 0) {
        toast.success(
          `Synced ${pushed} new and updated ${repaired} existing appointment(s) on Google Calendar`
        );
      } else {
        toast.success("Calendar already up to date");
      }
      await refreshStatus();
      return data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sync failed";
      toast.error(`Calendar sync failed: ${msg}`);
      return null;
    } finally {
      setSyncing(false);
    }
  }, [refreshStatus]);

  /** Disconnect Google Calendar integration */
  const disconnect = useCallback(async () => {
    try {
      const { data, error } = await disconnectGoogleCalendar();
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setStatus(DEFAULT_STATUS);
      toast.success("Google Calendar disconnected");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Disconnect failed";
      toast.error(msg);
    }
  }, []);

  return {
    status,
    loading,
    syncing,
    refreshStatus,
    syncAppointment,
    runSyncNow,
    disconnect,
  };
}

