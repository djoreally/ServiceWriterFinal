/**
 * Receptionist Query Layer — reads the owner's AI receptionist profile row.
 */
import { apiClient } from "@/lib/api-client";

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
  const { data } = await apiClient.get<{ data: ReceptionistProfile | null }>("/v1/crm/receptionist/profile");
  return data ?? null;
}
