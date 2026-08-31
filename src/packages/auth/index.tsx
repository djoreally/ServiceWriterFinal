import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

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

  useEffect(() => {
    let active = true;
    let receivedAuthEvent = false;
    const result = authStateSource?.onAuthStateChange?.((_event, nextSession) => {
      receivedAuthEvent = true;
      if (!active) return;
      setSession(nextSession);
      setLoading(false);
    });

    if (authStateSource?.getSession) {
      void authStateSource.getSession().then(({ data }) => {
        if (!active) return;
        // An auth event that arrives while getSession is in flight is newer
        // than the snapshot and must win (notably SIGNED_IN after submit).
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
      if (authStateSource?.signOut) await authStateSource.signOut();
      setSession(null);
    },
  }), [authStateSource, loading, session]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

export function useRBAC() {
  const { user } = useAuth();
  const hasRole = useCallback((_role: AppRole) => false, []);
  const isAdmin = useCallback(() => false, []);
  const can = useCallback((_action: Action, _resource: Resource, _attributes?: Record<string, unknown>) => Boolean(user), [user]);
  return { roles: [] as AppRole[], loading: false, hasRole, isAdmin, can };
}

export function useSessionSecurity(options: {
  idleTimeoutMs?: number;
  warnBeforeExpiryMs?: number;
  onSessionWarning?: () => void;
  onSessionExpired?: () => void;
  onIdleTimeout?: () => void;
} = {}) {
  const { session, signOut } = useAuth();
  useEffect(() => {
    if (!session || !options.idleTimeoutMs) return;
    const timer = window.setTimeout(() => {
      options.onIdleTimeout?.();
      void signOut();
    }, options.idleTimeoutMs);
    return () => window.clearTimeout(timer);
  }, [session, signOut, options.idleTimeoutMs, options]);
}

export function hasRole(_userId: string, _role: AppRole): Promise<boolean> {
  return Promise.resolve(false);
}

export function isAdmin(_userId: string): Promise<boolean> {
  return Promise.resolve(false);
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

export type AuthState = { session: FrontendSession | null; user: FrontendUser | null; loading: boolean };
export type Permission = { resource: string; action: Action };
export type RolePermissions = { role: UserRole; permissions: Permission[] };
