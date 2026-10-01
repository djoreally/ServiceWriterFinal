/**
 * Voice Agent Commands — update owner settings + invoke ElevenLabs
 * booking tools / token vending edge functions.
 */
import { apiClient } from "@/lib/api-client";

export async function updateVoiceAgentSettings(params: {
  enabled: boolean;
  agentId: string;
}): Promise<void> {
  await apiClient.put("/v1/voice-agent/settings", {
    enabled: params.enabled,
    agentId: params.agentId,
  });
}

export interface VoiceBookingToolResult {
  data: unknown;
  error: { message: string } | null;
}

/** Invoke the elevenlabs-booking-tools edge function for the given tool. */
export async function invokeVoiceBookingTool(params: {
  slug: string;
  tool: "get_services" | "check_availability" | "book_appointment" | "create_service_request" | "get_shop_info";
  params?: Record<string, unknown>;
}): Promise<VoiceBookingToolResult> {
  try {
    const { data } = await apiClient.post<{ data: unknown; error: null }>(
      "/v1/voice-agent/booking-tools",
      { slug: params.slug, tool: params.tool, params: params.params },
    );
    return { data: data ?? null, error: null };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : "Voice booking tool failed" } };
  }
}

export interface VoiceTokenResponse {
  token?: string;
  business_name?: string;
  error?: string;
}

/** Mint an ElevenLabs WebRTC conversation token for a public booking slug. */
export async function fetchVoiceConversationToken(slug: string): Promise<VoiceTokenResponse> {
  const { data } = await apiClient.post<{ data: VoiceTokenResponse | null; error: null }>(
    "/v1/voice-agent/conversation-token",
    { slug },
  );
  return (data ?? {}) as VoiceTokenResponse;
}
