"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
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
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      setNotifications([]);
      setUnreadCount(0);
      updateAppBadge(0);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("in_app_notifications")
      .select("*")
      .eq("user_id", session.user.id)
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[Notifications] Error fetching:", error.message);
      setLoading(false);
      return;
    }

    applyRows((data ?? []) as InAppNotification[]);
    setLoading(false);
  }, [applyRows]);

  const markAsRead = useCallback(async (notificationId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const readAt = new Date().toISOString();
    const { error } = await supabase
      .from("in_app_notifications")
      .update({ read: true, read_at: readAt })
      .eq("id", notificationId)
      .eq("user_id", session.user.id);

    if (error) {
      console.error("[Notifications] Error marking read:", error.message);
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
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const readAt = new Date().toISOString();
    const { error } = await supabase
      .from("in_app_notifications")
      .update({ read: true, read_at: readAt })
      .eq("user_id", session.user.id)
      .eq("read", false);

    if (error) {
      console.error("[Notifications] Error marking all read:", error.message);
      return;
    }
    setNotifications((previous) => previous.map((notification) => ({ ...notification, read: true, read_at: readAt })));
    setUnreadCount(0);
    updateAppBadge(0);
  }, []);

  const deleteNotification = useCallback(async (notificationId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
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

    const { error } = await supabase
      .from("in_app_notifications")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("user_id", session.user.id);

    if (error) {
      locallyDeletedIds.current.delete(notificationId);
      console.error("[Notifications] Error dismissing:", error.message);
      await fetchNotifications();
    }
  }, [fetchNotifications]);

  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let broadcast: BroadcastChannel | null = null;

    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      broadcast = new BroadcastChannel("service-writer-notification-toasts");
      broadcast.onmessage = (event) => {
        const id = event.data?.notificationId;
        if (typeof id === "string") toastedIds.current.add(id);
      };
    }

    const scheduleRetry = () => {
      if (!active || retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        void subscribe();
      }, 3000);
    };

    const subscribe = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active || !session?.user) return;
      const userId = session.user.id;
      const nextChannel = supabase
        .channel(`notifications:${userId}`)
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "in_app_notifications",
          filter: `user_id=eq.${userId}`,
        }, (payload) => {
          const newNotification = payload.new as InAppNotification;
          if (locallyDeletedIds.current.has(newNotification.id)) return;
          if (!(filterNotificationRef.current?.(newNotification) ?? true)) return;

          setNotifications((previous) => {
            if (previous.some((notification) => notification.id === newNotification.id)) return previous;
            return [newNotification, ...previous].slice(0, 50);
          });
          if (!newNotification.read && !newNotification.dismissed_at) {
            setUnreadCount((previous) => {
              const next = previous + 1;
              updateAppBadge(next);
              return next;
            });
          }

          if (showToastOnNewRef.current && !toastedIds.current.has(newNotification.id)) {
            toastedIds.current.add(newNotification.id);
            broadcast?.postMessage({ notificationId: newNotification.id });
            toastRef.current({ title: newNotification.title, description: newNotification.message });
          }
        })
        .on("postgres_changes", {
          event: "UPDATE",
          schema: "public",
          table: "in_app_notifications",
          filter: `user_id=eq.${userId}`,
        }, (payload) => {
          const updated = payload.new as InAppNotification;
          if (updated.dismissed_at) {
            setNotifications((previous) => previous.filter((notification) => notification.id !== updated.id));
          } else {
            setNotifications((previous) => previous.map((notification) => (
              notification.id === updated.id ? updated : notification
            )));
          }
          void fetchNotifications();
        })
        .on("postgres_changes", {
          event: "DELETE",
          schema: "public",
          table: "in_app_notifications",
          filter: `user_id=eq.${userId}`,
        }, (payload) => {
          const deleted = payload.old as InAppNotification;
          setNotifications((previous) => previous.filter((notification) => notification.id !== deleted.id));
          void fetchNotifications();
        })
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") scheduleRetry();
        });

      if (!active) {
        void supabase.removeChannel(nextChannel);
        return;
      }
      channel = nextChannel;
    };

    void fetchNotifications();
    void subscribe();

    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
      if (channel) void supabase.removeChannel(channel);
      broadcast?.close();
    };
  }, [fetchNotifications]);

  return { notifications, unreadCount, loading, markAsRead, markAllAsRead, deleteNotification, refetch: fetchNotifications };
}
