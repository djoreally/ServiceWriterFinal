/**
 * SMS command — outbound text messaging through the `send-sms` edge function.
 *
 * `send-sms` is the single outbound door: it enforces consent/opt-out, counts
 * segments, spends prepaid SMS credits, and routes to the configured provider.
 * Callers here
 * never touch the provider directly.
 */
import { apiClient } from "@/lib/api-client";

export interface SendSmsParams {
  to: string;
  text: string;
  appointmentId: string;
  messageClass?: "transactional" | "marketing";
  messageType?: string;
  customerId?: string | null;
}

export interface SendSmsResult {
  success: boolean;
  correlationId?: string;
  segments?: number;
  reason?: string;
  error?: string;
}

export async function sendSmsMessage(params: SendSmsParams): Promise<SendSmsResult> {
  try {
    const { data } = await apiClient.post<{ data: unknown; error: null }>("/v1/sms/send", {
      to: params.to,
      message: params.text,
      appointmentId: params.appointmentId || null,
      customerId: params.customerId ?? null,
      messageClass: params.messageClass ?? "transactional",
      messageType: params.messageType ?? "manual",
    });

    const result = (data ?? {}) as {
      sent?: boolean;
      reason?: string;
      segments?: number;
      providerMessageId?: string | null;
      details?: string;
    };

    if (!result.sent) {
      return { success: false, reason: result.reason, error: result.details ?? result.reason };
    }

    return {
      success: true,
      correlationId: result.providerMessageId ?? undefined,
      segments: result.segments,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not send text message." };
  }
}

/**
 * Lifecycle notifications (reschedule, cancellation, confirmation) are rendered
 * and sent server-side so templates and credit accounting stay in one place.
 */
export async function sendBookingLifecycleSms(params: {
  appointmentId: string;
  type: "reschedule" | "cancellation" | "confirmation";
  signature?: string;
}): Promise<void> {
  try {
    await apiClient.post(
      "/v1/sms/booking-lifecycle",
      { appointmentId: params.appointmentId, type: params.type },
      params.signature ? { headers: { "x-hmac-signature": params.signature } } : {},
    );
  } catch (error) {
    // Lifecycle texts are best-effort — never block the booking mutation.
    console.warn("Lifecycle SMS could not be sent:", error instanceof Error ? error.message : error);
  }
}
