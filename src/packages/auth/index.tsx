/**
 * AI TERRITORY: OWNER-GATED — see docs/ai-territory.md.
 * No agent changes without Ty's explicit word.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  SESSION_LIFE_LIMITS,
  SessionLifeGuard,
  isAuthRoute,
  type SessionLifeExpiryReason,
} from "./session-life";

export type AppRole = "admin" | "moderator" | "user";
export type Action = "create" | "read" | "update" | "delete" | "manage";
export type Resource = string;
export type UserRole = "admin" | "tenant_owner" | "tenant_staff" | "customer";

export interface FrontendUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
  created_at?: string;
}

export interface FrontendSession {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user: FrontendUser;
}

interface AuthContextValue {
  session: FrontendSession | null;
  user: FrontendUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  loading: false,
  signOut: async () => undefined,
});

export type AuthStateSource = {
  getSession?: () => Promise<{ data: { session: FrontendSession | null }; error?: unknown }>;
  signOut?: () => Promise<{ error?: unknown }>;
  onAuthStateChange?: (callback: (event: string, session: FrontendSession | null) => void) => {
    data?: { subscription?: { unsubscribe?: () => void } };
  };
};

export function AuthProvider({
  children,
  initialSession = null,
  authStateSource,
}: {
  children: React.ReactNode;
  initialSession?: FrontendSession | null;
  authStateSource?: AuthStateSource;
}) {
  const [session, setSession] = useState<FrontendSession | null>(initialSession);
  const [loading, setLoading] = useState(Boolean(authStateSource?.getSession && !initialSession));

  // --- Session life guard -------------------------------------------------
  // Enforces the inactivity timeout and absolute session-age cap from
  // session-life.ts. The guard owns both clocks; this provider only feeds it
  // session identity, real user activity, and the sign-out/redirect action.
  const guardRef = useRef<SessionLifeGuard | null>(null);
  const expiringRef = useRef(false);

  const expireSession = useCallback(async (_reason: SessionLifeExpiryReason) => {
    if (expiringRef.current) return;
    expiringRef.current = true;
    try {
      if (authStateSource?.signOut) await authStateSource.signOut();
    } catch {
      // Even if the network sign-out fails, the local session ends here.
    }
    // Wipe any record a racing auth event may have begun while the sign-out
    // was in flight; the session is over either way.
    guardRef.current?.endSession();
    setSession(null);
    if (typeof window !== "undefined" && !isAuthRoute(window.location.pathname)) {
      const returnTo = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
      try {
        window.location.assign(`/login?returnTo=${returnTo}`);
      } catch {
        // Non-browser/test environments cannot navigate; the cleared session
        // still routes through the normal route guards.
      }
    }
  }, [authStateSource]);
  const expireSessionRef = useRef(expireSession);
  useEffect(() => {
    expireSessionRef.current = expireSession;
  }, [expireSession]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const guard = new SessionLifeGuard({
      onExpire: (reason) => { void expireSessionRef.current(reason); },
    });
    guardRef.current = guard;

    const onActivity = () => guard.recordActivity();
    const activityEvents: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "touchstart",
      "scroll",
    ];
    for (const eventName of activityEvents) {
      window.addEventListener(eventName, onActivity, { passive: true });
    }
    // History navigation counts as activity even without a preceding pointer
    // or key event (e.g. browser back/forward).
    window.addEventListener("popstate", onActivity);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") guard.check();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const interval = window.setInterval(() => guard.check(), SESSION_LIFE_LIMITS.checkIntervalMs);

    return () => {
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, onActivity);
      }
      window.removeEventListener("popstate", onActivity);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(interval);
      if (guardRef.current === guard) guardRef.current = null;
    };
  }, []);

  // Feed session identity to the guard. Keyed on the user id only, so a
  // TOKEN_REFRESHED (new access token, same user) never re-begins the
  // session and never moves either clock.
  const sessionUserId = session?.user?.id;
  useEffect(() => {
    const guard = guardRef.current;
    if (!guard) return;
    if (sessionUserId) {
      expiringRef.current = false;
      guard.beginSession(sessionUserId);
      // A persisted record may already be past a limit (the tab was closed
      // for days while the refresh token lived on): trip it now, not at the
      // first interval tick.
      guard.check();
    } else {
      guard.endSession();
    }
  }, [sessionUserId]);

  useEffect(() => {
    let active = true;
    let receivedAuthEvent = false;
    const result = authStateSource?.onAuthStateChange?.((event, nextSession) => {
      receivedAuthEvent = true;
      if (!active) return;
      if (event === "TOKEN_REFRESHED" && guardRef.current?.handleSilentRefresh()) {
        // A silent refresh is not activity and must not extend the session.
        // This one arrived after a limit had already passed, so the guard
        // tripped: expireSession is ending the session, and the refreshed
        // session must not be applied on top of it.
        setLoading(false);
        return;
      }
      setSession(nextSession);
      setLoading(false);
    });

    if (authStateSource?.getSession) {
      void authStateSource.getSession().then(({ data }) => {
        if (!active) return;
        if (!receivedAuthEvent) setSession(data.session);
        setLoading(false);
      }).catch(() => {
        if (active) setLoading(false);
      });
    }

    return () => {
      active = false;
      result?.data?.subscription?.unsubscribe?.();
    };
  }, [authStateSource]);
  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    loading,
    signOut: async () => {
      guardRef.current?.endSession();
      if (authStateSource?.signOut) await authStateSource.signOut();
      setSession(null);
    },
  }), [authStateSource, loading, session]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

/**
 * Platform RBAC is global and intentionally separate from workspace membership.
 * Workspace roles (owner/manager/dispatcher/technician) are resolved by
 * useTeamRole; platform roles live in public.user_roles and gate /admin.
 */
