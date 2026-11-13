import { useEffect, useCallback, useRef, useState } from "react";
import {
  createWorkflowChannel,
  removeChannel,
  type RealtimeChannel,
  type RealtimePostgresChangesPayload,
} from "@/application/queries/realtime-workflow.query";
import { deriveDispatchStatusFromAppointment } from "@/lib/dispatch-state";
import { toast } from "@/components/ui/sonner";

type WorkflowEvent =
  | { type: "appointment"; action: "INSERT" | "UPDATE" | "DELETE"; record: Record<string, unknown> }
  | { type: "service"; action: "INSERT" | "UPDATE" | "DELETE"; record: Record<string, unknown> };

interface UseRealtimeWorkflowOptions {
  userId?: string;
  onEvent?: (event: WorkflowEvent) => void;
  showToasts?: boolean;
  enabled?: boolean;
}

/**
 * Hook for real-time workflow updates across appointments and service records.
 */
// Backoff for re-creating a channel whose subscribe failed. The realtime
// service can refuse a join transiently (its subscription connection pool
// timing out against the database was observed in production logs,
// 2026-11-08); the previous implementation subscribed exactly once, so a
// single refused join left the UI in a permanent false "Offline" state
// until a full page reload. Retries continue at the last interval while
// the page stays open — a dispatch board can sit open all day.
const REJOIN_DELAYS_MS = [1_500, 4_000, 10_000, 25_000, 60_000];

export function useRealtimeWorkflow({
  userId,
  onEvent,
  showToasts = true,
  enabled = true,
}: UseRealtimeWorkflowOptions = {}) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const handleChange = useCallback(
    (
      type: string,
      payload: RealtimePostgresChangesPayload<Record<string, unknown>>
    ) => {
      if (type !== "appointment" && type !== "service") return;

      const action = payload.eventType as "INSERT" | "UPDATE" | "DELETE";
      const record = payload.new && Object.keys(payload.new).length > 0
        ? payload.new
        : payload.old || {};

      const recordUserId = (record as { user_id?: string }).user_id;
      if (userId && recordUserId && recordUserId !== userId) return;

      const event: WorkflowEvent = { type, action, record };
      onEvent?.(event);

      if (showToasts) {
        const title = (record as { title?: string }).title ||
                     (record as { service_type?: string }).service_type ||
                     (record as { status?: string }).status ||
                     "Item";

        if (type === "appointment" && action === "UPDATE") {
          const previous = (payload.old ?? {}) as Record<string, unknown>;
          const previousDispatch = deriveDispatchStatusFromAppointment(
            previous.status,
            previous.dispatch_status
          );
          const nextDispatch = deriveDispatchStatusFromAppointment(
            (record as { status?: unknown }).status,
            (record as { dispatch_status?: unknown }).dispatch_status
          );

          if (previousDispatch !== nextDispatch) {
            if (nextDispatch === "completed") {
              toast.success(`Appointment "${title}" marked as completed`);
            } else if (nextDispatch === "cancelled") {
              toast.info(`Appointment "${title}" was cancelled`);
            }
          }
        } else if (type === "service" && action === "UPDATE") {
          const status = (record as { status?: string }).status;
          if (status === "completed") toast.success(`Service "${title}" completed`);
          else if (status === "in_progress") toast.info(`Service "${title}" started`);
        }
      }
    },
    [userId, onEvent, showToasts]
  );

  // The event handler is kept in a ref so the subscription effect does not
  // depend on its identity: callers pass inline callbacks that change on
  // every render, and depending on the handler directly tore the channel
  // down and re-created it on each of those renders.
  const handleChangeRef = useRef(handleChange);
  useEffect(() => {
    handleChangeRef.current = handleChange;
  });
  const stableHandleChange = useCallback(
    (
      type: string,
      payload: RealtimePostgresChangesPayload<Record<string, unknown>>
    ) => {
      handleChangeRef.current(type, payload);
    },
    []
  );

  useEffect(() => {
    if (!enabled) {
      if (channelRef.current) {
        void removeChannel(channelRef.current);
        channelRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const connect = async () => {
      if (cancelled) return;
      const previous = channelRef.current;
      channelRef.current = null;
      if (previous) {
        try {
          await removeChannel(previous);
        } catch {
          /* removal is best-effort; a fresh channel is created regardless */
        }
      }
      if (cancelled) return;

      const channelName = `workflow-${userId || "global"}`;

      // Bindings must name tables that EXIST and are in the supabase_realtime
      // publication (migration 20261108010000). The previous bindings pointed
      // at "services" and "service_timeline" — neither table exists in
      // production — and appointments was never published, so this channel
      // could never reach SUBSCRIBED and the UI showed a permanent false
      // "Offline" state. "service" events ride service_records, where a job's
      // service actually starts and completes.
      const channel = createWorkflowChannel(
        channelName,
        [
          { table: "appointments", type: "appointment" },
          { table: "service_records", type: "service" },
        ],
        stableHandleChange
      );
      channelRef.current = channel;

      channel.subscribe((status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          attempt = 0;
          setIsConnected(true);
        } else if (status === "CHANNEL_ERROR" || status === "CLOSED") {
          setIsConnected(false);
          const delay =
            REJOIN_DELAYS_MS[Math.min(attempt, REJOIN_DELAYS_MS.length - 1)];
          attempt += 1;
          timer = setTimeout(() => {
            timer = null;
            void connect();
          }, delay);
        }
        // TIMED_OUT is left to the realtime client's own join retry; the
        // rejoin above handles terminal channel states.
      });
    };

    void connect();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (channelRef.current) {
        void removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setIsConnected(false);
    };
  }, [enabled, userId, stableHandleChange]);

  return { isConnected };
}
