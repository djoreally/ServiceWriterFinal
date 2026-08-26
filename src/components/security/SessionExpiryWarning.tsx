/**
 * SessionExpiryWarning — toasts a warning before session expires
 * and auto signs out on idle timeout.
 *
 * Mount once in AppLayout or App root.
 */

import { useEffect } from 'react';
import { toast } from '@/components/ui/sonner';
import { useSessionSecurity } from '@packages/auth';
import { useAuth } from '@packages/auth';
import { logAudit } from '@/lib/security/audit';
import { refreshAuthSession } from '@/application/commands/auth.command';

export function SessionExpiryWarning(): null {
  const { user, signOut } = useAuth();

  useSessionSecurity({
    idleTimeoutMs: 30 * 60 * 1000, // 30 min idle

    onSessionWarning: () => {
      toast.warning('Your session expires in 5 minutes. Save your work.', {
        duration: 10000,
        action: {
          label: 'Stay signed in',
          onClick: () => {
            refreshAuthSession();
          },
        },
      });
    },

    onSessionExpired: async () => {
      await logAudit({ action: 'session.expired', status: 'warning', user_id: user?.id });
      toast.error('Your session has expired. Please sign in again.');
      await signOut();
    },

    onIdleTimeout: async () => {
      await logAudit({ action: 'session.idle_timeout', status: 'warning', user_id: user?.id });
      toast.info('You were signed out due to inactivity.');
    },
  });

  return null; // This component only manages side effects
}
