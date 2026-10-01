import { apiClient } from "@/lib/api-client";
import type { TireServicePricingRule } from "@/lib/tire-pricing";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export async function saveTireServicePricingRule(rule: TireServicePricingRule) {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Select a workspace before saving tire pricing.");

  await apiClient.put("/v1/tire-pricing/rules", {
    rule,
    selected_workspace_id: context.workspaceId,
  });
}
