/**
 * Receptionist Query Layer — reads the owner's AI receptionist profile row.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
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

export async function fetchReceptionistProfile(): Promise<ReceptionistProfile | null> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("business_profiles")
    .select(
      "user_id, business_name, elevenlabs_agent_id, receptionist_phone_number, receptionist_phone_number_id, receptionist_voice_id, receptionist_system_prompt, receptionist_first_message, receptionist_status, receptionist_provisioned_at",
    )
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return (data as ReceptionistProfile | null) ?? null;
}
