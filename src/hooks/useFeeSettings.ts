/**
 * useFeeSettings — canonical fee/tax settings for the active workspace.
 */
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import type { AppointmentFeeSettings } from "@/lib/appointmentTotal";

let cached: AppointmentFeeSettings | null = null;
let inflight: Promise<AppointmentFeeSettings | null> | null = null;

async function loadFeeSettings(): Promise<AppointmentFeeSettings | null> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    // The Hono endpoint resolves the workspace server-side from the auth
    // token and returns the raw workspace_settings row.
    const { data } = await apiClient.get<{
      data: { settingsRow: Record<string, unknown> | null };
    }>("/v1/billing/payment-settings");
    cached = (data?.settingsRow ?? null) as AppointmentFeeSettings | null;
    return cached;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export function resetFeeSettingsCache() {
  cached = null;
  inflight = null;
}

export function useFeeSettings() {
  const [feeSettings, setFeeSettings] = useState<AppointmentFeeSettings | null>(cached);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let active = true;
    if (cached) {
      void Promise.resolve().then(() => setFeeSettings(cached));
      void Promise.resolve().then(() => setLoading(false));
      return;
    }
    void Promise.resolve().then(() => loadFeeSettings()
      .then((settings) => {
        if (active) {
          setFeeSettings(settings);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      }));
    return () => { active = false; };
  }, []);

  return { feeSettings, loading };
}
