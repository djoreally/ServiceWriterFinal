/**
 * AI Session Query - Get auth session for AI assistant communication.
 */
import { apiClient } from "@/lib/api-client";
import { supabase } from "@/integrations/supabase/client";

/** Get the current session access token. */
export async function getSessionToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

/** Transcribe audio via Edge Function. */
export async function transcribeAudio(audio: string, mimeType: string): Promise<{ text?: string; transcript?: string }> {
  return apiClient.post("/v1/platform/ai/transcribe", { audio, mimeType });
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
  return apiClient.get("/v1/platform/ai/agents");
}
