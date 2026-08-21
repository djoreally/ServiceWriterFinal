/**
 * Content Security Policy (CSP) configuration
 *
 * CSP is primarily enforced via HTTP headers (set in vercel.json / edge functions).
 * This module documents the policy and provides the meta tag fallback for dev.
 *
 * Production CSP is set via vercel.json headers.
 * See: https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
 */

export const CSP_REPORTING_GROUP = 'posthog-csp';
export const CSP_REPORTING_ENDPOINT =
  'https://us.i.posthog.com/report/?token=phc_Jwkv5QTiA8Q1rNDQRonL2bMGAT6W0F84ZTFVQx0yAEU&v=1&sample_rate=1';

export const CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'",
    "'unsafe-inline'", // Required for Vite HMR in dev; tighten in prod with nonces
    'https://js.stripe.com',
    'https://www.googletagmanager.com',
    'https://o4509727178817536.ingest.us.sentry.io',
    'https://www.googletagmanager.com',
    'https://www.google-analytics.com',
  ],
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  'img-src': ["'self'", 'data:', 'https:', 'blob:'],
  'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
  'connect-src': [
    "'self'",
    'https://*.supabase.co',
    'wss://*.supabase.co',
    'https://api.stripe.com',
    'https://o4509727178817536.ingest.us.sentry.io',
    'https://api.ipify.org',
    'https://maps.googleapis.com',
    'https://api.mapbox.com',
    'https://events.mapbox.com',
    'https://www.google-analytics.com',
    'https://region1.google-analytics.com',
    'https://us.i.posthog.com',
    'https://us.posthog.com',
    'https://www.googletagmanager.com',
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
  ],
  'frame-src': ["'self'", 'https://js.stripe.com', 'https://hooks.stripe.com'],
  'worker-src': ["'self'", 'blob:'],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'report-uri': [CSP_REPORTING_ENDPOINT],
  'report-to': [CSP_REPORTING_GROUP],
  'upgrade-insecure-requests': [],
} as const;

/**
 * Build a CSP string from the directives above.
 */
export function buildCSP(): string {
  return Object.entries(CSP_DIRECTIVES)
    .map(([key, values]) =>
      values.length > 0 ? `${key} ${(values as unknown as string[]).join(' ')}` : key
    )
    .join('; ');
}
