import {
  getLifecycleTemplate,
  LIFECYCLE_TEMPLATES,
  type LifecycleTemplateKey,
  type LifecycleVariables,
} from "@/server/messaging/lifecycle-templates";
import { enqueueLifecycleEmail } from "@/server/messaging/lifecycle-sender";

export type LifecycleRecipientRole =
  | "customer"
  | "technician"
  | "staff"
  | "shop_owner"
  | "platform_admin"
  | "support"
  | "accounting"
  | "engineering";

export type LifecycleEvent = {
  templateKey: LifecycleTemplateKey | string;
  eventId: string;
  entityType?: "appointment" | "quote" | "invoice" | "payment" | "work_order" | "service_record" | "invitation" | "subscription" | "platform";
  entityId?: string;
  workspaceId: string;
  recipientEmail: string;
  recipientRole: LifecycleRecipientRole;
  customerId?: string | null;
  variables: LifecycleVariables;
  metadata?: Record<string, string>;
};

export type LifecycleEventResult = {
  templateKey: string;
  eventId: string;
  recipientRole: LifecycleRecipientRole;
  providerMessageId?: string;
  status: string;
};

/**
 * The one server-side seam every lifecycle mutation should use. Domain code
 * owns the state transition; this function owns template lookup, idempotency,
 * logging, provider delivery, and the permanent event-to-message link.
 */
export async function dispatchLifecycleEvent(event: LifecycleEvent): Promise<LifecycleEventResult> {
  const template = getLifecycleTemplate(event.templateKey);
  const variables = {
    ...event.variables,
    "email.recipient_role": event.recipientRole,
  };
  const metadata = {
    lifecycleEventId: event.eventId,
    recipientRole: event.recipientRole,
    ...(event.metadata ?? {}),
  };
  const result = await enqueueLifecycleEmail({
    workspaceId: event.workspaceId,
    customerId: event.customerId,
    recipientEmail: event.recipientEmail,
    templateKey: template.key,
    eventId: event.eventId,
    entityType: event.entityType ?? "platform",
    entityId: event.entityId ?? event.eventId,
    recipientRole: event.recipientRole,
    idempotencyKey: `lifecycle:${template.key}:${event.eventId}:${event.recipientEmail.toLowerCase()}`,
    variables,
    metadata,
  });
  return {
    templateKey: template.key,
    eventId: event.eventId,
    recipientRole: event.recipientRole,
    providerMessageId: undefined,
    status: result.status,
  };
}

/**
 * Use when one state transition fans out to customer, technician, shop, or
 * support recipients. Each recipient gets its own idempotent message record.
 */
export async function dispatchLifecycleEvents(events: readonly LifecycleEvent[]): Promise<LifecycleEventResult[]> {
  return Promise.all(events.map(dispatchLifecycleEvent));
}

export function lifecycleEvent<T extends LifecycleTemplateKey>(
  templateKey: T,
  input: Omit<LifecycleEvent, "templateKey">,
): LifecycleEvent {
  return { ...input, templateKey };
}

/** Stable keys for the most common state-transition wiring points. */
/** Every approved lifecycle key is dispatchable, including less-common operational events. */
export const LIFECYCLE_EVENT_CATALOG = Object.freeze(
  Object.keys(LIFECYCLE_TEMPLATES).map((key) => getLifecycleTemplate(key)).map((template) => ({
    key: template.key,
    category: template.category,
    title: template.title,
    purpose: template.purpose,
  })),
);

