import 'server-only';

import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';

import { idempotencyRequests } from '@/db/schema';
import { getDb } from '@/db/client';

type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

type ClaimInput = {
  workspaceId: string;
  commandName: string;
  idempotencyKey: string;
  requestFingerprint: unknown;
};

type CompleteInput = {
  workspaceId: string;
  commandName: string;
  idempotencyKey: string;
  responseStatus: number;
  responseBody: Record<string, unknown>;
  resourceType?: string | null;
  resourceId?: string | null;
};

export type IdempotencyClaim =
  | { kind: 'execute'; requestHash: string }
  | {
      kind: 'replay';
      responseStatus: number;
      responseBody: Record<string, unknown>;
      resourceType: string | null;
      resourceId: string | null;
    };

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }

  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(object[key])}`).join(',')}}`;
}

function hashRequest(value: unknown) {
  return createHash('sha256').update(stableSerialize(value)).digest('hex');
}

export async function claimIdempotency(
  tx: Transaction,
  input: ClaimInput,
): Promise<IdempotencyClaim> {
  const requestHash = hashRequest(input.requestFingerprint);

  const inserted = await tx
    .insert(idempotencyRequests)
    .values({
      workspaceId: input.workspaceId,
      commandName: input.commandName,
      idempotencyKey: input.idempotencyKey,
      requestHash,
    })
    .onConflictDoNothing()
    .returning({ requestHash: idempotencyRequests.requestHash });

  if (inserted.length === 1) {
    return { kind: 'execute', requestHash };
  }

  const rows = await tx.execute<{
    request_hash: string;
    status: 'pending' | 'completed';
    response_status: number | null;
    response_body: Record<string, unknown> | null;
    resource_type: string | null;
    resource_id: string | null;
  }>(sql`
    select request_hash, status, response_status, response_body, resource_type, resource_id
    from idempotency_requests
    where workspace_id = ${input.workspaceId}
      and command_name = ${input.commandName}
      and idempotency_key = ${input.idempotencyKey}
    for update
  `);

  const existing = rows[0];
  if (!existing) {
    throw Object.assign(new Error('Idempotency state could not be resolved'), {
      status: 500,
      code: 'idempotency_state_missing',
    });
  }

  if (existing.request_hash !== requestHash) {
    throw Object.assign(new Error('Idempotency key was already used with a different request'), {
      status: 409,
      code: 'idempotency_key_conflict',
    });
  }

  if (
    existing.status !== 'completed' ||
    existing.response_status === null ||
    existing.response_body === null
  ) {
    throw Object.assign(new Error('Idempotent command is still in progress'), {
      status: 409,
      code: 'idempotency_in_progress',
    });
  }

  return {
    kind: 'replay',
    responseStatus: existing.response_status,
    responseBody: existing.response_body,
    resourceType: existing.resource_type,
    resourceId: existing.resource_id,
  };
}

export async function completeIdempotency(tx: Transaction, input: CompleteInput) {
  await tx
    .update(idempotencyRequests)
    .set({
      status: 'completed',
      responseStatus: input.responseStatus,
      responseBody: input.responseBody,
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      completedAt: new Date(),
    })
    .where(
      and(
        eq(idempotencyRequests.workspaceId, input.workspaceId),
        eq(idempotencyRequests.commandName, input.commandName),
        eq(idempotencyRequests.idempotencyKey, input.idempotencyKey),
      ),
    );
}
