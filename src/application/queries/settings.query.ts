/**
 * Settings Query - canonical workspace/settings data access.
 *
 * The legacy app stored business settings in business_profiles keyed by owner
 * user id. Final uses a workspace identity plus one workspace_settings row.
 * This adapter preserves the existing UI contract while routing reads/writes
 * to the canonical schema.
 */

import { errorMessage } from "@/lib/error-message";
import type { Terminology } from "@/contexts/TerminologyContext";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";
import { apiClient } from "@/lib/api-client";

export interface BusinessProfileSettings {
  id?: string;
  user_id: string;
  business_name: string;
  owner_name: string;
  phone: string;
  email: string;
  address: string;
  logo_url: string;
  terminology: Terminology;
  date_format: string;
  timezone: string;
  currency: string;
  opening_time: string;
  closing_time: string;
  working_days: string[];
  booking_slug: string;
  service_radius_miles: number;
  service_address: string;
  service_coordinates: { lat: number; lng: number } | null;
}

const DEFAULT_PROFILE: Omit<BusinessProfileSettings, "user_id"> = {
  business_name: "",
  owner_name: "",
  phone: "",
  email: "",
  address: "",
  logo_url: "",
  terminology: { customer: "Customer", vehicle: "Vehicle", service: "Service", quote: "Quote" },
  date_format: "MM/DD/YYYY hh:mm A",
  timezone: "America/New_York",
  currency: "USD",
  opening_time: "09:00",
  closing_time: "17:00",
  working_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  booking_slug: "",
  service_radius_miles: 25,
  service_address: "",
  service_coordinates: null,
};

export type WorkspaceContext = { workspaceId: string; userId: string };

type CachedWorkspaceContext = {
  key: string;
  value: WorkspaceContext | null;
  expiresAt: number;
};

const WORKSPACE_CONTEXT_TTL_MS = 5 * 60 * 1000;
const BUSINESS_SETTINGS_TTL_MS = 5 * 60 * 1000;
let workspaceContextCache: CachedWorkspaceContext | null = null;
let workspaceContextInFlight: { key: string; promise: Promise<WorkspaceContext | null> } | null = null;
const businessSettingsCache = new Map<string, { value: BusinessProfileSettings | null; expiresAt: number }>();
const businessSettingsInFlight = new Map<string, Promise<BusinessProfileSettings | null>>();

async function resolveWorkspaceFromApi(userId: string, selectedWorkspaceId: string | null): Promise<WorkspaceContext | null> {
  const response = await apiClient.get<{
    workspaceId: string | null;
    businessSettings: BusinessProfileSettings | null;
  }>("/v1/workspace-context", {
    query: { selected_workspace_id: selectedWorkspaceId ?? undefined },
  });
  const workspaceId = response.workspaceId;
  // Seed the business settings cache so fetchBusinessSettings reuses the bundle.
  if (workspaceId && response.businessSettings) {
    businessSettingsCache.set(workspaceId, {
      value: { ...response.businessSettings, id: workspaceId, user_id: userId },
      expiresAt: Date.now() + BUSINESS_SETTINGS_TTL_MS,
    });
  }
  return workspaceId ? { workspaceId, userId } : null;
}

/**
 * Resolve the active workspace once per user/selection and share the same
 * in-flight request across concurrent page loaders. The selected workspace id
 * is part of the cache key, so changing workspaces bypasses the old entry
 * immediately without requiring a full application reload.
 */
export async function resolveCurrentWorkspace(): Promise<WorkspaceContext | null> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return null;

  const selectedWorkspaceId = getSelectedWorkspaceId();
  const key = `${user.id}:${selectedWorkspaceId ?? "default"}`;
  const now = Date.now();

  if (workspaceContextCache?.key === key && workspaceContextCache.expiresAt > now) {
    return workspaceContextCache.value;
  }

  if (workspaceContextInFlight?.key === key) {
    return workspaceContextInFlight.promise;
  }

  const promise = resolveWorkspaceFromApi(user.id, selectedWorkspaceId)
    .then((value) => {
      workspaceContextCache = {
        key,
        value,
        expiresAt: Date.now() + WORKSPACE_CONTEXT_TTL_MS,
      };
      return value;
    })
    .finally(() => {
      if (workspaceContextInFlight?.key === key) workspaceContextInFlight = null;
    });

  workspaceContextInFlight = { key, promise };
  return promise;
}

