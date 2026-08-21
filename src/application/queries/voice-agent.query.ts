/**
 * Voice Agent Query Layer — read-only helpers for ElevenLabs voice agents
 * (public widget presence check + owner settings fetch).
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
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
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("business_profiles")
    .select("elevenlabs_agent_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return { agentId: (data?.elevenlabs_agent_id as string | null) ?? null };
}
