/**
 * Centralized Audit Logging
 *
 * SOC 2 / GDPR compliance: all critical actions must be logged.
 * Uses the shared Supabase client to avoid creating duplicate connections.
 *
 * Critical actions to log:
 * - Authentication events (login, logout, failed login)
 * - Data mutations (create, update, delete) on sensitive resources
 * - Admin operations
 * - Permission denials
 * - Data exports
 */

import { supabase } from '@/integrations/supabase/client';

export type AuditAction =
  // Auth
  | 'user.login'
  | 'user.logout'
  | 'user.login_failed'
  | 'user.password_reset'
  | 'admin.login'
  | 'admin.login_failed'
  // Data mutations
  | 'appointment.created'
  | 'appointment.updated'
  | 'appointment.deleted'
  | 'appointment.status_changed'
  | 'customer.created'
  | 'customer.updated'
  | 'customer.deleted'
  | 'vehicle.created'
  | 'vehicle.updated'
  | 'vehicle.deleted'
  | 'payment.recorded'
  | 'payment.refunded'
  | 'invoice.sent'
  // Admin ops
  | 'settings.updated'
  | 'user.role_assigned'
  | 'user.role_revoked'
  | 'data.exported'
  // Security
  | 'permission.denied'
  | 'session.expired'
  | 'session.idle_timeout';

export type AuditStatus = 'success' | 'failure' | 'warning';

export interface AuditEntry {
  action: AuditAction;
  status: AuditStatus;
  user_id?: string | null;
  details?: Record<string, unknown>;
  resource_type?: string;
  resource_id?: string;
}

/**
 * Log an audit event to the audit_logs table.
 * Fails silently to never block user operations.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    // Shadow Data Audit Finding #1: Do not persist user_email — use user_id only
    const insertData = {
      action: String(entry.action),
      user_id: entry.user_id ?? user?.id ?? null,
      new_data: (entry.details ?? null) as Record<string, unknown>,
      table_name: entry.resource_type ?? null,
      record_id: entry.resource_id ?? null,
    };
    await (supabase.from('audit_logs') as any).insert(insertData);
  } catch (err) {
    // Audit logging must never crash the app
    if (process.env.NODE_ENV !== "production") {
      console.warn('[Audit] Failed to log event:', entry.action, err);
    }
  }
}

/**
 * Log a permission denial — useful for security monitoring.
 */
export async function logPermissionDenied(
  userId: string,
  action: string,
  resource: string
): Promise<void> {
  await logAudit({
    action: 'permission.denied',
    status: 'failure',
    user_id: userId,
    details: { attempted_action: action, resource },
  });
}
