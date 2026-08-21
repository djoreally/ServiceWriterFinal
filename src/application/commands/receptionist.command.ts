/**
 * Receptionist Commands — configure and provision, update its voice/prompt, and deprovision it.
 * Thin wrappers over `receptionist-*` edge functions.
 */
import { supabase } from "@/integrations/supabase/client";

async function invoke<T>(fn: string, body?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw error;
  const payload = (data ?? {}) as { error?: string } & T;
  if (payload && "error" in payload && payload.error) throw new Error(payload.error);
  return payload as T;
}

export interface ReceptionistUpdatePayload {
  voiceId: string;
  firstMessage: string;
  systemPrompt: string;
}

export async function updateReceptionistConfig(payload: ReceptionistUpdatePayload): Promise<void> {
  await invoke("receptionist-update", payload as unknown as Record<string, unknown>);
}

export async function deprovisionReceptionist(): Promise<void> {
  await invoke("receptionist-deprovision", {});
}

export interface ReceptionistHealth {
  healthy: boolean;
  state: "ready" | "not_provisioned" | "provider_not_configured" | "needs_attention" | "check_failed";
  checks?: { agent: boolean; phone: boolean; tool: boolean };
  booking_slug?: boolean;
}

export async function checkReceptionistHealth(): Promise<ReceptionistHealth> {
  return invoke<ReceptionistHealth>("receptionist-health", {});
}
