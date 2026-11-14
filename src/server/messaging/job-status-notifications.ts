import { createSupabaseAdminClient } from "@/lib/supabase";
import { logMutation } from "@/server/audit";
import {
  appointmentCustomerEmail,
  dispatchAppointmentLifecycle,
  type AppointmentLifecycleRecord,
} from "@/server/messaging/appointment-events";
import { LIFECYCLE_EVENT_KEYS } from "@/server/messaging/lifecycle-events";
import { TwilioSmsAdapter } from "@/server/messaging/twilio";

/**
 * Job-step notifications — the fan-out behind the tech app's
 * workflow stepper (Ty's direction, 2026-11-13): the Job Details
 * steps are BUTTONS, and advancing one tells the OFFICE and the
 * CUSTOMER. This module is the one place that fan-out lives; two
 * callers fire it, and deterministic lifecycle event ids make the
 * pair idempotent —
 *
 *   1. POST /v1/tech-app/jobs/:appointmentId/step-notification,
 *      called by the tech app the moment a step advances (the
 *      online fast path), and
 *   2. the tech-app sync push, when a transition it carried
 *      actually lands server-side (the offline path — a step
 *      advanced with no signal still notifies when it syncs).
 *
 * Channels (Ty's ruling): EMAIL today, through the existing
 * lifecycle mailer (Resend; the same templates and sender the
 * office dispatch surface uses — no new provider). TEXT is dark:
 * SMS waits on 10DLC registration, so the text channel exists as
 * a gated seam that sends nothing until the registration is
 * configured (see jobStatusSmsGate). Nothing here ever fakes a
 * send: every outcome is reported per recipient and recorded on
 * the job's audit trail (audit_events via logMutation, on top of
 * the message_logs rows the lifecycle sender itself writes).
 *
 * Notification matrix:
 *   step       customer email            office email
 *   en_route   technician_en_route       technician_en_route
 *   arrived    technician_arrived        technician_arrived
 *   started    —                         service_started
 *   completed  service_completed         service_completed
 * (customer SMS mirrors the customer email rows once 10DLC lands.)
 *
 * Idempotency: per (job, step, recipient). The customer en_route /
 * arrived event ids deliberately match the ones the office
 * dispatch routes already use (`<id>:technician-status:<step>`),
 * so a step advanced from either surface enqueues exactly one
 * customer email; the lifecycle outbox + message log enforce it.
 */

export type JobStep = "en_route" | "arrived" | "started" | "completed";

export type JobStepNotificationStatus =
  | "queued"
  | "skipped_no_customer_email"
  | "skipped_no_customer_phone"
  | "skipped_no_office_recipient"
  | "disabled"
  | "failed";

export type JobStepNotification = {
  channel: "email" | "sms";
  role: "customer" | "shop_owner";
  recipient: string | null;
  status: JobStepNotificationStatus;
  templateKey: string | null;
  /** ISO timestamp the outcome was recorded. */
  at: string;
};

export type JobStepNotificationReport = {
  appointmentId: string;
  step: JobStep;
  notifications: JobStepNotification[];
};

const CUSTOMER_EVENT_KEYS: Partial<Record<JobStep, string>> = {
  en_route: LIFECYCLE_EVENT_KEYS.technicianEnRoute,
  arrived: LIFECYCLE_EVENT_KEYS.technicianArrived,
  completed: LIFECYCLE_EVENT_KEYS.serviceCompleted,
};

const OFFICE_EVENT_KEYS: Record<JobStep, string> = {
  en_route: LIFECYCLE_EVENT_KEYS.technicianEnRoute,
  arrived: LIFECYCLE_EVENT_KEYS.technicianArrived,
  started: LIFECYCLE_EVENT_KEYS.serviceStarted,
  completed: LIFECYCLE_EVENT_KEYS.serviceCompleted,
};

function customerEventId(appointmentId: string, step: JobStep): string {
  // en_route / arrived share the office dispatch routes' event id
  // so the two surfaces dedupe against each other.
  return step === "en_route" || step === "arrived"
    ? `${appointmentId}:technician-status:${step}`
    : `${appointmentId}:job-step:${step}`;
}

