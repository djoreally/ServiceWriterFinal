/**
 * useFeeSettings — canonical fee/tax settings for the active workspace.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AppointmentFeeSettings } from "@/lib/appointmentTotal";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

let cached: AppointmentFeeSettings | null = null;
let inflight: Promise<AppointmentFeeSettings | null> | null = null;

async function loadFeeSettings(): Promise<AppointmentFeeSettings | null> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    const context = await resolveCurrentWorkspace();
    if (!context) return null;

    const { data, error } = await (supabase as any)
      .from("workspace_settings")
      .select("waste_oil_fee_enabled, waste_oil_fee, shop_fee_enabled, shop_fee_type, shop_fee_value, surcharge_enabled, surcharge_type, surcharge_value, tax_rate")
      .eq("workspace_id", context.workspaceId)
      .maybeSingle();

    if (error) throw error;
    cached = (data ?? null) as AppointmentFeeSettings | null;
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
