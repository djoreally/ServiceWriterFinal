/**
 * useRetentionRealtime — subscribes to all retention-related Supabase channels
 * for a given user and invalidates the matching React Query keys on any change.
 *
 * One mount on the RetentionEngine page wires all six channels.
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const TABLE_QUERY_KEYS: Record<string, string[]> = {
  loyalty_programs: "loyalty-programs loyalty-account-stats".split(" "),
  loyalty_rewards: ["loyalty-rewards"],
  loyalty_accounts: ["loyalty-account-stats"],
  automation_rules: ["automation-rules"],
  retention_signals: ["retention-grouped-signals", "retention-signals", "retention-impact-stats"],
  job_queue: ["job-queue-recent", "job-queue-health"],
};

export function useRetentionRealtime(userId: string | undefined): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const channel = supabase.channel(`retention-engine-${userId}`);

    for (const [table, keys] of Object.entries(TABLE_QUERY_KEYS)) {
      // Cast through unknown — Supabase realtime typings for postgres_changes are loose
      (channel as unknown as {
        on: (event: string, filter: Record<string, string>, cb: () => void) => unknown;
      }).on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `user_id=eq.${userId}`,
        },
        () => {
          for (const key of keys) {
            queryClient.invalidateQueries({ queryKey: [key, userId] });
          }
        },
      );
    }

    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);
}
