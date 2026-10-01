import { apiClient } from "@/lib/api-client";

export interface MessagingHealthStats {
  smsEnabledTenants: number;
  marketingEmailTenants: number;
  outbound: number;
  failed: number;
  replies: number;
  optOuts: number;
  exhaustedBundles: number;
  a2pBlocked: number;
}

export async function fetchAdminMessagingHealth(): Promise<MessagingHealthStats> {
  const { data } = await apiClient.get<{ data: MessagingHealthStats }>("/v1/admin/messaging-health");
  return data;
}
