"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { apiClient, ApiClientError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";

function updateAppBadge(count: number) {
  if (typeof navigator === "undefined") return;
  const badgeNavigator = navigator as Navigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (count > 0) void badgeNavigator.setAppBadge?.(count);
  else void badgeNavigator.clearAppBadge?.();
}

export interface InAppNotification {
  id: string;
  user_id: string;
  workspace_id?: string | null;
  type: string;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  dedupe_key?: string;
  source_event_id?: string | null;
  read: boolean;
  read_at?: string | null;
  dismissed_at?: string | null;
  created_at: string;
}

interface UseNotificationsOptions {
  showToastOnNew?: boolean;
  filterNotification?: (notification: InAppNotification) => boolean;
}

export function useNotifications(options: UseNotificationsOptions = {}) {
  const { showToastOnNew = true, filterNotification } = options;
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const locallyDeletedIds = useRef(new Set<string>());
  const toastedIds = useRef(new Set<string>());
  const knownIds = useRef(new Set<string>());
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  const { toast } = useToast();
  const showToastOnNewRef = useRef(showToastOnNew);
  const filterNotificationRef = useRef(filterNotification);
  const toastRef = useRef(toast);

  useEffect(() => {
    showToastOnNewRef.current = showToastOnNew;
    filterNotificationRef.current = filterNotification;
    toastRef.current = toast;
  }, [showToastOnNew, filterNotification, toast]);

  const applyRows = useCallback((rows: InAppNotification[]) => {
    knownIds.current = new Set(rows.map((notification) => notification.id));
    const visibleRows = rows
      .filter((notification) => !locallyDeletedIds.current.has(notification.id))
      .filter((notification) => filterNotificationRef.current?.(notification) ?? true)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, 50);
    setNotifications(visibleRows);
    const count = visibleRows.filter((notification) => !notification.read && !notification.dismissed_at).length;
    setUnreadCount(count);
    updateAppBadge(count);
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const { data } = await apiClient.get<{ data: InAppNotification[] }>("/v1/notifications");
      applyRows(data ?? []);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        knownIds.current = new Set();
        setNotifications([]);
        setUnreadCount(0);
        updateAppBadge(0);
      } else {
        console.error("[Notifications] Error fetching:", error instanceof Error ? error.message : error);
      }
    } finally {
      setLoading(false);
    }
  }, [applyRows]);

  const markAsRead = useCallback(async (notificationId: string) => {
    const readAt = new Date().toISOString();
    try {
      await apiClient.patch(`/v1/notifications/${notificationId}/read`, {});
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) return;
      console.error("[Notifications] Error marking read:", error instanceof Error ? error.message : error);
      return;
    }
    setNotifications((previous) => previous.map((notification) => (
      notification.id === notificationId ? { ...notification, read: true, read_at: readAt } : notification
    )));
    setUnreadCount((previous) => {
      const next = Math.max(0, previous - 1);
      updateAppBadge(next);
      return next;
    });
  }, []);

  const markAllAsRead = useCallback(async () => {
    const readAt = new Date().toISOString();
    try {
      await apiClient.patch("/v1/notifications/read-all", {});
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) return;
      console.error("[Notifications] Error marking all read:", error instanceof Error ? error.message : error);
      return;
    }
    setNotifications((previous) => previous.map((notification) => ({ ...notification, read: true, read_at: readAt })));
    setUnreadCount(0);
    updateAppBadge(0);
  }, []);

  const deleteNotification = useCallback(async (notificationId: string) => {
    locallyDeletedIds.current.add(notificationId);
    setNotifications((previous) => {
      const removed = previous.find((notification) => notification.id === notificationId);
      if (removed && !removed.read) {
        setUnreadCount((count) => {
          const next = Math.max(0, count - 1);
          updateAppBadge(next);
          return next;
        });
      }
      return previous.filter((notification) => notification.id !== notificationId);
    });

    try {
      await apiClient.delete(`/v1/notifications/${notificationId}`);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) return;
      locallyDeletedIds.current.delete(notificationId);
      console.error("[Notifications] Error dismissing:", error instanceof Error ? error.message : error);
      await fetchNotifications();
    }
  }, [fetchNotifications]);

  /**
   * Merge a polled snapshot into state, toasting for rows we have not seen
   * before. This replaces the browser Supabase realtime subscription
   * (websocket), which has no server-side equivalent.
   */
  const mergePolledRows = useCallback((rows: InAppNotification[]) => {
    const freshRows = rows.filter((notification) => !knownIds.current.has(notification.id));
    applyRows(rows);
    for (const notification of freshRows) {
      if (locallyDeletedIds.current.has(notification.id)) continue;
      if (!(filterNotificationRef.current?.(notification) ?? true)) continue;
      if (showToastOnNewRef.current && !toastedIds.current.has(notification.id)) {
        toastedIds.current.add(notification.id);
        broadcastRef.current?.postMessage({ notificationId: notification.id });
        toastRef.current({ title: notification.title, description: notification.message });
      }
    }
  }, [applyRows]);

  useEffect(() => {
    let active = true;
    let broadcast: BroadcastChannel | null = null;

    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      broadcast = new BroadcastChannel("service-writer-notification-toasts");
      broadcast.onmessage = (event) => {
        const id = event.data?.notificationId;
        if (typeof id === "string") toastedIds.current.add(id);
      };
    }
    broadcastRef.current = broadcast;

    const poll = async () => {
      if (!active) return;
      try {
        const { data } = await apiClient.get<{ data: InAppNotification[] }>("/v1/notifications");
        if (!active) return;
        mergePolledRows(data ?? []);
      } catch {
        // Polling is best-effort — the next interval retries.
      }
    };

    void Promise.resolve().then(() => fetchNotifications());
    const pollTimer: ReturnType<typeof setInterval> | undefined = setInterval(() => {
      void poll();
    }, 5000);

    return () => {
      active = false;
      if (pollTimer) clearInterval(pollTimer);
      broadcastRef.current = null;
      broadcast?.close();
    };
  }, [fetchNotifications, mergePolledRows]);

  return { notifications, unreadCount, loading, markAsRead, markAllAsRead, deleteNotification, refetch: fetchNotifications };
}
