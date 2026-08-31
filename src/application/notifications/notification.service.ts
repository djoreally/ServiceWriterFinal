/**
 * Notification Service
 * 
 * Ensures all notifications are sent to both provider and customer.
 * Single source of truth for notification logic.
 */

import { supabase } from "@/integrations/supabase/client";

export interface NotificationRecipients {
  customerEmail: string;
  customerName: string;
  providerEmail: string | null;
  providerName: string;
}

interface BookingNotificationData {
  recipients: NotificationRecipients;
  serviceName: string;
  scheduledDate: string;
  scheduledTime: string;
  estimatedDuration?: number;
  totalAmount?: string;
  vehicleInfo?: string;
}

interface PaymentNotificationData {
  recipients: NotificationRecipients;
  amount: string;
  serviceName?: string;
  documentNumber: string;
  paymentDate?: string;
}

interface ServiceCompletionData {
  recipients: NotificationRecipients;
  serviceName: string;
  vehicleInfo?: string;
  totalAmount?: string;
}

interface ReminderData {
  recipients: NotificationRecipients;
  serviceName: string;
  scheduledDate: string;
  scheduledTime: string;
  estimatedDuration?: number;
  reminderType: "24h" | "1h";
}

/**
 * Send booking confirmation to both customer and provider
 */
export async function notifyBookingConfirmation(data: BookingNotificationData): Promise<void> {
  const { recipients, serviceName, scheduledDate, scheduledTime, estimatedDuration, vehicleInfo, totalAmount } = data;

  // Send to customer
  await sendEmail({
    to: recipients.customerEmail,
    customerName: recipients.customerName,
    type: "booking_confirmation",
    businessName: recipients.providerName,
    businessEmail: recipients.providerEmail || undefined,
    serviceName,
    scheduledDate,
    scheduledTime,
    estimatedDuration,
    vehicleInfo,
    totalAmount,
  });

  // Send notification to provider if email is available
  if (recipients.providerEmail) {
    await sendEmail({
      to: recipients.providerEmail,
      customerName: recipients.customerName,
      customerEmail: recipients.customerEmail,
      type: "booking_confirmation_business",
      businessName: recipients.providerName,
      serviceName,
      scheduledDate,
      scheduledTime,
      estimatedDuration,
      vehicleInfo,
      totalAmount,
    });
  }
}

/**
 * Send payment received notification to both parties
 */
export async function notifyPaymentReceived(data: PaymentNotificationData): Promise<void> {
  const { recipients, amount, serviceName, documentNumber, paymentDate } = data;

  // Send receipt to customer
  await sendEmail({
    to: recipients.customerEmail,
    customerName: recipients.customerName,
    type: "payment_receipt",
    businessName: recipients.providerName,
    businessEmail: recipients.providerEmail || undefined,
    totalAmount: amount,
    serviceDescription: serviceName,
    documentNumber,
    paymentDate,
  });

  // Send notification to provider
  if (recipients.providerEmail) {
    await sendEmail({
      to: recipients.providerEmail,
      customerName: recipients.customerName,
      type: "payment_received",
      businessName: recipients.providerName,
      totalAmount: amount,
      serviceDescription: serviceName,
      documentNumber,
      customerEmail: recipients.customerEmail,
    });
  }
}

/**
 * Send service completion notification to customer
 */
export async function notifyServiceCompletion(data: ServiceCompletionData): Promise<void> {
  const { recipients, serviceName, vehicleInfo, totalAmount } = data;

  await sendEmail({
    to: recipients.customerEmail,
    customerName: recipients.customerName,
    type: "service_completion",
    businessName: recipients.providerName,
    businessEmail: recipients.providerEmail || undefined,
    serviceDescription: serviceName,
    vehicleInfo,
    totalAmount,
    documentNumber: "",
  });
}

/**
 * Send appointment reminder to customer
 */
export async function notifyAppointmentReminder(data: ReminderData): Promise<void> {
  const { recipients, serviceName, scheduledDate, scheduledTime, estimatedDuration, reminderType } = data;

  const emailType = reminderType === "24h" ? "appointment_reminder_24h" : "appointment_reminder_1h";

  await sendEmail({
    to: recipients.customerEmail,
    customerName: recipients.customerName,
    type: emailType,
    businessName: recipients.providerName,
    businessEmail: recipients.providerEmail || undefined,
    serviceName,
    scheduledDate,
    scheduledTime,
    estimatedDuration,
    documentNumber: "",
  });
}

/**
 * Internal helper to send email via edge function
 */
interface EmailPayload {
  to: string;
  customerName: string;
  type: string;
  businessName: string;
  businessEmail?: string;
  serviceName?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  estimatedDuration?: number;
  vehicleInfo?: string;
  totalAmount?: string;
  customerEmail?: string;
  serviceDescription?: string;
  documentNumber?: string;
  paymentDate?: string;
}

async function sendEmail(payload: EmailPayload): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke("send-email", {
      body: payload,
    });

    if (error) {
      console.warn(`[NotificationService] Edge function invoke omitted or failed: ${error.message}`);
    }
  } catch (err: unknown) {
    const error = err as Error;
    console.warn(`[NotificationService] Exception during email dispatch fallback: ${error.message}`);
  }
}
