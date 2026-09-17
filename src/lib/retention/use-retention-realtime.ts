/** Realtime invalidation for retention and canonical loyalty data. */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";

const USER_TABLE_QUERY_KEYS: Record<string, string[]> = {
  automation_rules: ["automation-rules"],
  retention_signals: ["retention-grouped-signals", "retention-signals", "retention-impact-stats"],
  job_queue: ["job-queue-recent", "job-queue-health"],
};
const WORKSPACE_TABLE_QUERY_KEYS: Record<string, string[]> = {
  crm_loyalty_programs: ["loyalty-programs", "loyalty-account-stats"],
  crm_loyalty_rewards: ["loyalty-rewards"],
  crm_loyalty_accounts: ["loyalty-account-stats"],
  crm_loyalty_ledger: ["loyalty-account-stats"],
};

export function useRetentionRealtime(userId: string | undefined): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const workspaceId = getSelectedWorkspaceId();
    const channel = supabase.channel(`retention-engine-${userId}-${workspaceId ?? "none"}`);
    const attach = (table: string, keys: string[], filter: string) => {
      (channel as unknown as { on: (event: string, filter: Record<string, string>, cb: () => void) => unknown }).on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter },
        () => { for (const key of keys) queryClient.invalidateQueries({ queryKey: [key, userId] }); },
      );
    };
    for (const [table, keys] of Object.entries(USER_TABLE_QUERY_KEYS)) attach(table, keys, `user_id=eq.${userId}`);
    if (workspaceId) for (const [table, keys] of Object.entries(WORKSPACE_TABLE_QUERY_KEYS)) attach(table, keys, `workspace_id=eq.${workspaceId}`);
    channel.subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId, queryClient]);
}
