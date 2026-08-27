/**
 * In-app notification commands.
 *
 * Notification creation is idempotent when callers provide a stable dedupeKey
 * (normally the originating domain event ID plus notification type).
 */
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { getCurrentAuthUser } from "@/lib/auth/current-user";

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

async function getCurrentUserId(): Promise<string | null> {
  const {
    data: { user },
  } = await getCurrentAuthUser();
  return user?.id ?? null;
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
  const userId = await getCurrentUserId();
  if (!userId) {
    console.warn("[Notifications] Cannot create notification: user not authenticated");
    return false;
  }

  const { error } = await supabase
    .from("in_app_notifications")
    .upsert(
      {
        user_id: userId,
        workspace_id: params.workspaceId ?? null,
        type: params.type,
        title: params.title,
        message: params.message,
        metadata: (params.metadata ?? {}) as Json,
        dedupe_key: params.dedupeKey ?? createFallbackDedupeKey(params),
        source_event_id: params.sourceEventId ?? null,
      },
      {
        onConflict: "user_id,dedupe_key",
        ignoreDuplicates: true,
      },
    );

  if (error) {
    console.error("[Notifications] Error creating notification:", error.message);
    return false;
  }
  return true;
}
