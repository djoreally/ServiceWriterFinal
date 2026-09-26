import 'server-only';

import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

export function getStripeClient() {
  if (stripeClient) return stripeClient;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw Object.assign(new Error('Stripe server credentials are not configured'), {
      status: 503,
      code: 'stripe_not_configured',
    });
  }

  stripeClient = new Stripe(secretKey, {
    typescript: true,
    appInfo: {
      name: 'Service Writer',
      version: '0.1.0',
    },
  });
  return stripeClient;
}

export function getStripeWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw Object.assign(new Error('Stripe webhook verification is not configured'), {
      status: 503,
      code: 'stripe_webhook_not_configured',
    });
  }
  return secret;
}
