/**
 * In-app notification commands.
 *
 * Notification creation is idempotent when callers provide a stable dedupeKey
 * (normally the originating domain event ID plus notification type).
 */
import { apiClient, ApiClientError } from "@/lib/api-client";
import type { Json } from "@/integrations/supabase/types";

export type NotificationType =
  | "new_booking"
  | "booking_update"
  | "payment_received"
  | "low_inventory"
  | "email_sent"
  | "job_assignment";

type NotificationMetadata = Record<string, Json | undefined>;

export interface CreateNotificationParams {
  type: NotificationType;
  title: string;
  message: string;
  metadata?: NotificationMetadata;
  workspaceId?: string | null;
  /** Stable per-domain-event key. Retries with the same key are ignored. */
  dedupeKey?: string;
  sourceEventId?: string | null;
}

function createFallbackDedupeKey(params: CreateNotificationParams): string {
  // Direct/manual notifications remain unique by default. Domain producers
  // should always supply an event-derived key to receive idempotency.
  return `manual:${params.type}:${crypto.randomUUID()}`;
}

/** Create an in-app notification for the current authenticated user. */
export async function createNotification(
  params: CreateNotificationParams,
): Promise<boolean> {
  try {
    await apiClient.post("/v1/notifications", {
      type: params.type,
      title: params.title,
      message: params.message,
      metadata: params.metadata ?? {},
      workspace_id: params.workspaceId ?? null,
      dedupe_key: params.dedupeKey ?? createFallbackDedupeKey(params),
      source_event_id: params.sourceEventId ?? null,
    });
    return true;
  } catch (error) {
    // Notification creation is best-effort for the caller — never throw.
    if (error instanceof ApiClientError && error.status === 401) {
      console.warn("[Notifications] Cannot create notification: user not authenticated");
    } else {
      console.error("[Notifications] Error creating notification:", error instanceof Error ? error.message : error);
    }
    return false;
  }
}
