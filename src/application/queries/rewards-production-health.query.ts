import { apiClient } from "@/lib/api-client";

export async function fetchRewardsProductionHealth(providerId: string): Promise<Record<string, unknown>> {
  const { data } = await apiClient.get<{ data: Record<string, unknown> }>("/v1/crm/loyalty/production-health", {
    query: { provider_id: providerId },
  });
  return (data || {}) as Record<string, unknown>;
}

export async function validateRewardsLaunchSignoff(providerId: string): Promise<Record<string, unknown>> {
  const { data } = await apiClient.get<{ data: Record<string, unknown> }>("/v1/crm/loyalty/launch-signoff", {
    query: { provider_id: providerId },
  });
  return (data || {}) as Record<string, unknown>;
}
