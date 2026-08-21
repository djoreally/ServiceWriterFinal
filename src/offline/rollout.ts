import { supabase } from '@/integrations/supabase/client';
import { features } from '@/config/features';

import { getCurrentAuthUser } from "@/lib/auth/current-user";
let currentOfflineTenantSlug: string | null = null;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function setCurrentOfflineTenantSlug(slug?: string | null): void {
  currentOfflineTenantSlug = slug ? normalize(slug) : null;
}

export function getOfflineEngineAllowlist(): string[] {
  const raw = features['offline-engine-allowlist'];
  if (!raw) return [];

  return raw.split(',').map(normalize).filter(Boolean);
}

export function getOfflinePilotTenantAllowlist(): string[] {
  const raw = features['offline-pilot-tenants'];
  if (!raw) return [];

  return raw.split(',').map(normalize).filter(Boolean);
}

// Canonical base gate for offline capability only (engine + kill-switch).
// Use this for cheap preflight checks. Do not treat this as current-user eligibility.
export function isOfflineEligibilityConfigured(): boolean {
  if (!features['offline-engine']) {
    return false;
  }

  if (features['offline-kill-switch']) {
    return false;
  }

  return true;
}

// Canonical current-user enrollment rule. This is the authoritative gate for
// user-facing offline behavior (queue/dashboard/read fallbacks/mutations).
export function isOfflineEligibleForUser(userId?: string | null): boolean {
  if (!isOfflineEligibilityConfigured()) {
    return false;
  }

  const pilotTenants = getOfflinePilotTenantAllowlist();
  if (pilotTenants.length > 0) {
    if (!currentOfflineTenantSlug || !pilotTenants.includes(currentOfflineTenantSlug)) {
      return false;
    }
  }

  const allowlist = getOfflineEngineAllowlist();
  if (allowlist.length === 0) {
    return true;
  }

  if (!userId) {
    return false;
  }

  return allowlist.includes(normalize(userId));
}

// Canonical offline eligibility rule for the currently authenticated user.
// Offline is a baseline platform capability for every authenticated plan; this
// check intentionally does not gate on has_pwa_offline so all paid plans can use
// queueing, local snapshots, and reconnect sync.
export async function isOfflineEligibleForCurrentUser(): Promise<boolean> {
  const { data, error } = await getCurrentAuthUser();
  if (error) {
    return false;
  }

  const userId = data.user?.id;
  if (!userId) return false;

  return isOfflineEligibleForUser(userId);
}