export function useRBAC() {
  const { user } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(Boolean(user));

  useEffect(() => {
    let active = true;
    if (!user?.id) {
      setRoles([]);
      setLoading(false);
      return () => { active = false; };
    }

    setLoading(true);
    void supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.warn("[rbac] Failed to load platform roles", { code: error.code });
          setRoles([]);
        } else {
          const nextRoles = (data ?? [])
            .map((row) => String(row.role))
            .filter((role): role is AppRole => role === "admin" || role === "moderator" || role === "user");
          setRoles([...new Set(nextRoles)]);
        }
        setLoading(false);
      });

    return () => { active = false; };
  }, [user?.id]);

  const hasRole = useCallback((role: AppRole) => roles.includes(role), [roles]);
  const isAdmin = useCallback(() => roles.includes("admin"), [roles]);
  const can = useCallback((_action: Action, _resource: Resource, _attributes?: Record<string, unknown>) => Boolean(user), [user]);
  return { roles, loading, hasRole, isAdmin, can };
}

export function useSessionSecurity(options: {
  idleTimeoutMs?: number;
  warnBeforeExpiryMs?: number;
  onSessionWarning?: () => void;
  onSessionExpired?: () => void;
  onIdleTimeout?: () => void;
} = {}) {
  const { session, signOut } = useAuth();
  const optionsRef = useRef(options);
  const signOutRef = useRef(signOut);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    signOutRef.current = signOut;
  }, [signOut]);

  useEffect(() => {
    const idleTimeoutMs = optionsRef.current.idleTimeoutMs;
    if (!session || !idleTimeoutMs) return;

    let timer: number | undefined;

    const scheduleTimeout = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        optionsRef.current.onIdleTimeout?.();
        void signOutRef.current();
      }, idleTimeoutMs);
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "touchstart",
      "scroll",
    ];

    for (const eventName of activityEvents) {
      window.addEventListener(eventName, scheduleTimeout, { passive: true });
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") scheduleTimeout();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    scheduleTimeout();

    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, scheduleTimeout);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [session?.access_token]);
}

export async function hasRole(userId: string, role: AppRole): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", role)
    .maybeSingle();
  return !error && Boolean(data);
}

export function isAdmin(userId: string): Promise<boolean> {
  return hasRole(userId, "admin");
}

export function isResourceOwner(resourceUserId: string, currentUserId: string): boolean {
  return resourceUserId === currentUserId;
}

export function canAccessTenant(tenantUserId: string, currentUserId?: string) {
  return currentUserId && tenantUserId === currentUserId
    ? { allowed: true }
    : { allowed: false, reason: "Not authorized" };
}

export function canModifyResource(resourceUserId: string, currentUserId?: string) {
  return currentUserId && resourceUserId === currentUserId
    ? { allowed: true }
    : { allowed: false, reason: "Not authorized" };
}

export function withPermission<T, Args extends unknown[]>(check: () => { allowed: boolean; reason?: string }, operation: (...args: Args) => Promise<T>) {
  return async (...args: Args) => {
    const result = check();
    if (!result.allowed) throw new Error(result.reason || "Permission denied");
    return operation(...args);
  };
}

export {
  SESSION_LIFE_LIMITS,
  SESSION_LIFE_STORAGE_KEY,
  SessionLifeGuard,
  evaluateSessionLife,
  type SessionLifeExpiryReason,
  type SessionLifeLimits,
  type SessionLifeRecord,
} from "./session-life";

export type AuthState = { session: FrontendSession | null; user: FrontendUser | null; loading: boolean };
export type Permission = { resource: string; action: Action };
export type RolePermissions = { role: UserRole; permissions: Permission[] };
