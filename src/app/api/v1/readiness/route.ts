import { sql } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { apiError, apiOk, requestId } from '@/server/http/api-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const id = requestId(request);

  try {
    await getDb().execute(sql`select 1 as ready`);
    return apiOk(
      { service: 'service-writer-api', status: 'ready', database: 'ready', timestamp: new Date().toISOString() },
      id,
    );
  } catch (error) {
    console.error('[readiness] database check failed', { requestId: id, error });
    return apiError(503, 'DATABASE_UNAVAILABLE', 'Database readiness check failed.', id);
  }
}
