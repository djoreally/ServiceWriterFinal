/**
 * Customer messaging preferences commands — thin wrappers over the
 * messaging-consent API endpoint so UI components don't touch supabase.
 */
import { apiClient } from "@/lib/api-client";

export interface RecordBookingConsentParams {
  userId: string;
  email: string | null;
  phone: string | null;
  transactionalSmsConsent: boolean;
  marketingSmsConsent: boolean;
  marketingEmailConsent: boolean;
  consentTexts: {
    transactionalSms: string;
    marketingSms: string;
    marketingEmail: string;
  };
  source: string;
  signature?: string;
}

export async function recordBookingConsent(params: RecordBookingConsentParams): Promise<void> {
  const { signature, ...body } = params;
  try {
    await apiClient.post("/v1/crm/messaging-consent", { ...body, signature });
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Could not update preferences.");
  }
}
