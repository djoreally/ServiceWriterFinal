export type OfflineSyncStatus = 'synced' | 'pending' | 'failed';

export interface OfflineSyncMetadata {
  serverId?: string;
  updatedAtServer?: number;
  updatedAtLocal: number;
  syncStatus: OfflineSyncStatus;
  isDeleted: boolean;
}

export type OfflineOutboxStatus =
  | 'pending'
  | 'processing'
  | 'failed'
  | 'synced'
  | 'dead_letter'
  | 'discarded';

export type OfflineOutboxEntity = 'appointment' | 'inventory' | 'service_catalog';

export type OfflineOutboxOperation =
  | 'update_status'
  | 'transfer'
  | 'create'
  | 'update'
  | 'delete';

export interface OfflineOutboxItem {
  mutationId: string;
  entity: OfflineOutboxEntity;
  operation: OfflineOutboxOperation;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  createdAt: number;
  updatedAt: number;
  status: OfflineOutboxStatus;
  attemptCount: number;
  nextRetryAt?: number;
  ackedAt?: number;
  lastError?: string;
  deadLetterReason?: string;
}
