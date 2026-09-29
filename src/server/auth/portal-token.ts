import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

function getPortalSecret(): string {
  return (
    process.env.PORTAL_SIGNING_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.CRON_SECRET ||
    'service-writer-portal-secret'
  );
}

export function generateQuotePortalToken(workspaceId: string, quoteId: string, expiresAt: Date): string {
  const expiryTimestamp = Math.floor(expiresAt.getTime() / 1000).toString();
  const payload = `${workspaceId}:${quoteId}:${expiryTimestamp}`;
  const signature = createHmac('sha256', getPortalSecret()).update(payload).digest('hex');
  return Buffer.from(`${expiryTimestamp}.${signature}`).toString('base64url');
}

export function verifyQuotePortalToken(token: string, workspaceId: string, quoteId: string): boolean {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const [expiryTimestamp, signature] = raw.split('.', 2);
    if (!expiryTimestamp || !signature) return false;

    const expiresAt = Number(expiryTimestamp) * 1000;
    if (Date.now() > expiresAt) return false;

    const payload = `${workspaceId}:${quoteId}:${expiryTimestamp}`;
    const expectedSignature = createHmac('sha256', getPortalSecret()).update(payload).digest('hex');

    const expectedBuf = Buffer.from(expectedSignature);
    const providedBuf = Buffer.from(signature);
    if (expectedBuf.length !== providedBuf.length) return false;

    return timingSafeEqual(expectedBuf, providedBuf);
  } catch {
    return false;
  }
}
