/**
 * @package @packages/shared
 * Canonical lifecycle models (single source of truth)
 */

export const JOB_LIFECYCLE = ['scheduled', 'in_progress', 'completed', 'cancelled'] as const;
export type JobLifecycleStatus = (typeof JOB_LIFECYCLE)[number];

export const DISPATCH_LIFECYCLE = [
  'unassigned',
  'assigned',
  'acknowledged',
  'auto_assigned',
  'en_route',
  'arrived',
  'in_progress',
  'completed',
  'cancelled',
] as const;
export type DispatchLifecycleStatus = (typeof DISPATCH_LIFECYCLE)[number];

export const APPOINTMENT_LIFECYCLE = [
  'scheduled',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
] as const;
export type AppointmentLifecycleStatus = (typeof APPOINTMENT_LIFECYCLE)[number];

export const PAYMENT_PROCESSING_LIFECYCLE = [
  'pending',
  'processing',
  'succeeded',
  'failed',
  'refunded',
  'partially_refunded',
] as const;
export type PaymentProcessingStatus = (typeof PAYMENT_PROCESSING_LIFECYCLE)[number];

export const INVOICE_PAYMENT_LIFECYCLE = ['unpaid', 'partially_paid', 'paid'] as const;
export type InvoicePaymentStatus = (typeof INVOICE_PAYMENT_LIFECYCLE)[number];

export const JOB_COMMUNICATION_ROLES = ['dispatch', 'technician', 'management'] as const;
export type JobCommunicationRole = (typeof JOB_COMMUNICATION_ROLES)[number];
