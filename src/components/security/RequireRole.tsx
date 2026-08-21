/**
 * RequireRole — route-level role guard component.
 * Redirects to /auth if user lacks required role.
 *
 * Usage (in App.tsx routes):
 *   <Route path="/admin" element={<RequireRole role="admin"><AdminDashboard /></RequireRole>} />
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useRBAC, AppRole } from '@packages/auth';
import { useAuth } from '@packages/auth';

interface RequireRoleProps {
  role: AppRole | AppRole[];
  children: React.ReactNode;
  redirectTo?: string;
}

export const RequireRole: React.FC<RequireRoleProps> = ({
  role,
  children,
  redirectTo = '/auth',
}) => {
  const { session, loading: authLoading } = useAuth();
  const { hasRole, loading: rbacLoading } = useRBAC();

  if (authLoading || rbacLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to={redirectTo} replace />;
  }

  const requiredRoles = Array.isArray(role) ? role : [role];
  const hasAnyRole = requiredRoles.some((r) => hasRole(r));

  if (!hasAnyRole) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};
