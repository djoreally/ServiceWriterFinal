import { createSupabaseAdminClient } from "@/lib/supabase";
import { ResendEmailAdapter } from "@/server/messaging/resend";

type AppointmentRow = {
  id: string;
  workspace_id: string;
  customer_id: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  notes: string | null;
  metadata: Record<string, unknown> | null;
};

export async function sendBookingConfirmation(input: {
  appointment: AppointmentRow;
  workspaceName: string;
  workspaceTimezone: string;
  recipientEmail: string;
}) {
  const supabase = createSupabaseAdminClient();
  const metadata = input.appointment.metadata ?? {};
  const idempotencyKey = `booking-confirmation:${input.appointment.id}`;
  const existing = await supabase
    .from("message_logs")
    .select("provider_message_id,status")
    .eq("workspace_id", input.appointment.workspace_id)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existing.data?.provider_message_id && ["accepted", "sent", "delivered"].includes(existing.data.status)) {
    return { providerMessageId: existing.data.provider_message_id, status: existing.data.status };
  }

  const startsAt = new Date(input.appointment.starts_at);
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: input.workspaceTimezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(startsAt);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: input.workspaceTimezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(startsAt);
  const title = String(metadata.title || "Service appointment");
  const guestName = String(metadata.guest_name || "Customer");
  const description = String(metadata.description || "");
  const total = Number(metadata.estimated_cost || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
  const body = [
    `Hi ${guestName},`,
    "",
    `Your appointment with ${input.workspaceName} is confirmed.`,
    "",
    `Service: ${title}`,
    `Date: ${date}`,
    `Time: ${time}`,
    `Total: ${total}`,
    "Payment: Pay at time of service",
    description ? "" : null,
    description || null,
    "",
    `Confirmation: ${input.appointment.id.slice(0, 8).toUpperCase()}`,
    "",
    "If you need to make a change, reply to this email or contact the service provider.",
  ].filter((line): line is string => line !== null).join("\n");

  const queued = await supabase.from("message_logs").upsert({
    workspace_id: input.appointment.workspace_id,
    customer_id: input.appointment.customer_id,
    channel: "email",
    purpose: "transactional",
    provider: "resend",
    idempotency_key: idempotencyKey,
    recipient_email: input.recipientEmail,
    template_key: "booking_confirmation",
    subject: `Booking confirmed — ${input.workspaceName}`,
    body_redacted: "Booking confirmation",
    status: "queued",
    metadata: { appointment_id: input.appointment.id },
  }, { onConflict: "workspace_id,idempotency_key" }).select("id").single();
  if (queued.error) throw queued.error;

  try {
    const sent = await new ResendEmailAdapter().send({
      workspaceId: input.appointment.workspace_id,
      recipient: { email: input.recipientEmail },
      purpose: "transactional",
      templateKey: "booking_confirmation",
      subject: `Booking confirmed — ${input.workspaceName}`,
      body,
      idempotencyKey,
      metadata: { appointmentId: input.appointment.id },
    });
    const updated = await supabase.from("message_logs").update({
      provider_message_id: sent.providerMessageId,
      status: sent.status,
      sent_at: sent.acceptedAt,
      failure_code: null,
      failure_reason: null,
    }).eq("id", queued.data.id);
    if (updated.error) throw updated.error;
    return sent;
  } catch (error) {
    await supabase.from("message_logs").update({
      status: "failed",
      failed_at: new Date().toISOString(),
      failure_reason: error instanceof Error ? error.message.slice(0, 500) : "Email provider failed",
    }).eq("id", queued.data.id);
    throw error;
  }
}
