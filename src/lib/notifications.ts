/**
 * In-App Notification Creator
 * 
 * Utility function to create in-app notifications from the frontend.
 * Uses the authenticated user's session via the application command layer.
 */

import {
  createNotification,
  type NotificationType,
} from "@/application/commands/notifications.command";

export type { NotificationType };

/**
 * Create a low inventory notification
 */
export async function notifyLowInventory(itemName: string, quantity: number, threshold: number): Promise<boolean> {
  return createNotification({
    type: 'low_inventory',
    title: '📦 Low Inventory Alert',
    message: `${itemName} is running low: ${quantity} remaining (threshold: ${threshold})`,
    metadata: {
      item_name: itemName,
      quantity,
      threshold,
    },
  });
}

/**
 * Create a new booking notification
 */
export async function notifyNewBooking(
  customerName: string,
  serviceName: string,
  scheduledDate: string
): Promise<boolean> {
  return createNotification({
    type: 'new_booking',
    title: '🎉 New Booking!',
    message: `${customerName} booked ${serviceName} for ${scheduledDate}`,
    metadata: {
      customer_name: customerName,
      service_name: serviceName,
      scheduled_date: scheduledDate,
    },
  });
}

/**
 * Create a payment received notification
 */
export async function notifyPaymentReceived(
  customerName: string,
  amount: string
): Promise<boolean> {
  return createNotification({
    type: 'payment_received',
    title: '💰 Payment Received',
    message: `${amount} received from ${customerName}`,
    metadata: {
      customer_name: customerName,
      amount,
    },
  });
}

/**
 * Create a booking update notification
 */
export async function notifyBookingUpdate(
  action: 'cancelled' | 'rescheduled' | 'completed',
  customerName: string,
  serviceName?: string
): Promise<boolean> {
  const actionEmoji = action === 'cancelled' ? '❌' : action === 'rescheduled' ? '📅' : '✅';
  const actionText = action === 'cancelled' ? 'cancelled' : action === 'rescheduled' ? 'rescheduled' : 'completed';
  
  return createNotification({
    type: 'booking_update',
    title: `${actionEmoji} Appointment ${actionText.charAt(0).toUpperCase() + actionText.slice(1)}`,
    message: `${customerName}'s ${serviceName || 'appointment'} has been ${actionText}`,
    metadata: {
      action,
      customer_name: customerName,
      service_name: serviceName,
    },
  });
}

// Re-export createNotification for direct use
export { createNotification };
