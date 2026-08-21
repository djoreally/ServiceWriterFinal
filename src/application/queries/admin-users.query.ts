/**
 * Admin User Management Query & Commands
 * Fetches provider profiles with roles, and manages admin roles plus
 * marketplace listing / booking slug / soft-delete state.
 */
import { supabase } from "@/integrations/supabase/client";

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
  const { data: profiles, error } = await supabase
    .from("business_profiles")
    .select(
      "user_id, business_name, email, created_at, booking_slug, marketplace_opt_in, deleted_at, onboarding_completed",
    )
    .order("created_at", { ascending: false });

  if (error) throw error;

  const userIds = profiles?.map((p) => p.user_id) || [];
  if (userIds.length === 0) return [];

  const { data: roles } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .in("user_id", userIds);

  const roleMap = new Map(roles?.map((r) => [r.user_id, r.role]) || []);

  return (profiles || []).map((p) => ({
    id: p.user_id,
    email: p.email || "",
    created_at: p.created_at,
    business_name: p.business_name,
    role: roleMap.get(p.user_id) || "user",
    booking_slug: p.booking_slug ?? null,
    marketplace_opt_in: Boolean(p.marketplace_opt_in),
    deleted_at: p.deleted_at ?? null,
    onboarding_completed: Boolean(p.onboarding_completed),
  }));
}

export async function getCurrentUserId(): Promise<string | null> {
  const { data: { user } } = await getCurrentAuthUser();
  return user?.id || null;
}

export async function makeUserAdmin(userId: string): Promise<void> {
  const { error } = await supabase
    .from("user_roles")
    .upsert({ user_id: userId, role: "admin" as const });
  if (error) throw error;
}

export async function removeUserAdmin(userId: string): Promise<void> {
  const { error } = await supabase
    .from("user_roles")
    .delete()
    .eq("user_id", userId)
    .eq("role", "admin");
  if (error) throw error;
}

/** Toggle public marketplace/directory visibility for a provider. */
export async function setMarketplaceOptIn(userId: string, optIn: boolean): Promise<void> {
  const { error } = await supabase
    .from("business_profiles")
    .update({ marketplace_opt_in: optIn })
    .eq("user_id", userId);
  if (error) throw error;
}

/** Archive (soft-delete) or restore a provider profile. */
export async function setProviderArchived(userId: string, archived: boolean): Promise<void> {
  const payload: { deleted_at: string | null; marketplace_opt_in?: boolean } = archived
    ? { deleted_at: new Date().toISOString(), marketplace_opt_in: false }
    : { deleted_at: null };

  const { error } = await supabase
    .from("business_profiles")
    .update(payload)
    .eq("user_id", userId);
  if (error) throw error;
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

  const { error } = await supabase
    .from("business_profiles")
    .update({ booking_slug: normalized })
    .eq("user_id", userId);

  if (error) {
    if (error.code === "23505" || error.message.toLowerCase().includes("duplicate")) {
      throw new Error("That booking link is already taken");
    }
    throw error;
  }
  return normalized;
}
