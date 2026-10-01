/**
 * Voice Inspection Query — Read operations for inspection media.
 *
 * Phase 2: signed URLs are minted through the typed API client
 * (`@/lib/api-client`) to the appointments Hono router instead of direct
 * storage access. Exported signatures are unchanged.
 */
import { apiClient } from "@/lib/api-client";

export async function getInspectionMediaSignedUrl(path: string) {
  const response = await apiClient.get<{
    data: { signedUrl: string | null } | null;
    error: unknown;
  }>("/v1/inspections/media/signed-url", {
    query: { path, expires: String(60 * 60 * 24 * 365) },
  });
  return { data: response.data, error: response.error ?? null };
}