export function resetCurrentWorkspaceCache(): void {
  workspaceContextCache = null;
  workspaceContextInFlight = null;
}

export function invalidateBusinessSettings(workspaceId?: string): void {
  if (workspaceId) {
    businessSettingsCache.delete(workspaceId);
    businessSettingsInFlight.delete(workspaceId);
    return;
  }
  businessSettingsCache.clear();
  businessSettingsInFlight.clear();
}

async function loadBusinessSettings(context: WorkspaceContext): Promise<BusinessProfileSettings | null> {
  const selectedWorkspaceId = getSelectedWorkspaceId();
  const response = await apiClient.get<{
    workspaceId: string | null;
    businessSettings: BusinessProfileSettings | null;
  }>("/v1/workspace-context", {
    query: { selected_workspace_id: selectedWorkspaceId ?? undefined },
  });
  const settings = response.businessSettings;
  if (!settings) return null;
  // Ensure the settings carry the resolved workspace/user identity.
  return {
    ...settings,
    id: context.workspaceId,
    user_id: context.userId,
  };
}

export async function fetchBusinessSettings(): Promise<BusinessProfileSettings | null> {
  try {
    const context = await resolveCurrentWorkspace();
    if (!context) return null;

    const cached = businessSettingsCache.get(context.workspaceId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const existingRequest = businessSettingsInFlight.get(context.workspaceId);
    if (existingRequest) return existingRequest;

    const request = loadBusinessSettings(context)
      .then((value) => {
        businessSettingsCache.set(context.workspaceId, {
          value,
          expiresAt: Date.now() + BUSINESS_SETTINGS_TTL_MS,
        });
        return value;
      })
      .finally(() => {
        businessSettingsInFlight.delete(context.workspaceId);
      });

    businessSettingsInFlight.set(context.workspaceId, request);
    return await request;
  } catch {
    return null;
  }
}

export async function saveBusinessSettings(profile: BusinessProfileSettings, slugInput: string): Promise<{ success: boolean; error?: string }> {
  try {
    const context = await resolveCurrentWorkspace();
    if (!context) return { success: false, error: "Not authenticated" };
    const slug = (slugInput || profile.booking_slug || "").trim().toLowerCase();
    const selectedWorkspaceId = getSelectedWorkspaceId();
    // Strip the client-side identity fields; the server resolves workspace from auth.
    const { id: _id, user_id: _userId, ...profilePayload } = profile;

    await apiClient.put<{ success: boolean }>(
      "/v1/workspace-context",
      { slug, profile: profilePayload },
      { query: { selected_workspace_id: selectedWorkspaceId ?? context.workspaceId } },
    );

    invalidateBusinessSettings(context.workspaceId);
    return { success: true };
  } catch (err: unknown) {
    if (errorMessage(err)?.includes("unique") || errorMessage(err)?.includes("duplicate") || errorMessage(err)?.includes("already taken")) {
      return { success: false, error: "This booking link is already taken. Please choose another." };
    }
    return { success: false, error: errorMessage(err, "Failed to save profile") };
  }
}

export async function checkSlugAvailability(slug: string): Promise<boolean | null> {
  if (!slug || slug.length < 3) return null;
  if (!/^[a-z0-9-]+$/.test(slug)) return false;
  try {
    const context = await resolveCurrentWorkspace();
    if (!context) return null;
    const selectedWorkspaceId = getSelectedWorkspaceId() ?? context.workspaceId;
    const response = await apiClient.get<{ available: boolean | null }>("/v1/workspace-context/slug-availability", {
      query: {
        slug,
        selected_workspace_id: selectedWorkspaceId,
      },
    });
    return response.available;
  } catch {
    return null;
  }
}
