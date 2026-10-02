/**
 * useAppAccessGate — authentication-only application access decision.
 *
 * Business onboarding is sunset. Authentication and route-level RBAC are the
 * only startup gates; workspace/settings completeness is handled inside the
 * relevant settings screens instead of blocking login.
 */
import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@packages/auth";

export type GateReason =
  | "ok"
  | "unauthenticated"
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
  return { allowed: true, reason: "ok", redirectTo: null };
}

export function useAppAccessGate(): State & { refresh: () => Promise<void> } {
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user?.id ?? null;

  const query = useQuery({
    queryKey: ["app-access-gate", userId],
    queryFn: () => decisionForUser(userId as string),
    enabled: !authLoading && Boolean(userId),
    staleTime: Infinity,
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
    decision: query.data ?? { allowed: true, reason: "ok", redirectTo: null },
    loading: query.isLoading || query.isFetching,
    refresh,
  };
}
