/**
 * useFeeSettings — fetches the current business's fee + tax settings once
 * per session and caches them in module scope. Powers the canonical
 * appointment total displayed across every card, list, and dialog.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AppointmentFeeSettings } from "@/lib/appointmentTotal";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
let cached: AppointmentFeeSettings | null = null;
let inflight: Promise<AppointmentFeeSettings | null> | null = null;

async function loadFeeSettings(): Promise<AppointmentFeeSettings | null> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    const { data: { user } } = await getCurrentAuthUser();
    if (!user) return null;

    const { data } = await supabase
      .from("business_profiles")
      .select(
        "waste_oil_fee_enabled, waste_oil_fee, shop_fee_enabled, shop_fee_type, shop_fee_value, surcharge_enabled, surcharge_type, surcharge_value, tax_rate",
      )
      .eq("user_id", user.id)
      .maybeSingle();

    cached = (data ?? null) as AppointmentFeeSettings | null;
    return cached;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/** Reset the module cache (call after the user updates fee settings). */
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
      setFeeSettings(cached);
      setLoading(false);
      return;
    }
    loadFeeSettings()
      .then((s) => {
        if (active) {
          setFeeSettings(s);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { feeSettings, loading };
}
