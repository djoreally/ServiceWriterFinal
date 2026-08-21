/**
 * NotificationBell Component
 * 
 * Displays a bell icon with unread count badge.
 * Clicking opens the NotificationCenter popover.
 */

import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useNotifications } from '@/hooks/useNotifications';
import { NotificationList } from './NotificationList';
import type { InAppNotification } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';

interface NotificationBellProps {
  filterNotification?: (notification: InAppNotification) => boolean;
}

export function NotificationBell({ filterNotification }: NotificationBellProps = {}) {
  const { 
    notifications, 
    unreadCount, 
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications({ filterNotification });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span 
              className={cn(
                "absolute -top-1 -right-1 flex items-center justify-center",
                "min-w-[18px] h-[18px] px-1 text-xs font-bold",
                "bg-destructive text-destructive-foreground rounded-full",
                "animate-in zoom-in-50 duration-200"
              )}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
          <span className="sr-only">
            {unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-80 p-0" 
        align="end" 
        sideOffset={8}
      >
        <NotificationList
          notifications={notifications}
          loading={loading}
          onMarkAsRead={markAsRead}
          onMarkAllAsRead={markAllAsRead}
          onDelete={deleteNotification}
        />
      </PopoverContent>
    </Popover>
  );
}
