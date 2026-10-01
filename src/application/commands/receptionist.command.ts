/**
 * Receptionist Commands — configure and provision, update its voice/prompt, and deprovision it.
 * Thin wrappers over the receptionist API endpoints.
 */
import { apiClient } from "@/lib/api-client";

export interface ReceptionistUpdatePayload {
  voiceId: string;
  firstMessage: string;
  systemPrompt: string;
}

export async function updateReceptionistConfig(payload: ReceptionistUpdatePayload): Promise<void> {
  await apiClient.post("/v1/crm/receptionist/config", {
    voiceId: payload.voiceId,
    firstMessage: payload.firstMessage,
    systemPrompt: payload.systemPrompt,
  });
}

export async function deprovisionReceptionist(): Promise<void> {
  await apiClient.post("/v1/crm/receptionist/deprovision", {});
}

export interface ReceptionistHealth {
  healthy: boolean;
  state: "ready" | "not_provisioned" | "provider_not_configured" | "needs_attention" | "check_failed";
  checks?: { agent: boolean; phone: boolean; tool: boolean };
  booking_slug?: boolean;
}

export async function checkReceptionistHealth(): Promise<ReceptionistHealth> {
  const { data } = await apiClient.get<{ data: ReceptionistHealth }>("/v1/crm/receptionist/health");
  return data;
}