function officeEventId(appointmentId: string, step: JobStep): string {
  return `${appointmentId}:job-step:${step}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** The workspace's configured shop-notification addresses. */
function configuredOfficeRecipients(value: unknown): string[] {
  const settings = asRecord(value);
  const configured = settings?.booking_notification_emails;
  if (!Array.isArray(configured)) return [];
  return configured
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry));
}

/**
 * The office's inboxes for job-step news: the workspace's
 * configured booking-notification addresses plus the workspace
 * owner — the same recipient resolution the shop booking
 * notification uses, so a step advance reaches the same office a
 * new booking does.
 */
export async function resolveOfficeNotificationRecipients(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  workspaceId: string,
): Promise<string[]> {
  const [workspace, settings] = await Promise.all([
    admin.from("workspaces").select("created_by").eq("id", workspaceId).single(),
    admin
      .from("workspace_settings")
      .select("operational_settings")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
  ]);
  const recipients = new Set(
    configuredOfficeRecipients(settings.data?.operational_settings),
  );
  const ownerId = (workspace.data as { created_by?: string | null } | null)
    ?.created_by;
  if (ownerId) {
    const owner = await admin.auth.admin.getUserById(ownerId).catch(() => null);
    const ownerEmail = owner?.data?.user?.email?.trim().toLowerCase();
    if (ownerEmail) recipients.add(ownerEmail);
  }
  return [...recipients];
}

// ---------------------------------------------------------------------------
// SMS seam — dark until 10DLC
// ---------------------------------------------------------------------------

/**
 * Text stays dark until 10DLC registration exists. The gate is
 * configuration only: the registration switch (SMS_10DLC_ENABLED)
 * plus the Twilio account credentials plus a 10DLC-registered
 * sender (a messaging service, or the registered from-number).
 * Until every piece is present this returns disabled and the SMS
 * attempt below sends NOTHING — no provider call, no fake log of
 * a send. Flipping the configuration is the only step between
 * here and live texts.
 */
export function jobStatusSmsGate(
  env: Record<string, string | undefined> = process.env,
): { enabled: boolean; reason: string } {
  if (env.SMS_10DLC_ENABLED !== "true") {
    return {
      enabled: false,
      reason: "SMS is waiting on 10DLC registration (SMS_10DLC_ENABLED is not on)",
    };
  }
  const missing = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"].filter(
    (key) => !env[key]?.trim(),
  );
  if (!env.TWILIO_MESSAGING_SERVICE_SID?.trim() && !env.TWILIO_FROM_NUMBER?.trim()) {
    missing.push("TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER");
  }
  if (missing.length) {
    return {
      enabled: false,
      reason: `SMS provider configuration incomplete: ${missing.join(", ")}`,
    };
  }
  return { enabled: true, reason: "10DLC messaging configured" };
}

const SMS_STEP_LINES: Record<JobStep, string | null> = {
  en_route: "is on the way to you now",
  arrived: "has arrived",
  started: null,
  completed: "has completed your service",
};

function customerPhone(appointment: AppointmentLifecycleRecord): string | null {
  const customer = Array.isArray(appointment.customers)
    ? appointment.customers[0]
    : appointment.customers;
  const phone = (customer as { phone?: string | null } | null | undefined)?.phone;
  if (typeof phone === "string" && phone.trim()) return phone.trim();
  const guestPhone = appointment.metadata?.guest_phone;
  return typeof guestPhone === "string" && guestPhone.trim()
    ? guestPhone.trim()
    : null;
}

/**
 * One customer text for a job step. With the 10DLC gate closed
 * (the shipped default) this records `disabled` and never touches
 * the provider; the send below it is reachable only when the
 * registration configuration is complete.
 */
export async function sendJobStepSms(input: {
  workspaceId: string;
  appointmentId: string;
  step: JobStep;
  appointment: AppointmentLifecycleRecord;
  businessName: string;
  technicianName: string;
}): Promise<JobStepNotification> {
  const at = new Date().toISOString();
  const base = {
    channel: "sms" as const,
    role: "customer" as const,
    templateKey: null,
    at,
  };
  const gate = jobStatusSmsGate();
  const phone = customerPhone(input.appointment);
  if (!gate.enabled) {
    return { ...base, recipient: phone, status: "disabled" };
  }
  if (!phone) {
    return { ...base, recipient: null, status: "skipped_no_customer_phone" };
  }
  const line = SMS_STEP_LINES[input.step];
  if (!line) return { ...base, recipient: phone, status: "disabled" };
  try {
    await new TwilioSmsAdapter().send({
      workspaceId: input.workspaceId,
      recipient: { phone },
      purpose: "appointment_update",
      templateKey: `job_step.${input.step}`,
      body: `${input.businessName}: ${input.technicianName} ${line}.`,
      idempotencyKey: `job-step-sms:${input.appointmentId}:${input.step}:${phone}`,
      metadata: { appointmentId: input.appointmentId, step: input.step },
    });
    return {
      ...base,
      recipient: phone,
      // The provider accepted the text (queued/accepted/sent) —
      // delivery itself is reported back through the Twilio
      // webhook, not this call.
      status: "queued",
    };
  } catch (error) {
    console.error("[Lifecycle] job-step SMS send failed", error);
    return { ...base, recipient: phone, status: "failed" };
  }
}

// ---------------------------------------------------------------------------
// The fan-out
// ---------------------------------------------------------------------------

export async function notifyJobStepAdvanced(input: {
  workspaceId: string;
  appointmentId: string;
  step: JobStep;
  actorUserId?: string | null;
  request?: Request;
  /** Origin the action links are built on (the request's origin). */
  origin: string;
}): Promise<JobStepNotificationReport> {
  const admin = createSupabaseAdminClient();
  const db = admin as any;
  const at = new Date().toISOString();
  const notifications: JobStepNotification[] = [];

  const [{ data: appointment }, { data: workspace }] = await Promise.all([
    db
      .from("appointments")
      .select(
        "id,workspace_id,customer_id,starts_at,ends_at,status,notes,metadata,assigned_user_id,customers(id,first_name,last_name,email,phone),vehicles(id,year,make,model)",
      )
      .eq("workspace_id", input.workspaceId)
      .eq("id", input.appointmentId)
      .maybeSingle(),
    db.from("workspaces").select("name,timezone").eq("id", input.workspaceId).maybeSingle(),
  ]);
  if (!appointment) {
    throw new Error(
      `job-step notification: appointment ${input.appointmentId} not found in workspace ${input.workspaceId}`,
    );
  }
  const record = appointment as AppointmentLifecycleRecord & {
    assigned_user_id?: string | null;
  };
  const workspaceName = (workspace as { name?: string } | null)?.name ?? "Service Writer";
  const workspaceTimezone =
    (workspace as { timezone?: string } | null)?.timezone ?? "UTC";

  const technicianId = record.assigned_user_id ?? input.actorUserId ?? null;
  const technician = technicianId
    ? await admin.auth.admin.getUserById(technicianId).catch(() => null)
    : null;
  const technicianName = String(
    technician?.data?.user?.user_metadata?.full_name ||
      technician?.data?.user?.user_metadata?.name ||
      technician?.data?.user?.email?.split("@")[0] ||
      "Your technician",
  );

  // Customer email — the steps Ty named (en route, arrived,
  // completed). dispatchAppointmentLifecycle resolves the
  // customer's address itself and answers null when there is
  // none on file: that is a skip, never a crash, and the office
  // still hears about the step below.
  const customerKey = CUSTOMER_EVENT_KEYS[input.step];
  if (customerKey) {
    try {
      const result = await dispatchAppointmentLifecycle({
        eventKey: customerKey,
        eventId: customerEventId(input.appointmentId, input.step),
        appointment: record,
        workspaceName,
        workspaceTimezone,
        actionUrl: new URL("/my-bookings", input.origin).toString(),
        technicianName,
      });
      notifications.push({
        channel: "email",
        role: "customer",
        recipient: result ? appointmentCustomerEmail(record) : null,
        status: result ? "queued" : "skipped_no_customer_email",
        templateKey: customerKey,
        at,
      });
    } catch (error) {
      console.error("[Lifecycle] job-step customer email enqueue failed", error);
      notifications.push({
        channel: "email",
        role: "customer",
        recipient: appointmentCustomerEmail(record),
        status: "failed",
        templateKey: customerKey,
        at,
      });
    }

    // Customer text — the 10DLC seam; disabled by configuration
    // today, recorded honestly either way.
    notifications.push(
      await sendJobStepSms({
        workspaceId: input.workspaceId,
        appointmentId: input.appointmentId,
        step: input.step,
        appointment: record,
        businessName: workspaceName,
        technicianName,
      }),
    );
  }

  // Office email — EVERY advance, to the workspace's office
  // inboxes, with the staff appointment page as the action.
  const officeKey = OFFICE_EVENT_KEYS[input.step];
  const officeRecipients = await resolveOfficeNotificationRecipients(
    admin,
    input.workspaceId,
  ).catch((error) => {
    console.error("[Lifecycle] job-step office recipient resolution failed", error);
    return [] as string[];
  });
  if (officeRecipients.length === 0) {
    notifications.push({
      channel: "email",
      role: "shop_owner",
      recipient: null,
      status: "skipped_no_office_recipient",
      templateKey: officeKey,
      at,
    });
  }
  for (const recipientEmail of officeRecipients) {
    try {
      await dispatchAppointmentLifecycle({
        eventKey: officeKey,
        eventId: officeEventId(input.appointmentId, input.step),
        appointment: record,
        workspaceName,
        workspaceTimezone,
        actionUrl: new URL(
          `/appointments/${input.appointmentId}`,
          input.origin,
        ).toString(),
        recipientEmail,
        recipientRole: "shop_owner",
        technicianName,
      });
      notifications.push({
        channel: "email",
        role: "shop_owner",
        recipient: recipientEmail,
        status: "queued",
        templateKey: officeKey,
        at,
      });
    } catch (error) {
      console.error("[Lifecycle] job-step office email enqueue failed", error);
      notifications.push({
        channel: "email",
        role: "shop_owner",
        recipient: recipientEmail,
        status: "failed",
        templateKey: officeKey,
        at,
      });
    }
  }

  // The job's audit trail: one entry per advance carrying every
  // send's (step, channel, recipient, timestamp) — the same trail
  // the mutation log writes for the job's other events. (The
  // lifecycle sender's message_logs rows are the per-send record
  // underneath this summary.)
  logMutation({
    supabase: admin,
    request: input.request,
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId ?? null,
    action: "appointment.job_step_notified",
    entityType: "appointment",
    entityId: input.appointmentId,
    after: { step: input.step, notifications },
  });

  return { appointmentId: input.appointmentId, step: input.step, notifications };
}
