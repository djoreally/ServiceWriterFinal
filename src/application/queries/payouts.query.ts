/**
 * Payouts Query — Stripe payouts via the Hono billing API.
 */
import { apiClient, ApiClientError } from "@/lib/api-client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";

async function signedIn(): Promise<boolean> {
  const { data: { user } } = await getCurrentAuthUser();
  return Boolean(user);
}

export interface PayoutBalanceAmount {
  amount: number;
  currency: string;
}

export interface PayoutBalance {
  available: PayoutBalanceAmount[];
  pending: PayoutBalanceAmount[];
}

export interface StripePayoutRow {
  id: string;
  amount: number;
  currency: string;
  status: string;
  arrivalDate: number;
  created: number;
  description: string | null;
  method: string;
  type: string;
  failureCode: string | null;
  failureMessage: string | null;
}

export interface PayoutsDataShape {
  payouts: StripePayoutRow[];
  balance: PayoutBalance | null;
  hasMore: boolean;
  message?: string;
}

export async function fetchPayoutsData() {
  if (!(await signedIn())) return null;
  try {
    return await apiClient.get<PayoutsDataShape>("/v1/billing/payouts", {
      query: { action: "list" },
    });
  } catch (error) {
    throw error instanceof ApiClientError ? new Error(error.message) : error;
  }
}

export async function fetchInstantPayoutBalance() {
  if (!(await signedIn())) return null;
  try {
    return await apiClient.get<Record<string, unknown>>("/v1/billing/payouts", {
      query: { action: "balance" },
    });
  } catch (error) {
    throw error instanceof ApiClientError ? new Error(error.message) : error;
  }
}

export async function fetchInstantPayoutEligibility() {
  if (!(await signedIn())) return null;
  try {
    return await apiClient.get<Record<string, unknown>>("/v1/billing/payouts", {
      query: { action: "eligibility" },
    });
  } catch (error) {
    throw error instanceof ApiClientError ? new Error(error.message) : error;
  }
}

/**
 * Trigger an instant payout for the connected Stripe account.
 * Pass `amount` (in cents) to pay out a specific amount; omit to pay out the full
 * available balance. Currency defaults to the account's first available currency.
 */
export async function triggerInstantPayout(opts?: { amount?: number; currency?: string }) {
  if (!(await signedIn())) throw new Error("Not signed in");
  try {
    const data = await apiClient.post<{
      success: boolean;
      noFunds?: boolean;
      error?: string;
      availableAmount?: number;
      currency?: string;
      payout?: {
        id: string;
        amount: number;
        currency: string;
        status: string;
        method: string;
        arrivalDate: number;
      };
    }>("/v1/billing/payouts/instant", opts ?? {});
    if (data?.error) throw new Error(String(data.error));
    return data;
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw new Error(error.message || "Payout failed");
    }
    throw error;
  }
}
