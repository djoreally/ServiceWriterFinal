import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type AppRole = "admin" | "moderator" | "user";
export type Action = "create" | "read" | "update" | "delete" | "manage";
export type Resource = string;
export type UserRole = "admin" | "tenant_owner" | "tenant_staff" | "customer";

export interface FrontendUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<FrontendSession | null>(null);
  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    loading: false,
    signOut: async () => setSession(null),
  }), [session]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

export function useRBAC() {
  const { user } = useAuth();
  const hasRole = useCallback((_role: AppRole) => false, []);
  const can = useCallback((_action: Action, _resource: Resource, _attributes?: Record<string, unknown>) => Boolean(user), [user]);
  return { roles: [] as AppRole[], loading: false, hasRole, can };
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
  }, [session, signOut, options.idleTimeoutMs]);
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
