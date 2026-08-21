/**
 * GDPR Consent Management
 *
 * Tracks user consent for data processing categories.
 * Stored in localStorage with timestamp for audit trail.
 *
 * Categories:
 * - necessary: Always required (auth, session, core functionality)
 * - analytics: Usage analytics and error tracking (PostHog, Sentry)
 * - marketing: Email marketing, campaigns, promotional communications
 * - integrations: Third-party integrations (QuickBooks, Google Calendar)
 */

export type ConsentCategory = 'necessary' | 'analytics' | 'marketing' | 'integrations';

export interface ConsentRecord {
  categories: Record<ConsentCategory, boolean>;
  timestamp: string;
  version: string;
}

const CONSENT_KEY = 'gdpr_consent';
const CONSENT_VERSION = '1.0'; // Bump when policy changes to force re-consent
const CONSENT_COOKIE = 'gdpr_consent_set';
const CONSENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function setConsentCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${CONSENT_COOKIE}=1; path=/; max-age=${CONSENT_COOKIE_MAX_AGE}; SameSite=Lax`;
}

function hasConsentCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split('; ').some((cookie) => cookie.startsWith(`${CONSENT_COOKIE}=`));
}

export function getConsent(): ConsentRecord | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) {
      return hasConsentCookie()
        ? {
            categories: {
              necessary: true,
              analytics: false,
              marketing: false,
              integrations: false,
            },
            timestamp: new Date(0).toISOString(),
            version: CONSENT_VERSION,
          }
        : null;
    }
    const record: ConsentRecord = JSON.parse(raw);
    // Re-consent if policy version changed
    if (record.version !== CONSENT_VERSION) return null;
    return record;
  } catch {
    return null;
  }
}

export function saveConsent(categories: Record<ConsentCategory, boolean>): void {
  const record: ConsentRecord = {
    categories,
    timestamp: new Date().toISOString(),
    version: CONSENT_VERSION,
  };
  localStorage.setItem(CONSENT_KEY, JSON.stringify(record));
  setConsentCookie();
}

export function hasConsent(category: ConsentCategory): boolean {
  const record = getConsent();
  if (!record) return category === 'necessary';
  return record.categories[category] ?? false;
}

export function revokeConsent(): void {
  localStorage.removeItem(CONSENT_KEY);
  if (typeof document !== 'undefined') {
    document.cookie = `${CONSENT_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  }
}

export function acceptAllConsent(): void {
  saveConsent({
    necessary: true,
    analytics: true,
    marketing: true,
    integrations: true,
  });
}

export function acceptNecessaryOnly(): void {
  saveConsent({
    necessary: true,
    analytics: false,
    marketing: false,
    integrations: false,
  });
}

// Helper to get category information
export interface ConsentCategoryInfo {
  id: ConsentCategory;
  name: string;
  description: string;
  required: boolean;
  examples: string[];
}

export function getConsentCategoryInfo(): ConsentCategoryInfo[] {
  return [
    {
      id: 'necessary',
      name: 'Essential',
      description: 'Required for the platform to function. Cannot be disabled.',
      required: true,
      examples: ['Authentication', 'Session management', 'Security', 'Core features'],
    },
    {
      id: 'analytics',
      name: 'Analytics',
      description: 'Help us understand how you use the platform to improve your experience.',
      required: false,
      examples: ['Usage analytics (PostHog)', 'Error tracking (Sentry)', 'Performance monitoring'],
    },
    {
      id: 'marketing',
      name: 'Marketing',
      description: 'Receive updates about new features, tips, and promotional offers.',
      required: false,
      examples: ['Email campaigns', 'Feature announcements', 'Product updates'],
    },
    {
      id: 'integrations',
      name: 'Third-Party Integrations',
      description: 'Enable connections to external services like accounting and calendar apps.',
      required: false,
      examples: ['QuickBooks sync', 'Google Calendar', 'Payment processors'],
    },
  ];
}
