/**
 * Isolated, fail-soft realtime subscription for the assets table.
 * - Subscribes only when userId is known.
 * - Caps reconnect attempts.
 * - Channel errors are non-fatal (logged, then the hook gives up silently).
 */

import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logAssetEvent } from "@/lib/assets/logger";

const MAX_RECONNECTS = 3;

export function useAssetsRealtime(
  userId: string | null | undefined,
  onChange: () => void,
) {
  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    let attempts = 0;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const subscribe = () => {
      if (cancelled) return;
      try {
        channel = supabase
          .channel(`assets:${userId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "assets",
              filter: `user_id=eq.${userId}`,
            },
            () => {
              try {
                onChange();
              } catch {
                /* swallow consumer errors */
              }
            },
          )
          .subscribe((status) => {
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
              logAssetEvent("realtime_error", { status, attempts });
              if (attempts < MAX_RECONNECTS && !cancelled) {
                attempts += 1;
                const backoff = Math.min(1000 * 2 ** attempts, 8000);
                reconnectTimer = setTimeout(() => {
                  if (channel) {
                    void supabase.removeChannel(channel).catch(() => {});
                    channel = null;
                  }
                  subscribe();
                }, backoff);
              }
            }
          });
      } catch (e) {
        logAssetEvent("realtime_error", {
          reason: (e as Error)?.message || "subscribe_threw",
        });
      }
    };

    subscribe();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (channel) {
        void supabase.removeChannel(channel).catch(() => {});
      }
    };
  }, [userId, onChange]);
}
