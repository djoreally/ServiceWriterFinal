/**
 * Settings Page Commands — compatibility adapter for the legacy Settings screen.
 * Writes are routed to the canonical workspace/workspace_settings model.
 */
import { apiClient } from "@/lib/api-client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

/** Upload a logo to storage. */
export async function uploadLogo(userId: string, file: File) {
  const form = new FormData();
  form.append("userId", userId);
  form.append("file", file);
  const { data } = await apiClient.post<{ data: string }>(
    "/v1/platform/settings/logo",
    form,
  );
  return data;
}

/** Upload a cover image to storage. */
export async function uploadCoverImage(userId: string, file: File) {
  const form = new FormData();
  form.append("userId", userId);
  form.append("file", file);
  const { data } = await apiClient.post<{ data: string }>(
    "/v1/platform/settings/cover",
    form,
  );
  return data;
}

/** Upsert the legacy-shaped business profile into canonical workspace tables. */
export async function upsertBusinessProfile(_userId: string, data: Record<string, unknown>) {
  const context = await resolveCurrentWorkspace();
  if (!context?.workspaceId) {
    return {
      data: null,
      error: { code: "workspace_not_found", message: "No active workspace found" },
    };
  }

  try {
    const result = await apiClient.post<{ data: unknown; error: unknown }>(
      "/v1/platform/settings/business-profile",
      { data, selected_workspace_id: context.workspaceId },
    );
    return { data: result.data ?? null, error: result.error ?? null };
  } catch (error) {
    return { data: null, error };
  }
}
