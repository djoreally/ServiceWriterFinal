/**
 * In-App Notification Commands
 * Abstracts notification creation from the data layer.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export type NotificationType =
  | "new_booking"
  | "booking_update"
  | "payment_received"
  | "low_inventory"
  | "email_sent";

interface CreateNotificationParams {
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, string | number | boolean | null>;
}

/** Get the current authenticated user id */
async function getCurrentUserId(): Promise<string | null> {
  const {
    data: { user },
  } = await getCurrentAuthUser();
  return user?.id ?? null;
}

/** Create an in-app notification for the current user */
export async function createNotification(
  params: CreateNotificationParams
): Promise<boolean> {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.warn("[Notifications] Cannot create notification: user not authenticated");
    return false;
  }

  const { error } = await supabase.from("in_app_notifications").insert([
    {
      user_id: userId,
      type: params.type,
      title: params.title,
      message: params.message,
      metadata: (params.metadata || {}) as Json,
    },
  ]);

  if (error) {
    console.error("[Notifications] Error creating notification:", error.message);
    return false;
  }
  return true;
}
