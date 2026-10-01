/**
 * Voice Agent Query Layer — read-only helpers for ElevenLabs voice agents
 * (public widget presence check + owner settings fetch).
 */
import { apiClient, ApiClientError } from "@/lib/api-client";

/** Public: does this booking slug have a voice agent configured? */
export async function checkHasVoiceAgent(slug: string): Promise<boolean> {
  try {
    const { data } = await apiClient.get<{ data: boolean }>("/v1/voice-agent/has", {
      query: { slug },
    });
    return Boolean(data);
  } catch (error) {
    console.warn("[voice-agent] presence check failed:", error instanceof Error ? error.message : error);
    return false;
  }
}

/** Owner: fetch the currently-configured ElevenLabs agent id. */
export async function fetchVoiceAgentSettings(): Promise<{ agentId: string | null } | null> {
  try {
    const { data } = await apiClient.get<{ data: { agentId: string | null } }>("/v1/voice-agent/settings");
    return { agentId: data?.agentId ?? null };
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) return null;
    throw error;
  }
}
