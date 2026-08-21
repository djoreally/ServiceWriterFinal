/**
 * ProtectedAction — wraps UI elements that should only be visible/usable
 * when the user has the required permission.
 *
 * Usage:
 *   <ProtectedAction action="delete" resource="appointments">
 *     <Button>Delete</Button>
 *   </ProtectedAction>
 */

import React from 'react';
import { useRBAC, Action, Resource } from '@packages/auth';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ProtectedActionProps {
  action: Action;
  resource: Resource;
  attributes?: Record<string, unknown>;
  children: React.ReactNode;
  /** Show a disabled version instead of hiding */
  showDisabled?: boolean;
  disabledTooltip?: string;
  fallback?: React.ReactNode;
}

export const ProtectedAction: React.FC<ProtectedActionProps> = ({
  action,
  resource,
  attributes,
  children,
  showDisabled = false,
  disabledTooltip = 'You do not have permission to perform this action',
  fallback = null,
}) => {
  const { can, loading } = useRBAC();

  if (loading) return null;

  const allowed = can(action, resource, attributes);

  if (allowed) return <>{children}</>;

  if (showDisabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-not-allowed opacity-50 pointer-events-none">
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{disabledTooltip}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return <>{fallback}</>;
};
