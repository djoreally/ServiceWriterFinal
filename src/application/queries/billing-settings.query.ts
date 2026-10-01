/**
 * Billing Settings Query — messaging usage counters shown on the
 * BillingSettings card. Served via the Hono billing API.
 */
import { apiClient, ApiClientError } from "@/lib/api-client";

export interface MessagingStats {
  outbound: number;
  failed: number;
  replies: number;
  optOuts: number;
}

const EMPTY_STATS: MessagingStats = { outbound: 0, failed: 0, replies: 0, optOuts: 0 };

export async function fetchMessagingStats(): Promise<MessagingStats> {
  try {
    const { data } = await apiClient.get<{ data: MessagingStats }>("/v1/billing/messaging-stats");
    return { ...EMPTY_STATS, ...data };
  } catch (error) {
    // Unauthenticated callers see empty counters, matching the legacy behavior.
    if (error instanceof ApiClientError && error.status === 401) return EMPTY_STATS;
    throw error instanceof ApiClientError ? new Error(error.message) : error;
  }
}
