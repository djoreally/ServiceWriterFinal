import { Q } from '@nozbe/watermelondb';
import { features } from '@/config/features';
import { getOfflineDatabase } from './database';
import { isOfflineEligibilityConfigured } from './rollout';

export interface OfflineObservabilitySnapshot {
  pending: number;
  failed: number;
  deadLetter: number;
  synced: number;
  oldestPendingAgeMs: number;
}

interface SentryClientLike {
  captureMessage?: (message: string, context: {
    level: string;
    extra: Record<string, unknown>;
    tags: Record<string, string>;
  }) => void;
}

interface PosthogClientLike {
  capture?: (event: string, properties: Record<string, unknown>) => void;
}

function asNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function emitMonitoringEvent(
  type: 'offline_outbox_depth_threshold' | 'offline_dead_letter_detected',
  payload: Record<string, unknown>,
): void {
  if (typeof window === 'undefined') return;

  // Browser event hook for custom monitoring adapters.
  window.dispatchEvent(new CustomEvent('offline-monitoring-alert', {
    detail: { type, ...payload },
  }));

  const sentry = (window as unknown as { Sentry?: SentryClientLike }).Sentry;
  if (sentry?.captureMessage) {
    // Shadow Data Audit Finding #11: Sanitize payload before sending to Sentry
    // Only send numeric/safe fields — strip any string values that could contain PII
    const sanitizedPayload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (typeof value === 'number' || typeof value === 'boolean') {
        sanitizedPayload[key] = value;
      } else if (typeof value === 'object' && value !== null) {
        // For nested objects like snapshot, only include numeric fields
        const nested: Record<string, unknown> = {};
        for (const [nk, nv] of Object.entries(value as Record<string, unknown>)) {
          if (typeof nv === 'number' || typeof nv === 'boolean') {
            nested[nk] = nv;
          }
        }
        sanitizedPayload[key] = nested;
      } else {
        sanitizedPayload[key] = '[REDACTED]';
      }
    }
    sentry.captureMessage(`[offline][alert] ${type}`, {
      level: 'warning',
      extra: sanitizedPayload,
      tags: { area: 'offline' },
    });
  }

  const posthog = (window as unknown as { posthog?: PosthogClientLike }).posthog;
  if (posthog?.capture) {
    // Shadow Data Audit: Only send numeric/safe fields to PostHog — no PII
    const safePayload: Record<string, unknown> = { alert_type: type };
    for (const [key, value] of Object.entries(payload)) {
      if (typeof value === 'number' || typeof value === 'boolean') {
        safePayload[key] = value;
      }
    }
    posthog.capture('offline_monitoring_alert', safePayload);
  }
}

export async function getOfflineObservabilitySnapshot(): Promise<OfflineObservabilitySnapshot> {
  if (!isOfflineEligibilityConfigured()) {
    return { pending: 0, failed: 0, deadLetter: 0, synced: 0, oldestPendingAgeMs: 0 };
  }

  const database = getOfflineDatabase();
  if (!database) {
    return { pending: 0, failed: 0, deadLetter: 0, synced: 0, oldestPendingAgeMs: 0 };
  }

  const rows = await database.get('offline_outbox').query().fetch();
  const now = Date.now();
  const statusOf = (row: (typeof rows)[number]): unknown => Reflect.get(row._raw, 'status');

  const pending = rows.filter((row) => statusOf(row) === 'pending').length;
  const failed = rows.filter((row) => statusOf(row) === 'failed').length;
  const deadLetter = rows.filter((row) => statusOf(row) === 'dead_letter').length;
  const synced = rows.filter((row) => statusOf(row) === 'synced').length;

  const pendingCreatedAt = rows
    .filter((row) => statusOf(row) === 'pending' || statusOf(row) === 'failed')
    .map((row) => asNumber(Reflect.get(row._raw, 'created_at')))
    .filter((value: number) => value > 0)
    .sort((a, b) => a - b);

  const oldestPendingAgeMs = pendingCreatedAt.length > 0 ? Math.max(0, now - pendingCreatedAt[0]) : 0;

  return {
    pending,
    failed,
    deadLetter,
    synced,
    oldestPendingAgeMs,
  };
}

export async function emitOfflineObservability(reason: 'outbox_tick' | 'pull_sync'): Promise<void> {
  if (!isOfflineEligibilityConfigured()) {
    return;
  }

  const snapshot = await getOfflineObservabilitySnapshot();
  const threshold = features['offline-alert-outbox-depth'];

  if (snapshot.pending + snapshot.failed >= threshold) {
    const payload = {
      reason,
      threshold,
      snapshot,
    };
    console.warn('[offline][alert] outbox depth threshold exceeded', payload);
    emitMonitoringEvent('offline_outbox_depth_threshold', payload);
  }

  if (snapshot.deadLetter > 0) {
    const payload = {
      reason,
      snapshot,
    };
    console.warn('[offline][alert] dead-letter records detected', payload);
    emitMonitoringEvent('offline_dead_letter_detected', payload);
  }

  console.info('[offline][metrics]', {
    reason,
    ...snapshot,
  });
}

export async function getSyncCursorSnapshot(): Promise<Record<string, string | null>> {
  if (!isOfflineEligibilityConfigured()) {
    return {};
  }

  const database = getOfflineDatabase();
  if (!database) {
    return {};
  }

  const rows = await database.get('offline_sync_state').query(Q.sortBy('updated_at', Q.desc)).fetch();
  const result: Record<string, string | null> = {};

  for (const row of rows) {
    const entity: unknown = Reflect.get(row._raw, 'entity');
    const cursor: unknown = Reflect.get(row._raw, 'cursor');
    if (typeof entity === 'string') {
      result[entity] = typeof cursor === 'string' ? cursor : null;
    }
  }

  return result;
}
