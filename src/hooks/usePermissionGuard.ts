/**
 * Permission guard hook — use in components to conditionally render
 * based on RBAC/ABAC permissions.
 *
 * Usage:
 *   const { allowed, loading } = usePermissionGuard('update', 'appointments');
 *   if (!allowed) return <AccessDenied />;
 */

import { useRBAC, Action, Resource } from '@packages/auth';

interface GuardOptions {
  /** Optional ABAC attributes to check ownership, etc. */
  attributes?: Record<string, unknown>;
}

export function usePermissionGuard(
  action: Action,
  resource: Resource,
  options?: GuardOptions
) {
  const { can, loading, roles } = useRBAC();

  return {
    allowed: !loading && can(action, resource, options?.attributes),
    loading,
    roles,
  };
}
