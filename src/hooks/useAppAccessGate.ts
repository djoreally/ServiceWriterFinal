/**
 * useAppAccessGate — canonical authenticated/workspace access decision.
 *
 * The retired `gate-app-access` Edge Function is no longer part of the live
 * Supabase project. The browser therefore derives the startup decision from the
 * authenticated Supabase session plus canonical workspace ownership/membership.
 * Route-level RBAC remains enforced independently by server/application guards.
 */
import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@packages/auth";
import { apiClient } from "@/lib/api-client";

export type GateReason =
  | "ok"
  | "unauthenticated"
  | "onboarding_required"
  | "error";

export interface AccessGateDecision {
  allowed: boolean;
  reason: GateReason;
  redirectTo: string | null;
}

interface State {
  decision: AccessGateDecision | null;
  loading: boolean;
}

async function decisionForUser(_userId: string): Promise<AccessGateDecision> {
  try {
    const status = await apiClient.get<{
      authenticated: boolean;
      onboardingCompleted: boolean;
      verified?: boolean;
    }>("/v1/platform/onboarding/status");

    if (!status.authenticated) {
      return { allowed: false, reason: "unauthenticated", redirectTo: "/login" };
    }
    if (!status.onboardingCompleted) {
      return { allowed: false, reason: "onboarding_required", redirectTo: "/onboarding" };
    }
    return { allowed: true, reason: "ok", redirectTo: null };
  } catch (error) {
    console.warn("[useAppAccessGate] verified onboarding check failed:", error);
    // Fail closed. An authenticated owner must never reach the dashboard when
    // onboarding persistence cannot be verified. Team members are explicitly
    // exempted by the server-side onboarding status contract.
    return { allowed: false, reason: "onboarding_required", redirectTo: "/onboarding" };
  }
}

export function useAppAccessGate(): State & { refresh: () => Promise<void> } {
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user?.id ?? null;

  const query = useQuery({
    queryKey: ["app-access-gate", userId],
    queryFn: () => decisionForUser(userId as string),
    enabled: !authLoading && Boolean(userId),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const refresh = useCallback(async () => {
    if (!userId || authLoading) return;
    await query.refetch();
  }, [authLoading, query, userId]);

  if (authLoading) return { decision: null, loading: true, refresh };
  if (!userId) {
    return {
      decision: { allowed: false, reason: "unauthenticated", redirectTo: "/login" },
      loading: false,
      refresh,
    };
  }

  return {
    decision: query.data ?? null,
    loading: query.isLoading || query.isFetching,
    refresh,
  };
}
