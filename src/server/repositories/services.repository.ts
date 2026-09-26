import 'server-only';

import { and, asc, eq } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { serviceCatalog } from '@/db/schema';

export async function listServices(
  workspaceId: string,
  input: { activeOnly: boolean; limit: number; offset: number },
) {
  return getDb()
    .select()
    .from(serviceCatalog)
    .where(and(
      eq(serviceCatalog.workspaceId, workspaceId),
      input.activeOnly ? eq(serviceCatalog.isActive, true) : undefined,
    ))
    .orderBy(asc(serviceCatalog.category), asc(serviceCatalog.name))
    .limit(input.limit)
    .offset(input.offset);
}
