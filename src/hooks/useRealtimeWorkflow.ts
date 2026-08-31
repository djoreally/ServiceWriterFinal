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
  | { type: "service"; action: "INSERT" | "UPDATE" | "DELETE"; record: Record<string, unknown> }
  | { type: "timeline"; action: "INSERT" | "UPDATE" | "DELETE"; record: Record<string, unknown> };

interface UseRealtimeWorkflowOptions {
  userId?: string;
  onEvent?: (event: WorkflowEvent) => void;
  showToasts?: boolean;
  enabled?: boolean;
}

/**
 * Hook for real-time workflow updates across appointments, services, and timeline.
 */
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
      if (type !== "appointment" && type !== "service" && type !== "timeline") return;

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

  useEffect(() => {
    if (!enabled) {
      if (channelRef.current) {
        removeChannel(channelRef.current);
        channelRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    if (channelRef.current) return;

    const channelName = `workflow-${userId || "global"}`;

    const channel = createWorkflowChannel(
      channelName,
      [
        { table: "appointments", type: "appointment" },
        { table: "services", type: "service" },
        { table: "service_timeline", type: "timeline" },
      ],
      handleChange
    );

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") setIsConnected(true);
      else if (status === "CLOSED" || status === "CHANNEL_ERROR") setIsConnected(false);
    });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        removeChannel(channelRef.current);
        channelRef.current = null;
        setIsConnected(false);
      }
    };

  }, [enabled, handleChange, userId]);

  return { isConnected };
}
