import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import Stripe from 'stripe';

import { getStripeClient, getStripeWebhookSecret } from '@/server/payments/stripe/client';
import { recordSuccessfulPaymentCommand } from '@/server/application/payments/record-successful-payment';
import { getDb } from '@/db/client';
import { providerConnections } from '@/db/schema';

export const runtime = 'nodejs';

type PaymentMetadata = {
  workspace_id?: string;
  invoice_id?: string;
};

function requiredMetadata(paymentIntent: Stripe.PaymentIntent) {
  const metadata = paymentIntent.metadata as PaymentMetadata;
  if (!metadata.workspace_id || !metadata.invoice_id) {
    throw Object.assign(new Error('Stripe PaymentIntent is missing Service Writer routing metadata'), {
      status: 400,
      code: 'stripe_payment_metadata_missing',
    });
  }
  return { workspaceId: metadata.workspace_id, invoiceId: metadata.invoice_id };
}

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: { code: 'stripe_signature_missing' } }, { status: 400 });

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(rawBody, signature, getStripeWebhookSecret());
  } catch {
    return NextResponse.json({ error: { code: 'stripe_signature_invalid' } }, { status: 400 });
  }

  if (event.type !== 'payment_intent.succeeded') {
    return NextResponse.json({ received: true, ignored: true });
  }

  const paymentIntent = event.data.object;
  let routing: ReturnType<typeof requiredMetadata>;
  try {
    routing = requiredMetadata(paymentIntent);
  } catch {
    return NextResponse.json({ error: { code: 'stripe_payment_metadata_missing' } }, { status: 400 });
  }

  if (!event.account) {
    return NextResponse.json({ error: { code: 'stripe_connected_account_missing' } }, { status: 400 });
  }

  const [binding] = await getDb()
    .select({ externalAccountId: providerConnections.externalAccountId, status: providerConnections.status })
    .from(providerConnections)
    .where(and(
      eq(providerConnections.workspaceId, routing.workspaceId),
      eq(providerConnections.provider, 'stripe'),
    ))
    .limit(1);

  if (!binding || binding.status !== 'connected' || binding.externalAccountId !== event.account) {
    return NextResponse.json({ error: { code: 'stripe_connected_account_mismatch' } }, { status: 409 });
  }

  if (paymentIntent.amount_received <= 0) {
    return NextResponse.json({ error: { code: 'stripe_payment_amount_invalid' } }, { status: 400 });
  }

  try {
    await recordSuccessfulPaymentCommand({
      workspaceId: routing.workspaceId,
      invoiceId: routing.invoiceId,
      provider: 'stripe',
      providerPaymentId: paymentIntent.id,
      amountMinor: paymentIntent.amount_received,
      currencyCode: paymentIntent.currency,
      paidAt: new Date(event.created * 1000),
      idempotencyKey: 'stripe:' + event.id,
      traceId: event.id,
      metadata: {
        stripeEventId: event.id,
        stripePaymentIntentId: paymentIntent.id,
        stripeAccount: event.account,
        livemode: event.livemode,
      },
    });
  } catch (error) {
    const status = typeof error === 'object' && error && 'status' in error
      ? Number((error as { status?: number }).status) || 500
      : 500;
    const code = typeof error === 'object' && error && 'code' in error
      ? String((error as { code?: string }).code ?? 'stripe_payment_processing_failed')
      : 'stripe_payment_processing_failed';
    return NextResponse.json({ error: { code } }, { status });
  }

  return NextResponse.json({ received: true });
}
