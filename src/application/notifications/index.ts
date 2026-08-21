/**
 * Application Notifications Layer
 * 
 * Centralized notification service that ensures both provider and customer
 * receive appropriate notifications for all events.
 */

export { 
  notifyBookingConfirmation,
  notifyPaymentReceived,
  notifyServiceCompletion,
  notifyAppointmentReminder,
  type NotificationRecipients
} from './notification.service';
