/**
 * AI Session Query - Get auth session for AI assistant communication.
 */
import { supabase } from "@/integrations/supabase/client";

/** Get the current session access token. */
export async function getSessionToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

/** Transcribe audio via Edge Function. */
export async function transcribeAudio(audio: string, mimeType: string): Promise<{ text?: string; transcript?: string }> {
  const { data, error } = await supabase.functions.invoke("transcribe-audio", {
    body: { audio, mimeType },
  });
  if (error) throw error;
  return data as { text?: string; transcript?: string };
}

export interface AiAgentRow {
  slug: string;
  name: string;
  role: string;
  avatar: string | null;
  color: string | null;
  display_order: number;
}

/** List active AI copilot agents in display order. */
export async function fetchActiveAiAgents(): Promise<AiAgentRow[]> {
  const { data, error } = await supabase
    .from("ai_agents")
    .select("slug,name,role,avatar,color,display_order")
    .eq("is_active", true)
    .order("display_order");
  if (error) throw error;
  return (data ?? []) as unknown as AiAgentRow[];
}


