/**
 * Voice Agent Commands — canonical workspace settings + ElevenLabs provider calls.
 */
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function updateVoiceAgentSettings(params: {
  enabled: boolean;
  agentId: string;
}): Promise<void> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Not authenticated");

  const { data: current, error: readError } = await (supabase as any)
    .from("workspace_settings")
    .select("operational_settings")
    .eq("workspace_id", context.workspaceId)
    .maybeSingle();
  if (readError) throw readError;

  const operational = object(current?.operational_settings);
  const voiceAgent = object(operational.voice_agent);
  const nextOperational = {
    ...operational,
    voice_agent: {
      ...voiceAgent,
      elevenlabs_agent_id: params.enabled ? (params.agentId || null) : null,
      enabled: params.enabled,
    },
  };

  const { error } = await (supabase as any)
    .from("workspace_settings")
    .update({ operational_settings: nextOperational })
    .eq("workspace_id", context.workspaceId);
  if (error) throw error;
}

export interface VoiceBookingToolResult {
  data: unknown;
  error: { message: string } | null;
}

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

export async function fetchVoiceConversationToken(slug: string): Promise<VoiceTokenResponse> {
  const { data, error } = await supabase.functions.invoke("elevenlabs-voice-token", {
    body: { slug },
  });
  if (error) throw new Error(error.message || "Failed to get voice token");
  return (data ?? {}) as VoiceTokenResponse;
}
