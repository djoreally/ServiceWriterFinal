import 'server-only';

import { and, desc, eq } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { workOrders } from '@/db/schema';

export async function listWorkOrders(
  workspaceId: string,
  input: { status?: typeof workOrders.$inferSelect.status; limit: number; offset: number },
) {
  return getDb().select().from(workOrders).where(and(
    eq(workOrders.workspaceId, workspaceId),
    input.status ? eq(workOrders.status, input.status) : undefined,
  )).orderBy(desc(workOrders.updatedAt)).limit(input.limit).offset(input.offset);
}
