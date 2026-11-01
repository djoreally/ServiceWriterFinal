/**
 * Legal document versions.
 *
 * The version strings are the effective dates printed at the top of the
 * public legal pages (`src/legacy-pages/legal/TermsOfServicePage.tsx`,
 * `src/legacy-pages/legal/PrivacyPolicyPage.tsx`). Self-serve signup
 * records a timestamped acceptance of exactly these versions (P0-5);
 * when a legal page's effective date changes, bump the matching string
 * here so new signups accept — and are recorded against — the new text.
 */
export const TERMS_OF_SERVICE_VERSION = "2026-04-05";
export const PRIVACY_POLICY_VERSION = "2026-04-05";

export const TERMS_OF_SERVICE_PATH = "/terms";
export const PRIVACY_POLICY_PATH = "/privacy-policy";
