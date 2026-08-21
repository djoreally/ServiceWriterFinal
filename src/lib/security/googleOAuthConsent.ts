const GOOGLE_OAUTH_CONSENT_COOKIE = 'google_oauth_consent_prompted';
const GOOGLE_OAUTH_CONSENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export function hasGoogleOAuthConsentCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie
    .split('; ')
    .some((cookie) => cookie.startsWith(`${GOOGLE_OAUTH_CONSENT_COOKIE}=`));
}

export function markGoogleOAuthConsentPrompted(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${GOOGLE_OAUTH_CONSENT_COOKIE}=1; path=/; max-age=${GOOGLE_OAUTH_CONSENT_COOKIE_MAX_AGE}; SameSite=Lax`;
}
