/**
 * Admin provider management backed by canonical workspace tables.
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

export async function fetchUsersWithRoles(): Promise<UserWithProfile[]> {
  const { data: workspaces, error } = await supabase
    .from("workspaces")
    .select("id, name, created_by, created_at, is_active")
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!workspaces?.length) return [];

  const workspaceIds = workspaces.map((workspace) => workspace.id);
  const ownerIds = Array.from(new Set(workspaces.map((workspace) => workspace.created_by)));

  const [{ data: settings, error: settingsError }, { data: roles, error: rolesError }] = await Promise.all([
    supabase
      .from("workspace_settings")
      .select("workspace_id, email, booking_slug, marketplace_opt_in, operational_settings")
      .in("workspace_id", workspaceIds),
    supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", ownerIds),
  ]);
  if (settingsError) throw settingsError;
  if (rolesError) throw rolesError;

  const settingsMap = new Map((settings ?? []).map((row) => [row.workspace_id, row]));
  const roleMap = new Map((roles ?? []).map((row) => [row.user_id, row.role]));

  return workspaces.map((workspace) => {
    const workspaceSettings = settingsMap.get(workspace.id);
    const operational = workspaceSettings?.operational_settings;
    const onboardingCompleted = Boolean(
      operational && typeof operational === "object" && !Array.isArray(operational)
        ? (operational as Record<string, unknown>).onboarding_completed
        : true,
    );

    return {
      id: workspace.created_by,
      email: workspaceSettings?.email ?? "",
      created_at: workspace.created_at,
      business_name: workspace.name,
      role: roleMap.get(workspace.created_by) ?? "user",
      booking_slug: workspaceSettings?.booking_slug ?? null,
      marketplace_opt_in: Boolean(workspaceSettings?.marketplace_opt_in),
      deleted_at: workspace.is_active ? null : workspace.updated_at ?? workspace.created_at,
      onboarding_completed: onboardingCompleted,
    };
  });
}

export async function getCurrentUserId(): Promise<string | null> {
  const { data: { user } } = await getCurrentAuthUser();
  return user?.id ?? null;
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

async function workspaceIdsForOwner(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("workspaces")
    .select("id")
    .eq("created_by", userId);
  if (error) throw error;
  return (data ?? []).map((workspace) => workspace.id);
}

export async function setMarketplaceOptIn(userId: string, optIn: boolean): Promise<void> {
  const workspaceIds = await workspaceIdsForOwner(userId);
  if (!workspaceIds.length) return;
  const { error } = await supabase
    .from("workspace_settings")
    .update({ marketplace_opt_in: optIn })
    .in("workspace_id", workspaceIds);
  if (error) throw error;
}

export async function setProviderArchived(userId: string, archived: boolean): Promise<void> {
  const workspaceIds = await workspaceIdsForOwner(userId);
  if (!workspaceIds.length) return;

  const { error: workspaceError } = await supabase
    .from("workspaces")
    .update({ is_active: !archived })
    .in("id", workspaceIds);
  if (workspaceError) throw workspaceError;

  if (archived) {
    const { error: settingsError } = await supabase
      .from("workspace_settings")
      .update({ marketplace_opt_in: false, booking_enabled: false })
      .in("workspace_id", workspaceIds);
    if (settingsError) throw settingsError;
  }
}

export function normalizeBookingSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function updateBookingSlug(userId: string, slug: string): Promise<string> {
  const normalized = normalizeBookingSlug(slug);
  if (normalized.length < 3) throw new Error("Booking link must be at least 3 characters");

  const workspaceIds = await workspaceIdsForOwner(userId);
  if (!workspaceIds.length) throw new Error("No workspace found for provider");

  const { error } = await supabase
    .from("workspace_settings")
    .update({ booking_slug: normalized })
    .in("workspace_id", workspaceIds);
  if (error) {
    if (error.code === "23505" || error.message.toLowerCase().includes("duplicate")) {
      throw new Error("That booking link is already taken");
    }
    throw error;
  }
  return normalized;
}
