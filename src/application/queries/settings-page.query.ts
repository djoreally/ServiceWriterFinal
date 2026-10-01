/**
 * Settings Page Query — compatibility adapter for the legacy Settings screen.
 * Reads are routed to the canonical workspace/workspace_settings model.
 */
import { apiClient } from "@/lib/api-client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

/** Get the current authenticated user. */
export async function getCurrentUser() {
  const { data: { user } } = await getCurrentAuthUser();
  return user;
}

/** Fetch the legacy-shaped business profile from canonical workspace settings. */
export async function fetchBusinessProfileDirect(_userId: string) {
  const context = await resolveCurrentWorkspace();
  if (!context) return { data: null, error: null };

  try {
    const { data, error } = await apiClient.get<{ data: unknown; error: unknown }>(
      "/v1/platform/settings/business-profile",
      { query: { selected_workspace_id: context.workspaceId } },
    );
    return { data, error };
  } catch (error) {
    return { data: null, error };
  }
}

/** Check booking-slug availability against canonical workspace tables. */
export async function checkSlugDirect(slug: string) {
  const context = await resolveCurrentWorkspace();
  try {
    const result = await apiClient.get<{
      available: boolean | null;
      workspaceId: string | null;
      userId: string | null;
    }>("/v1/platform/settings/slug-check", {
      query: {
        slug,
        selected_workspace_id: context?.workspaceId ?? undefined,
      },
    });
    if (result.available === null) {
      return { data: null, error: new Error("Unable to verify booking link availability") };
    }
    if (result.available) return { data: null, error: null };
    return {
      data: result.workspaceId
        ? { id: result.workspaceId, user_id: result.userId ?? "" }
        : { id: "", user_id: "" },
      error: null,
    };
  } catch (error) {
    return { data: null, error: new Error("Unable to verify booking link availability") };
  }
}
