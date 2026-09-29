import 'server-only';

import { completeInspection } from '@/server/application/inspections/complete-inspection';
import { completeWorkOrderJob, startWorkOrderJob } from '@/server/application/work-orders/job-lifecycle';

export type TechnicianActionItem = {
  actionId: string;
  type: 'start_job' | 'complete_inspection' | 'complete_job';
  workOrderId: string;
  templateId?: string;
  notes?: string | null;
  workPerformed?: string | null;
  inspectionResults?: Array<{
    itemId: string;
    status: 'good' | 'attention' | 'urgent' | 'not_applicable';
    notes?: string | null;
  }>;
  timestamp: string;
};

export type SyncTechnicianOfflineQueueInput = {
  workspaceId: string;
  actorUserId: string;
  actions: TechnicianActionItem[];
};

export type ActionResultReceipt = {
  actionId: string;
  type: TechnicianActionItem['type'];
  workOrderId: string;
  status: 'applied' | 'skipped' | 'failed';
  error?: string;
};

export async function syncTechnicianOfflineQueue(input: SyncTechnicianOfflineQueueInput) {
  // Sort actions chronologically to preserve sequence
  const sorted = [...input.actions].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const receipts: ActionResultReceipt[] = [];

  for (const action of sorted) {
    try {
      if (action.type === 'start_job') {
        await startWorkOrderJob({
          workspaceId: input.workspaceId,
          workOrderId: action.workOrderId,
          actorUserId: input.actorUserId,
        });
        receipts.push({
          actionId: action.actionId,
          type: action.type,
          workOrderId: action.workOrderId,
          status: 'applied',
        });
      } else if (action.type === 'complete_inspection') {
        if (!action.templateId || !action.inspectionResults) {
          throw new Error('Template ID and inspection results are required.');
        }
        await completeInspection({
          workspaceId: input.workspaceId,
          workOrderId: action.workOrderId,
          templateId: action.templateId,
          actorUserId: input.actorUserId,
          inspectorName: null,
          notes: action.notes ?? null,
          results: action.inspectionResults.map((r) => ({
            itemId: r.itemId,
            status: r.status,
            notes: r.notes ?? null,
          })),
        });
        receipts.push({
          actionId: action.actionId,
          type: action.type,
          workOrderId: action.workOrderId,
          status: 'applied',
        });
      } else if (action.type === 'complete_job') {
        await completeWorkOrderJob({
          workspaceId: input.workspaceId,
          workOrderId: action.workOrderId,
          actorUserId: input.actorUserId,
          workPerformed: action.workPerformed ?? null,
        });
        receipts.push({
          actionId: action.actionId,
          type: action.type,
          workOrderId: action.workOrderId,
          status: 'applied',
        });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Action failed';
      receipts.push({
        actionId: action.actionId,
        type: action.type,
        workOrderId: action.workOrderId,
        status: 'failed',
        error: msg,
      });
    }
  }

  const appliedCount = receipts.filter((r) => r.status === 'applied').length;
  const failedCount = receipts.filter((r) => r.status === 'failed').length;

  return {
    processed: receipts.length,
    applied: appliedCount,
    failed: failedCount,
    receipts,
  };
}
