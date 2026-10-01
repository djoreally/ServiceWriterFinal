/**
 * SMS Credits Commands — checkout for prepaid credit packs, low-balance
 * threshold, and test sends through the single `send-sms` outbound door.
 */
import { apiClient } from "@/lib/api-client";

export async function startSmsCreditCheckout(bundleKey: string): Promise<{ url?: string }> {
  const { data } = await apiClient.post<{ data: { url?: string } | null; error: null }>(
    "/v1/sms-credits/checkout",
    { bundleKey },
  );
  return (data ?? {}) as { url?: string };
}

export async function updateSmsLowBalanceThreshold(threshold: number): Promise<void> {
  await apiClient.put("/v1/sms-credits/threshold", { threshold });
}

/**
 * Turn texting on or off for the workspace. These flags are what the backend
 * `consume_sms_credits_v1` gate checks — a disabled channel refuses with
 * `channel_disabled` before any credits are reserved.
 */
export async function updateSmsChannelToggles(patch: {
  transactional?: boolean;
  marketing?: boolean;
}): Promise<void> {
  const update: { transactional?: boolean; marketing?: boolean } = {};
  if (typeof patch.transactional === "boolean") update.transactional = patch.transactional;
  if (typeof patch.marketing === "boolean") update.marketing = patch.marketing;
  if (Object.keys(update).length === 0) return;
  await apiClient.put("/v1/sms-credits/channel-toggles", update);
}



export interface SendSmsResponse {
  sent: boolean;
  reason?: string;
  segments?: number;
  available?: number;
  details?: string;
}

export async function sendTestSms(to: string, message: string): Promise<SendSmsResponse> {
  const { data } = await apiClient.post<{ data: SendSmsResponse | null; error: null }>("/v1/sms/send", {
    to,
    message,
    messageClass: "transactional",
    messageType: "test",
  });
  return (data ?? { sent: false }) as SendSmsResponse;
}
