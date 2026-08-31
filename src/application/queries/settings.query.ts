/**
 * Settings Query - canonical workspace/settings data access.
 *
 * The legacy app stored business settings in business_profiles keyed by owner
 * user id. Final uses a workspace identity plus one workspace_settings row.
 * This adapter preserves the existing UI contract while routing reads/writes
 * to the canonical schema.
 */

import { errorMessage } from "@/lib/error-message";
import { productionSupabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types.production";
import type { Terminology } from "@/contexts/TerminologyContext";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";

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
type WorkspaceSettingsRow = Database["public"]["Tables"]["workspace_settings"]["Row"];

export async function resolveCurrentWorkspace(): Promise<WorkspaceContext | null> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return null;

  const selectedWorkspaceId = getSelectedWorkspaceId();
  let membershipQuery = productionSupabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("is_active", true);

  // Every workspace-scoped surface must honor the workspace selected in the
  // application shell. Previously this resolver used an unordered limit(1),
  // so users with multiple memberships could see the dashboard for one shop
  // while the appointments API and calendar loaded another.
  if (selectedWorkspaceId) {
    membershipQuery = membershipQuery.eq("workspace_id", selectedWorkspaceId);
  }

  let { data: membership, error: membershipError } = await membershipQuery
    .limit(1)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership && selectedWorkspaceId) {
    const fallback = await productionSupabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    membership = fallback.data;
    membershipError = fallback.error;
    if (membershipError) throw membershipError;
  }
  if (membership?.workspace_id) return { workspaceId: membership.workspace_id, userId: user.id };

  const { data: owned, error: ownedError } = await productionSupabase
    .from("workspaces")
    .select("id")
    .eq("created_by", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (ownedError) throw ownedError;
  return owned?.id ? { workspaceId: owned.id, userId: user.id } : null;
}

function parseTerminology(value: unknown): Terminology {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_PROFILE.terminology;
  const raw = value as Record<string, unknown>;
  return {
    customer: typeof raw.customer === "string" ? raw.customer : "Customer",
    vehicle: typeof raw.vehicle === "string" ? raw.vehicle : "Vehicle",
    service: typeof raw.service === "string" ? raw.service : "Service",
    quote: typeof raw.quote === "string" ? raw.quote : "Quote",
  };
}

function readOperationalObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function buildAddress(settings: Pick<WorkspaceSettingsRow, "address_line1" | "address_line2" | "city" | "region" | "postal_code"> | null): string {
  return [settings?.address_line1, settings?.address_line2, settings?.city, settings?.region, settings?.postal_code]
    .filter(Boolean).join(", ");
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

export async function fetchBusinessSettings(): Promise<BusinessProfileSettings | null> {
  try {
    const context = await resolveCurrentWorkspace();
    if (!context) return null;
    const [{ data: workspace, error: workspaceError }, { data: settings, error: settingsError }] = await Promise.all([
      productionSupabase.from("workspaces").select("id, name, slug, timezone, currency_code").eq("id", context.workspaceId).maybeSingle(),
      productionSupabase.from("workspace_settings").select("*").eq("workspace_id", context.workspaceId).maybeSingle(),
    ]);
    if (workspaceError) throw workspaceError;
    if (settingsError) throw settingsError;
    if (!workspace) return null;

    const operational = readOperationalObject(settings?.operational_settings);
    const coordinates = readOperationalObject(operational.service_coordinates);
    const serviceCoordinates = Number.isFinite(Number(coordinates.lat)) && Number.isFinite(Number(coordinates.lng))
      ? { lat: Number(coordinates.lat), lng: Number(coordinates.lng) } : null;

    return {
      id: context.workspaceId,
      user_id: context.userId,
      business_name: workspace.name || "",
      owner_name: settings?.owner_name || "",
      phone: settings?.phone || "",
      email: settings?.email || "",
      address: buildAddress(settings),
      logo_url: settings?.logo_url || "",
      terminology: parseTerminology(settings?.terminology),
      date_format: typeof operational.date_format === "string" ? operational.date_format : DEFAULT_PROFILE.date_format,
      timezone: workspace.timezone || (typeof operational.timezone === "string" ? operational.timezone : DEFAULT_PROFILE.timezone),
      currency: workspace.currency_code || (typeof operational.currency === "string" ? operational.currency : DEFAULT_PROFILE.currency),
      opening_time: settings?.opening_time || DEFAULT_PROFILE.opening_time,
      closing_time: settings?.closing_time || DEFAULT_PROFILE.closing_time,
      working_days: Array.isArray(settings?.working_days) ? settings.working_days : DEFAULT_PROFILE.working_days,
      booking_slug: settings?.booking_slug || workspace.slug || "",
      service_radius_miles: Number(settings?.service_radius_miles ?? DEFAULT_PROFILE.service_radius_miles),
      service_address: typeof operational.service_address === "string" ? operational.service_address : buildAddress(settings),
      service_coordinates: serviceCoordinates,
    };
  } catch {
    return null;
  }
}

export async function saveBusinessSettings(profile: BusinessProfileSettings, slugInput: string): Promise<{ success: boolean; error?: string }> {
  try {
    const context = await resolveCurrentWorkspace();
    if (!context) return { success: false, error: "Not authenticated" };
    const slug = (slugInput || profile.booking_slug || "").trim().toLowerCase();

    const { data: existingSettings, error: readError } = await productionSupabase.from("workspace_settings")
      .select("operational_settings").eq("workspace_id", context.workspaceId).maybeSingle();
    if (readError) throw readError;

    const operational = {
      ...readOperationalObject(existingSettings?.operational_settings),
      date_format: profile.date_format,
      timezone: profile.timezone,
      currency: profile.currency,
      service_address: profile.service_address,
      service_coordinates: profile.service_coordinates,
    };

    const { error: workspaceError } = await productionSupabase.from("workspaces").update({
      name: profile.business_name,
      slug,
      timezone: profile.timezone || DEFAULT_PROFILE.timezone,
      currency_code: profile.currency || DEFAULT_PROFILE.currency,
    }).eq("id", context.workspaceId);
    if (workspaceError) throw workspaceError;

    const { error: settingsError } = await productionSupabase.from("workspace_settings").update({
      owner_name: profile.owner_name || null,
      phone: profile.phone || null,
      email: profile.email || null,
      logo_url: profile.logo_url || null,
      terminology: toJson(profile.terminology),
      opening_time: profile.opening_time || null,
      closing_time: profile.closing_time || null,
      working_days: profile.working_days,
      booking_slug: slug || null,
      service_radius_miles: profile.service_radius_miles,
      operational_settings: toJson(operational),
    }).eq("workspace_id", context.workspaceId);
    if (settingsError) throw settingsError;

    return { success: true };
  } catch (err: unknown) {
    if (errorMessage(err)?.includes("unique") || errorMessage(err)?.includes("duplicate")) {
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
    const [{ data: workspaceMatch, error: workspaceError }, { data: settingsMatch, error: settingsError }] = await Promise.all([
      productionSupabase.from("workspaces").select("id").eq("slug", slug).neq("id", context.workspaceId).limit(1),
      productionSupabase.from("workspace_settings").select("workspace_id").eq("booking_slug", slug).neq("workspace_id", context.workspaceId).limit(1),
    ]);
    if (workspaceError || settingsError) return null;
    return !(workspaceMatch?.length || settingsMatch?.length);
  } catch {
    return null;
  }
}
