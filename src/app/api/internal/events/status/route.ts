import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';

import { getDb } from '@/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization');
  if (!header || !header.startsWith('Bearer ')) return false;
  const token = header.slice(7);
  const secretBuf = Buffer.from(secret);
  const tokenBuf = Buffer.from(token);
  if (secretBuf.length !== tokenBuf.length) return false;
  return timingSafeEqual(secretBuf, tokenBuf);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
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
