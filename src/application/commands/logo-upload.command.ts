/**
 * Logo Upload Command
 * Handles uploading business logos to storage.
 */

import { apiClient } from "@/lib/api-client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export async function uploadBusinessLogo(file: File): Promise<string> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");

  const form = new FormData();
  form.append("file", file);
  const { data } = await apiClient.post<{ data: string }>("/v1/platform/logo-upload", form);
  return data;
}
