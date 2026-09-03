/**
 * useAppAccessGate — lightweight authenticated-session gate.
 *
 * The retired `gate-app-access` Edge Function is no longer part of the live
 * Supabase project. Workspace membership, role authorization, onboarding and
 * subscription state are enforced by their canonical app/server boundaries.
 * This hook therefore answers only the question it can own safely: whether an
 * authenticated application session exists.
 */
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@packages/auth";

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

function decisionForSession(hasSession: boolean): AccessGateDecision {
  return hasSession
    ? { allowed: true, reason: "ok", redirectTo: null }
    : { allowed: false, reason: "unauthenticated", redirectTo: "/login" };
}

export function useAppAccessGate(): State & { refresh: () => Promise<void> } {
  const { session, loading: authLoading } = useAuth();
  const [state, setState] = useState<State>({ decision: null, loading: true });

  const run = useCallback(async () => {
    if (authLoading) {
      setState((current) => ({ ...current, loading: true }));
      return;
    }
    setState({ decision: decisionForSession(Boolean(session?.user?.id)), loading: false });
  }, [authLoading, session?.user?.id]);

  useEffect(() => {
    void run();
  }, [run]);

  return { ...state, refresh: run };
}
