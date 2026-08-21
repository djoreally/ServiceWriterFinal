/**
 * Customer messaging preferences commands — thin wrappers over the
 * `record-booking-consent` edge function so UI components don't touch supabase.
 */
import { supabase } from "@/integrations/supabase/client";

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
  const { error } = await supabase.functions.invoke("record-booking-consent", {
    body,
    headers: signature ? { "x-hmac-signature": signature } : {},
  });
  if (error) throw new Error(error.message || "Could not update preferences.");
}
