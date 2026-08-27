/**
 * Legacy-compatible notification helpers.
 *
 * New domain producers should pass `workspaceId` and an event-derived
 * `dedupeKey`/`sourceEventId`. Without those fields, the command intentionally
 * treats the call as a distinct manual notification.
 */
import {
  createNotification,
  type CreateNotificationParams,
  type NotificationType,
} from "@/application/commands/notifications.command";

export type { NotificationType };

type ProducerOptions = Pick<CreateNotificationParams, "workspaceId" | "dedupeKey" | "sourceEventId">;

export async function notifyLowInventory(
  itemName: string,
  quantity: number,
  threshold: number,
  options: ProducerOptions = {},
): Promise<boolean> {
  return createNotification({
    type: "low_inventory",
    title: "Low inventory alert",
    message: `${itemName} is running low: ${quantity} remaining (threshold: ${threshold})`,
    metadata: { item_name: itemName, quantity, threshold },
    ...options,
  });
}

export async function notifyNewBooking(
  customerName: string,
  serviceName: string,
  scheduledDate: string,
  options: ProducerOptions = {},
): Promise<boolean> {
  return createNotification({
    type: "new_booking",
    title: "New booking",
    message: `${customerName} booked ${serviceName} for ${scheduledDate}`,
    metadata: { customer_name: customerName, service_name: serviceName, scheduled_date: scheduledDate },
    ...options,
  });
}

export async function notifyPaymentReceived(
  customerName: string,
  amount: string,
  options: ProducerOptions = {},
): Promise<boolean> {
  return createNotification({
    type: "payment_received",
    title: "Payment received",
    message: `${amount} received from ${customerName}`,
    metadata: { customer_name: customerName, amount },
    ...options,
  });
}

export async function notifyBookingUpdate(
  action: "cancelled" | "rescheduled" | "completed",
  customerName: string,
  serviceName?: string,
  options: ProducerOptions = {},
): Promise<boolean> {
  const actionText = action === "cancelled" ? "cancelled" : action === "rescheduled" ? "rescheduled" : "completed";
  return createNotification({
    type: "booking_update",
    title: `Appointment ${actionText}`,
    message: `${customerName}'s ${serviceName || "appointment"} has been ${actionText}`,
    metadata: { action, customer_name: customerName, service_name: serviceName ?? null },
    ...options,
  });
}

export { createNotification };
