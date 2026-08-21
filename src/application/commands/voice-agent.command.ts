/**
 * Voice Agent Commands — update owner settings + invoke ElevenLabs
 * booking tools / token vending edge functions.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export async function updateVoiceAgentSettings(params: {
  enabled: boolean;
  agentId: string;
}): Promise<void> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  const nextValue = params.enabled ? (params.agentId || null) : null;
  const { error } = await supabase
    .from("business_profiles")
    .update({ elevenlabs_agent_id: nextValue })
    .eq("user_id", user.id);
  if (error) throw error;
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
  const { data, error } = await supabase.functions.invoke("elevenlabs-booking-tools", {
    body: { tool: params.tool, slug: params.slug, params: params.params },
  });
  return { data: data ?? null, error: error ? { message: error.message } : null };
}

export interface VoiceTokenResponse {
  token?: string;
  business_name?: string;
  error?: string;
}

/** Mint an ElevenLabs WebRTC conversation token for a public booking slug. */
export async function fetchVoiceConversationToken(slug: string): Promise<VoiceTokenResponse> {
  const { data, error } = await supabase.functions.invoke("elevenlabs-voice-token", {
    body: { slug },
  });
  if (error) throw new Error(error.message || "Failed to get voice token");
  return (data ?? {}) as VoiceTokenResponse;
}
