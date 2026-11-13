/**
 * Agent API key queries.
 *
 * Reads go through the typed API client (`@/lib/api-client`) to the key
 * management routes in `src/server/hono/routes/agent-api.ts`. Those routes
 * require a staff session with a workspace owner/admin role in the
 * workspace being read; the server answers with its own error message when
 * the caller may not manage keys, and this layer lets that error surface.
 */
import { apiClient } from "@/lib/api-client";
import type { AgentApiKeyRecord } from "@/lib/agentApiKeys";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface AgentApiKeyList {
  workspaceId: string;
  keys: AgentApiKeyRecord[];
}

export async function fetchAgentApiKeys(): Promise<AgentApiKeyList> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Select a workspace before managing API keys.");
  const response = await apiClient.get<{ data: AgentApiKeyRecord[] }>("/v1/agent/keys", {
    query: { workspace_id: context.workspaceId },
  });
  return { workspaceId: context.workspaceId, keys: response.data ?? [] };
}
