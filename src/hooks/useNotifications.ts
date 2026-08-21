/**
 * Real-time Notifications Hook
 * 
 * Uses Supabase Realtime to subscribe to new notifications
 * and provides methods to mark as read/dismiss.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// Update PWA app icon badge with unread notification count
function updateAppBadge(count: number) {
  if ('setAppBadge' in navigator) {
    if (count > 0) {
      (navigator as any).setAppBadge(count).catch(() => {});
    } else {
      (navigator as any).clearAppBadge().catch(() => {});
    }
  }
}

export interface InAppNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  read: boolean;
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

  // Fetch existing notifications
  const fetchNotifications = useCallback(async () => {
    // ⚡ Performance: getSession() uses cached session instead of network call
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('in_app_notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[Notifications] Error fetching:', error.message);
      setLoading(false);
      return;
    }

    const typedData = ((data || []) as InAppNotification[]).filter(
      (notification) => !locallyDeletedIds.current.has(notification.id)
        && (filterNotificationRef.current?.(notification) ?? true),
    );
    setNotifications(typedData);
    const count = typedData.filter(n => !n.read).length;
    setUnreadCount(count);
    // ⚡ Update PWA app badge with unread count
    updateAppBadge(count);
    setLoading(false);
  }, []);

  // Mark single notification as read
  const markAsRead = useCallback(async (notificationId: string) => {
    const { error } = await supabase
      .from('in_app_notifications')
      .update({ read: true })
      .eq('id', notificationId);

    if (!error) {
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => {
        const next = Math.max(0, prev - 1);
        updateAppBadge(next);
        return next;
      });
    }
  }, []);

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    // ⚡ Performance: cached session avoids network round-trip
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    const { error } = await supabase
      .from('in_app_notifications')
      .update({ read: true })
      .eq('user_id', session.user.id)
      .eq('read', false);

    if (!error) {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
      updateAppBadge(0);
    }
  }, []);

  // Delete a notification
  const deleteNotification = useCallback(async (notificationId: string) => {
    locallyDeletedIds.current.add(notificationId);
    setNotifications(prev => {
      const removed = prev.find(n => n.id === notificationId);
      if (removed && !removed.read) {
        setUnreadCount(c => {
          const next = Math.max(0, c - 1);
          updateAppBadge(next);
          return next;
        });
      }
      return prev.filter(n => n.id !== notificationId);
    });

    const { error } = await supabase
      .from('in_app_notifications')
      .delete()
      .eq('id', notificationId);

    if (error) {
      locallyDeletedIds.current.delete(notificationId);
      console.error('[Notifications] Error deleting:', error.message);
      fetchNotifications();
    }
  }, [fetchNotifications]);

  // Subscribe to realtime notifications
  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const setupRealtimeSubscription = async () => {
      // ⚡ Performance: cached session avoids network round-trip
      const { data: { session } } = await supabase.auth.getSession();
      if (!active || !session?.user) return;
      const user = session.user;

      const nextChannel = supabase
        .channel(`notifications:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'in_app_notifications',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const newNotification = payload.new as InAppNotification;
            
            if (locallyDeletedIds.current.has(newNotification.id)) return;
            if (!(filterNotificationRef.current?.(newNotification) ?? true)) return;

            // Add to state once. Realtime reconnects can occasionally replay
            // recent inserts, so dedupe by id before incrementing the badge or
            // showing a toast.
            let shouldNotify = false;
            setNotifications(prev => {
              if (prev.some(n => n.id === newNotification.id)) return prev;
              shouldNotify = true;
              return [newNotification, ...prev];
            });
            if (!shouldNotify) return;

            setUnreadCount(prev => {
              const next = prev + 1;
              updateAppBadge(next);
              return next;
            });

            // Show toast for new notification
            if (showToastOnNewRef.current && !toastedIds.current.has(newNotification.id)) {
              toastedIds.current.add(newNotification.id);
              toastRef.current({
                title: newNotification.title,
                description: newNotification.message,
              });
            }
          }
        )
        .subscribe();

      if (!active) {
        supabase.removeChannel(nextChannel);
        return;
      }

      channel = nextChannel;
    };

    fetchNotifications();
    void setupRealtimeSubscription();

    return () => {
      active = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [fetchNotifications]);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refetch: fetchNotifications,
  };
}
