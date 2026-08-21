/**
 * NotificationList Component
 * 
 * Renders the list of notifications with actions.
 */

import { memo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { 
  Bell, 
  Calendar, 
  CreditCard, 
  Package, 
  Mail,
  Check,
  CheckCheck,
  Trash2,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { InAppNotification } from '@/hooks/useNotifications';

interface NotificationListProps {
  notifications: InAppNotification[];
  loading: boolean;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDelete: (id: string) => void;
}

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  new_booking: Calendar,
  booking_update: Calendar,
  payment_received: CreditCard,
  low_inventory: Package,
  email_sent: Mail,
  default: Bell,
};

const TYPE_COLORS: Record<string, string> = {
  new_booking: 'text-gray-500',
  booking_update: 'text-blue-500',
  payment_received: 'text-emerald-500',
  low_inventory: 'text-amber-500',
  email_sent: 'text-violet-500',
  default: 'text-muted-foreground',
};

// ⚡ Performance: Memoized notification item for virtualized list
const NotificationItem = memo(function NotificationItem({
  notification,
  onMarkAsRead,
  onDelete,
}: {
  notification: InAppNotification;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const IconComponent = TYPE_ICONS[notification.type] || TYPE_ICONS.default;
  const iconColor = TYPE_COLORS[notification.type] || TYPE_COLORS.default;

  return (
    <div
      className={cn(
        "flex gap-3 p-3 hover:bg-muted/50 transition-colors border-b",
        !notification.read && "bg-primary/5"
      )}
    >
      <div className={cn("mt-0.5", iconColor)}>
        <IconComponent className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={cn(
            "text-sm font-medium truncate",
            !notification.read && "font-semibold"
          )}>
            {notification.title}
          </p>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
          {notification.message}
        </p>
        <div className="flex gap-1 mt-2">
          {!notification.read && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => onMarkAsRead(notification.id)}
            >
              <Check className="h-3 w-3 mr-1" />
              Mark read
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-destructive hover:text-destructive"
            onClick={() => onDelete(notification.id)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
});

export function NotificationList({
  notifications,
  loading,
  onMarkAsRead,
  onMarkAllAsRead,
  onDelete,
}: NotificationListProps) {
  const hasUnread = notifications.some(n => !n.read);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h4 className="font-semibold text-sm">Notifications</h4>
        {hasUnread && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-auto py-1 px-2 text-xs"
            onClick={onMarkAllAsRead}
          >
            <CheckCheck className="h-3 w-3 mr-1" />
            Mark all read
          </Button>
        )}
      </div>

      {/* List */}
      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Bell className="h-10 w-10 text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No notifications yet</p>
        </div>
      ) : (
        <div className="max-h-[400px] overflow-y-auto">
          {notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onMarkAsRead={onMarkAsRead}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
