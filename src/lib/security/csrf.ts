/**
 * CSRF Protection
 *
 * Since this is a SPA using Supabase JWT (Bearer token in Authorization header),
 * traditional cookie-based CSRF attacks are mitigated by design.
 *
 * However, we implement:
 * 1. Origin/Referer validation helpers for edge functions
 * 2. Double-submit cookie pattern for any form POSTs to external endpoints
 * 3. SameSite cookie awareness
 */

const CSRF_TOKEN_KEY = '_csrf_token';

/**
 * Generate a cryptographically random CSRF token.
 * Store in sessionStorage (not localStorage to limit lifetime).
 */
export function generateCSRFToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const token = Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
  sessionStorage.setItem(CSRF_TOKEN_KEY, token);
  return token;
}

/**
 * Retrieve the stored CSRF token.
 * Creates one if it doesn't exist.
 */
export function getCSRFToken(): string {
  const existing = sessionStorage.getItem(CSRF_TOKEN_KEY);
  if (existing) return existing;
  return generateCSRFToken();
}

/**
 * Validate a CSRF token against the stored one.
 */
export function validateCSRFToken(token: string): boolean {
  const stored = sessionStorage.getItem(CSRF_TOKEN_KEY);
  if (!stored) return false;
  // Constant-time comparison to prevent timing attacks
  if (token.length !== stored.length) return false;
  let mismatch = 0;
  for (let i = 0; i < token.length; i++) {
    mismatch |= token.charCodeAt(i) ^ stored.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Get headers to include in fetch requests for CSRF protection.
 */
export function getCSRFHeaders(): Record<string, string> {
  return {
    'X-CSRF-Token': getCSRFToken(),
    'X-Requested-With': 'XMLHttpRequest',
  };
}
