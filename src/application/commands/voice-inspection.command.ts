/**
 * Voice Inspection Commands — Write operations for audio inspection persistence.
 */
import { supabase } from "@/integrations/supabase/client";

export async function invokeTranscribeAudio(audioBase64: string, mimeType: string, vehicleInfo: string): Promise<any> {
  return supabase.functions.invoke("transcribe-audio", {
    body: { audioBase64, mimeType, vehicleInfo },
  });
}

export async function uploadInspectionMedia(path: string, file: File | Blob): Promise<any> {
  return supabase.storage.from("inspection-media").upload(path, file);
}

export async function insertServiceInspection(payload: Record<string, unknown>) {
  return (supabase as any)
    .from("service_inspections")
    .insert(payload)
    .select("id")
    .single();
}

export async function insertInspectionResults(results: Record<string, unknown>[]) {
  return (supabase as any).from("inspection_results").insert(results);
}
