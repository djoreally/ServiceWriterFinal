import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

import { drainDomainEvents } from '@/server/events/drain';

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

async function handle(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const result = await drainDomainEvents({
    workerId: 'vercel-cron',
    limit: 25,
  });

  return NextResponse.json({ ok: true, ...result });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
