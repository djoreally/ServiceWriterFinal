/**
 * RouteRoleGuard — pure render gate based on the user's resolved team role.
 *
 * IMPORTANT: this component does NOT navigate. All redirect logic lives in
 * `RequireAuth` (single source of truth) to prevent cross-guard redirect
 * races. The shared access policy remains authoritative on the client, while
 * RLS remains authoritative on the server.
 */
import React from "react";
import { useTeamRole } from "@/hooks/useTeamRole";
import { canAccessRoute } from "@/domain/auth/route-authorization";
import { useLocation } from "react-router-dom";
import { AccessDenied } from "./AccessDenied";

interface RouteRoleGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const RouteRoleGuard: React.FC<RouteRoleGuardProps> = ({ children, fallback }) => {
  const { role, loading } = useTeamRole();
  const location = useLocation();

  if (loading) return null;
  if (role && canAccessRoute(role, location.pathname)) return <>{children}</>;

  // Unresolved identity is not a denial — the server (RLS) stays authoritative.
  if (!role) return <>{children}</>;
  return <>{fallback ?? <AccessDenied />}</>;
};
