/**
 * Agent API key commands (create / revoke).
 *
 * Writes go through the typed API client (`@/lib/api-client`) to the key
 * management routes in `src/server/hono/routes/agent-api.ts`. The create
 * response is the ONLY time the raw key exists outside the caller's own
 * client: the server stores just its SHA-256 hash. Callers must show the
 * raw key once and then drop it — never persist it.
 */
import { apiClient } from "@/lib/api-client";
import type { AgentApiKeyRecord, CreatedAgentApiKey } from "@/lib/agentApiKeys";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface CreateAgentApiKeyInput {
  name: string;
  integrator: string;
  scopes: readonly string[];
}

export async function createAgentApiKey(input: CreateAgentApiKeyInput): Promise<CreatedAgentApiKey> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Select a workspace before creating an API key.");
  const response = await apiClient.post<{ data: CreatedAgentApiKey }>("/v1/agent/keys", {
    workspace_id: context.workspaceId,
    name: input.name.trim(),
    integrator: input.integrator.trim(),
    scopes: [...input.scopes],
  });
  return response.data;
}

export async function revokeAgentApiKey(keyId: string): Promise<AgentApiKeyRecord> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Select a workspace before revoking an API key.");
  const response = await apiClient.delete<{ data: AgentApiKeyRecord }>(
    `/v1/agent/keys/${encodeURIComponent(keyId)}`,
    { query: { workspace_id: context.workspaceId } },
  );
  return response.data;
}
