'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { headers } from 'next/headers';

import { getDb } from '@/db/client';
import { quotes } from '@/db/schema';
import { decideQuoteCommand } from '@/server/application/quotes/decide-quote';
import { verifyQuotePortalToken } from '@/server/auth/portal-token';

function requestClientIpFromHeaders(reqHeaders: Headers) {
  const forwarded = reqHeaders.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim().slice(0, 64) || null;
  const realIp = reqHeaders.get('x-real-ip')?.trim();
  return realIp ? realIp.slice(0, 64) : null;
}

export async function submitPortalQuoteDecision(
  quoteId: string,
  token: string,
  decision: 'approved' | 'declined',
  formData: FormData,
) {
  const [quote] = await getDb()
    .select({ id: quotes.id, workspaceId: quotes.workspaceId })
    .from(quotes)
    .where(eq(quotes.id, quoteId))
    .limit(1);

  if (!quote || !verifyQuotePortalToken(token, quote.workspaceId, quote.id)) {
    redirect(`/portal/quotes/${quoteId}?token=${encodeURIComponent(token)}&error=${encodeURIComponent('Invalid or expired approval token.')}`);
  }

  const reqHeaders = headers();
  const signatureIp = requestClientIpFromHeaders(reqHeaders);
  const reason = (formData.get('reason') as string)?.trim() || null;
  const termsVersion = (formData.get('termsVersion') as string)?.trim() || 'v1';

  try {
    const idempotencyKey = `portal-form:${quote.id}:${decision}:${Date.now()}`;
    await decideQuoteCommand({
      workspaceId: quote.workspaceId,
      quoteId: quote.id,
      decision,
      approvalMethod: 'customer_link',
      termsVersion,
      signatureIp,
      reason,
      idempotencyKey,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Could not submit quote decision.';
    redirect(`/portal/quotes/${quoteId}?token=${encodeURIComponent(token)}&error=${encodeURIComponent(msg)}`);
  }

  revalidatePath(`/portal/quotes/${quoteId}`);
  redirect(`/portal/quotes/${quoteId}?token=${encodeURIComponent(token)}&notice=${encodeURIComponent(decision === 'approved' ? 'Quote approved successfully.' : 'Quote marked declined.')}`);
}
