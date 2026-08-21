/**
 * useAppAccessGate — single client entry point for the server-side
 * access decision returned by the `gate-app-access` edge function.
 *
 * The server is the source of truth; this hook just caches the decision
 * and re-checks it when the session changes.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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

const GATE_CACHE_TTL_MS = 5 * 60 * 1000;
const GATE_TIMEOUT_MS = 4_000;

let cachedGateDecision: {
  userId: string;
  checkedAt: number;
  decision: AccessGateDecision;
} | null = null;

/**
 * In-flight de-duplication. Several consumers mount in the same tick on boot;
 * without this each one fires its own `gate-app-access` invocation, adding
 * seconds of duplicate latency to the first render.
 */
let inFlightGate: { userId: string; promise: Promise<AccessGateDecision> } | null = null;


function normalizeGateDecision(data: unknown): AccessGateDecision {
  const raw = (data ?? {}) as Partial<AccessGateDecision>;
  const reason = (raw.reason as GateReason | undefined) ?? "error";

  if (raw.allowed === true) {
    return { allowed: true, reason: "ok", redirectTo: null };
  }

  if (reason === "unauthenticated") {
    return { allowed: false, reason, redirectTo: "/login" };
  }

  if (reason === "onboarding_required") {
    return { allowed: false, reason, redirectTo: "/onboarding" };
  }

  // Unknown/stale server redirects must never select app sections such as
  // /settings as a startup destination. A gate error should not bounce a valid
  // paying/onboarded user away from the screen they tapped.
  return { allowed: true, reason: "error", redirectTo: null };
}

function getFreshCachedDecision(userId: string | null): AccessGateDecision | null {
  if (!userId || !cachedGateDecision || cachedGateDecision.userId !== userId) return null;
  if (Date.now() - cachedGateDecision.checkedAt > GATE_CACHE_TTL_MS) return null;
  return cachedGateDecision.decision;
}

async function withGateTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error("App access gate timed out")), GATE_TIMEOUT_MS);
    }),
  ]);
}

export function useAppAccessGate(): State & { refresh: () => Promise<void> } {
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user?.id ?? null;
  const accessToken = session?.access_token ?? null;
  const [state, setState] = useState<State>(() => {
    const cached = getFreshCachedDecision(userId);
    return cached ? { decision: cached, loading: false } : { decision: null, loading: true };
  });
  const lastUserIdRef = useRef<string | null | undefined>(undefined);

  const run = useCallback(async (force = false) => {
    if (!accessToken || !userId) {
      cachedGateDecision = null;
      setState({ decision: { allowed: false, reason: "unauthenticated", redirectTo: "/login" }, loading: false });
      return;
    }

    const cached = getFreshCachedDecision(userId);
    if (cached && !force) {
      setState({ decision: cached, loading: false });
      return;
    }

    if (inFlightGate && inFlightGate.userId === userId && !force) {
      const decision = await inFlightGate.promise;
      setState({ decision, loading: false });
      return;
    }

    const request = (async (): Promise<AccessGateDecision> => {
      try {
        const { data, error } = await withGateTimeout(
          supabase.functions.invoke("gate-app-access", {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
        );
        if (error) throw error;
        const decision = normalizeGateDecision(data);
        cachedGateDecision = { userId, checkedAt: Date.now(), decision };
        return decision;
      } catch (err) {
        console.warn("[useAppAccessGate] check failed, failing open:", err);
        // Fail OPEN when the edge function is unreachable. The subscription
        // context is the authoritative paid-plan gate; blocking here on a
        // transient network error would trap already-onboarded users in a
        // redirect loop between /dashboard and /onboarding.
        const decision: AccessGateDecision = { allowed: true, reason: "error", redirectTo: null };
        cachedGateDecision = { userId, checkedAt: Date.now(), decision };
        return decision;
      }
    })();

    inFlightGate = { userId, promise: request };
    try {
      const decision = await request;
      setState({ decision, loading: false });
    } finally {
      if (inFlightGate?.promise === request) inFlightGate = null;
    }
  }, [accessToken, userId]);


  useEffect(() => {
    if (authLoading) return;
    // Re-run only when identity changes (not on silent refreshes)
    if (lastUserIdRef.current === userId && state.decision) return;
    lastUserIdRef.current = userId;
    void run();
  }, [authLoading, userId, run, state.decision]);

  return { ...state, refresh: () => run(true) };
}
