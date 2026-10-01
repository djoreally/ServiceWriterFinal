/**
 * Voice Inspection Commands — Write operations for audio inspection persistence.
 */
import { apiClient } from "@/lib/api-client";

export async function invokeTranscribeAudio(audioBase64: string, mimeType: string, vehicleInfo: string) {
  const data = await apiClient.post<{
    error?: string;
    text?: string;
    transcript?: string;
    summary?: string;
    findings?: unknown[];
  }>(
    "/v1/platform/edge/transcribe-audio",
    { body: { audioBase64, mimeType, vehicleInfo } },
  );
  return { data, error: null };
}

export async function uploadInspectionMedia(path: string, file: File | Blob) {
  // Get a signed upload URL from the API, then PUT the file directly.
  const response = await apiClient.post<{ data: { signedUrl: string | null } }>(
    "/v1/inspections/media/upload-url",
    { path },
  );
  const signedUrl = response.data?.signedUrl;
  if (!signedUrl) throw new Error("Could not get upload URL");
  const uploadResponse = await fetch(signedUrl, {
    method: "PUT",
    headers: { "Content-Type": (file as File).type || "application/octet-stream" },
    body: file,
  });
  if (!uploadResponse.ok) throw new Error("Upload failed");
  return { data: { path }, error: null };
}

export async function insertServiceInspection(payload: Record<string, unknown>) {
  const response = await apiClient.post<{ data: { id: string } | null; error: unknown }>(
    "/v1/inspections/service-inspections",
    { payload },
  );
  return { data: response.data ?? null, error: response.error ?? null };
}

export async function insertInspectionResults(results: Record<string, unknown>[]) {
  const response = await apiClient.post<{ data: unknown[] | null; error: unknown }>(
    "/v1/inspections/inspection-results",
    { results },
  );
  return { data: response.data ?? null, error: response.error ?? null };
}