export const LIFECYCLE_EVENT_KEYS = {
  bookingCreated: "appointment_booking_sequence.booking_confirmation",
  newAppointmentBooked: "appointment_booking_sequence.new_appointment_booked",
  bookingPendingApproval: "appointment_booking_sequence.booking_received_pending_approval",
  appointmentApproved: "appointment_booking_sequence.appointment_approved",
  appointmentDeclined: "appointment_booking_sequence.appointment_declined",
  appointmentRescheduled: "appointment_booking_sequence.appointment_rescheduled",
  appointmentCancelled: "appointment_booking_sequence.appointment_cancelled",
  technicianAssigned: "appointment_booking_sequence.technician_assigned",
  jobAssigned: "appointment_booking_sequence.new_job_assigned",
  assignmentChanged: "appointment_booking_sequence.assignment_changed",
  bookingDetailsChanged: "appointment_booking_sequence.booking_details_changed",
  serviceAuthorizationRequested: "appointment_booking_sequence.add_service_authorization",
  serviceAuthorizationResponded: "appointment_booking_sequence.service_authorization_response",
  appointmentRestored: "appointment_booking_sequence.appointment_restored",
  technicianEnRoute: "technician_and_live_service_sequence.technician_en_route",
  technicianArrivingSoon: "technician_and_live_service_sequence.technician_arriving_soon",
  technicianArrived: "technician_and_live_service_sequence.technician_arrived",
  serviceStarted: "technician_and_live_service_sequence.service_started",
  inspectionCompleted: "technician_and_live_service_sequence.inspection_completed",
  additionalWorkRecommended: "technician_and_live_service_sequence.additional_work_recommended",
  authorizationReceived: "technician_and_live_service_sequence.authorization_received",
  jobDelayed: "technician_and_live_service_sequence.job_delayed",
  jobPaused: "technician_and_live_service_sequence.job_paused",
  serviceCompleted: "technician_and_live_service_sequence.service_completed",
  quoteReady: "quotes_and_service_authorization.your_quote_is_ready",
  quoteApproved: "quotes_and_service_authorization.quote_approved",
  quoteDeclined: "quotes_and_service_authorization.quote_declined",
  quoteApprovedStaff: "quotes_and_service_authorization.quote_approved_staff",
  quoteDeclinedStaff: "quotes_and_service_authorization.quote_declined_staff",
  estimateConverted: "quotes_and_service_authorization.estimate_converted_to_appointment",
  invoiceCreated: "invoice_and_payment_sequence.invoice_created",
  paymentRequested: "invoice_and_payment_sequence.payment_requested",
  paymentReceipt: "invoice_and_payment_sequence.payment_receipt",
  paymentReceived: "invoice_and_payment_sequence.payment_received",
  paymentFailed: "invoice_and_payment_sequence.payment_failed",
  refundIssued: "invoice_and_payment_sequence.refund_issued",
  disputeOpened: "invoice_and_payment_sequence.dispute_opened",
  payoutSent: "invoice_and_payment_sequence.payout_sent",
  serviceCompletionSummary: "service_completion_and_follow_up.service_completion_summary",
  reviewRequest: "service_completion_and_follow_up.review_and_satisfaction_request",
  supportFollowUp: "service_completion_and_follow_up.report_a_problem_or_request_support",
  staffInvited: "staff_onboarding_and_account_management.you_ve_been_invited",
  roleChanged: "staff_onboarding_and_account_management.role_changed",
  accessSuspended: "staff_onboarding_and_account_management.access_suspended",
  newAdminAdded: "staff_onboarding_and_account_management.new_admin_added",
  newSubscriber: "platform_owner_and_support_notifications.new_subscriber_registered",
  providerOnboardingCompleted: "platform_owner_and_support_notifications.provider_completed_onboarding",
  subscriptionStarted: "platform_owner_and_support_notifications.subscription_started",
  subscriptionChanged: "platform_owner_and_support_notifications.subscription_upgraded_downgraded",
  subscriptionCancelled: "platform_owner_and_support_notifications.subscription_cancelled",
  emailDeliveryFailure: "platform_owner_and_support_notifications.email_delivery_failure",
  smsDeliveryFailure: "platform_owner_and_support_notifications.sms_delivery_failure",
} as const satisfies Record<string, LifecycleTemplateKey>;
