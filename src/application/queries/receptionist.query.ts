/** Receptionist Query Layer — canonical workspace-backed AI receptionist settings. */
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface ReceptionistProfile {
  user_id: string;
  business_name: string | null;
  elevenlabs_agent_id: string | null;
  receptionist_phone_number: string | null;
  receptionist_phone_number_id: string | null;
  receptionist_voice_id: string | null;
  receptionist_system_prompt: string | null;
  receptionist_first_message: string | null;
  receptionist_status: string | null;
  receptionist_provisioned_at: string | null;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function fetchReceptionistProfile(): Promise<ReceptionistProfile | null> {
  const context = await resolveCurrentWorkspace();
  if (!context) return null;

  const [{ data: workspace, error: workspaceError }, { data: settings, error: settingsError }] = await Promise.all([
    (supabase as any).from("workspaces").select("name").eq("id", context.workspaceId).maybeSingle(),
    (supabase as any).from("workspace_settings").select("operational_settings").eq("workspace_id", context.workspaceId).maybeSingle(),
  ]);
  if (workspaceError) throw workspaceError;
  if (settingsError) throw settingsError;

  const operational = object(settings?.operational_settings);
  const receptionist = object(operational.receptionist);
  const voiceAgent = object(operational.voice_agent);

  return {
    user_id: context.userId,
    business_name: text(workspace?.name),
    elevenlabs_agent_id: text(voiceAgent.elevenlabs_agent_id),
    receptionist_phone_number: text(receptionist.phone_number),
    receptionist_phone_number_id: text(receptionist.phone_number_id),
    receptionist_voice_id: text(receptionist.voice_id),
    receptionist_system_prompt: text(receptionist.system_prompt),
    receptionist_first_message: text(receptionist.first_message),
    receptionist_status: text(receptionist.status),
    receptionist_provisioned_at: text(receptionist.provisioned_at),
  };
}
