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
import { productionSupabase } from "@/integrations/supabase/client";

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

async function decisionForUser(userId: string): Promise<AccessGateDecision> {
  try {
    const membership = await productionSupabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (membership.error) throw membership.error;
    if (membership.data?.workspace_id) {
      return { allowed: true, reason: "ok", redirectTo: null };
    }

    const ownedWorkspace = await productionSupabase
      .from("workspaces")
      .select("id")
      .eq("created_by", userId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (ownedWorkspace.error) throw ownedWorkspace.error;
    if (ownedWorkspace.data?.id) {
      return { allowed: true, reason: "ok", redirectTo: null };
    }

    return { allowed: false, reason: "onboarding_required", redirectTo: "/onboarding" };
  } catch (error) {
    console.warn("[useAppAccessGate] canonical workspace check failed:", error);
    // A transient workspace read must not lock an already-authenticated user out
    // of the application; route-level authorization remains authoritative.
    return { allowed: true, reason: "error", redirectTo: null };
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
