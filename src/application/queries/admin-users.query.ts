/**
 * Admin User Management Query & Commands
 * Fetches provider profiles with roles, and manages admin roles plus
 * marketplace listing / booking slug / soft-delete state.
 */
import { apiClient, ApiClientError } from "@/lib/api-client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface UserWithProfile {
  id: string;
  email: string;
  created_at: string;
  business_name: string | null;
  role: string | null;
  booking_slug: string | null;
  marketplace_opt_in: boolean;
  deleted_at: string | null;
  onboarding_completed: boolean;
}

/**
 * Fetches every provider profile on the platform (including incomplete
 * onboarding and archived/soft-deleted records) so admins can audit and
 * manage the full list, not just the polished subset.
 */
export async function fetchUsersWithRoles(): Promise<UserWithProfile[]> {
  const data = await apiClient.get<UserWithProfile[]>("/v1/platform/admin/users");
  return data ?? [];
}

export async function getCurrentUserId(): Promise<string | null> {
  const { data: { user } } = await getCurrentAuthUser();
  return user?.id || null;
}

export async function makeUserAdmin(userId: string): Promise<void> {
  await apiClient.post(`/v1/platform/admin/users/${userId}/role`, { role: "admin" });
}

export async function removeUserAdmin(userId: string): Promise<void> {
  await apiClient.delete(`/v1/platform/admin/users/${userId}/role`);
}

/** Toggle public marketplace/directory visibility for a provider. */
export async function setMarketplaceOptIn(userId: string, optIn: boolean): Promise<void> {
  await apiClient.patch(`/v1/platform/admin/users/${userId}`, { marketplace_opt_in: optIn });
}

/** Archive (soft-delete) or restore a provider profile. */
export async function setProviderArchived(userId: string, archived: boolean): Promise<void> {
  await apiClient.patch(`/v1/platform/admin/users/${userId}`, { archived });
}

export function normalizeBookingSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Update a provider's public booking slug (/book/:slug). */
export async function updateBookingSlug(userId: string, slug: string): Promise<string> {
  const normalized = normalizeBookingSlug(slug);
  if (normalized.length < 3) throw new Error("Booking link must be at least 3 characters");

  try {
    await apiClient.patch(`/v1/platform/admin/users/${userId}`, { booking_slug: normalized });
  } catch (error) {
    const message = error instanceof ApiClientError ? error.message : String(error);
    const code = error instanceof ApiClientError ? error.code : "";
    if (code === "23505" || message.toLowerCase().includes("duplicate")) {
      throw new Error("That booking link is already taken");
    }
    throw error;
  }
  return normalized;
}
