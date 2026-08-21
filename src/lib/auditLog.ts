// src/lib/auditLog.ts
import { supabase } from "@/integrations/supabase/client";
import type { AuditLogEvent, AuditLogDetails } from '@/shared/types/forms';

export type { AuditLogEvent, AuditLogDetails };

export async function logAuditEvent({
  user_id,
  action,
  entity,
  entity_id,
  status,
  ip,
  details
}: AuditLogEvent) {
  await supabase.from('audit_logs').insert([
    {
      user_id,
      action: action || 'unknown_action',
      table_name: entity || null,
      record_id: entity_id || null,
      ip_address: ip || null,
      new_data: (details || { status }) as any,
    },
  ]);
}
