import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';

import { getDb } from '@/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== 'Bearer ' + secret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const rows = await getDb().execute<{
    status: string;
    count: number;
  }>(sql`
    select status::text, count(*)::int as count
    from event_deliveries
    group by status
    order by status
  `);

  return NextResponse.json({ ok: true, deliveries: Array.from(rows) });
}
