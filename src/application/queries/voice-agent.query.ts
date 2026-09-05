/**
 * Voice Agent Query Layer — canonical workspace-backed ElevenLabs settings.
 */
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/** Public: does this booking slug have a voice agent configured? */
export async function checkHasVoiceAgent(slug: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("public_has_voice_agent", {
    booking_slug_param: slug,
  });
  if (error) {
    console.warn("[voice-agent] presence check failed:", error.message);
    return false;
  }
  return Boolean(data);
}

/** Owner: fetch the currently-configured ElevenLabs agent id. */
export async function fetchVoiceAgentSettings(): Promise<{ agentId: string | null } | null> {
  const context = await resolveCurrentWorkspace();
  if (!context) return null;

  const { data, error } = await (supabase as any)
    .from("workspace_settings")
    .select("operational_settings")
    .eq("workspace_id", context.workspaceId)
    .maybeSingle();
  if (error) throw error;

  const operational = object(data?.operational_settings);
  const voiceAgent = object(operational.voice_agent);
  return {
    agentId: typeof voiceAgent.elevenlabs_agent_id === "string"
      ? voiceAgent.elevenlabs_agent_id
      : null,
  };
}
