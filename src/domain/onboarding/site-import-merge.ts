/**
 * Pure normalization + merge logic for onboarding website imports.
 * Kept free of React and Supabase so it can be unit tested directly.
 */

export interface SiteImportService {
  name: string;
  description: string;
  price: number | null;
  duration_minutes: number;
}

export interface SiteImportHours {
  day: string;
  open: string;
  close: string;
  is_open: boolean;
}

export interface SiteImportResult {
  source_url: string;
  business: {
    name: string | null;
    owner_name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
  };
  branding: {
    logo_url: string | null;
    primary_color: string | null;
    secondary_color: string | null;
    background_color: string | null;
    font_family: string | null;
  };
  services: SiteImportService[];
  hours: SiteImportHours[];
  service_area: {
    cities: string[];
    radius_miles_hint: number | null;
    base_address: string | null;
  };
}

export interface DayHours {
  open: string;
  close: string;
  isOpen: boolean;
}

export interface SiteImportSelection {
  business: boolean;
  branding: boolean;
  hours: boolean;
  serviceArea: boolean;
  /** Indexes of accepted services within `result.services`. */
  serviceIndexes: number[];
}

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export function defaultSelection(result: SiteImportResult): SiteImportSelection {
  return {
    business: true,
    branding: true,
    hours: result.hours.length > 0,
    serviceArea: Boolean(result.service_area.base_address),
    serviceIndexes: result.services.map((_, i) => i),
  };
}

export interface MergeTarget {
  business_name: string;
  owner_name: string;
  email: string;
  phone: string;
  logo_url: string | null;
  service_address: string;
  service_radius_miles: number;
  day_hours: Record<string, DayHours>;
  brand_primary_color?: string | null;
  brand_secondary_color?: string | null;
  brand_font_family?: string | null;
}

/**
 * Merge accepted suggestions into the wizard state. Existing non-empty values
 * are never overwritten so a returning owner's own edits win.
 */
export function mergeSiteImport<T extends MergeTarget>(
  current: T,
  result: SiteImportResult,
  selection: SiteImportSelection,
): T {
  const next: T = { ...current };

  if (selection.business) {
    const b = result.business;
    if (!next.business_name && b.name) next.business_name = b.name;
    if (!next.owner_name && b.owner_name) next.owner_name = b.owner_name;
    if (!next.email && b.email) next.email = b.email;
    if (!next.phone && b.phone) next.phone = b.phone;
  }

  if (selection.branding) {
    if (!next.logo_url && result.branding.logo_url) next.logo_url = result.branding.logo_url;
    next.brand_primary_color = next.brand_primary_color || result.branding.primary_color;
    next.brand_secondary_color = next.brand_secondary_color || result.branding.secondary_color;
    next.brand_font_family = next.brand_font_family || result.branding.font_family;
  }

  if (selection.serviceArea) {
    const address = result.service_area.base_address || result.business.address;
    if (!next.service_address && address) next.service_address = address;
    const radius = result.service_area.radius_miles_hint;
    if (radius && radius > 0) next.service_radius_miles = radius;
  }

  if (selection.hours && result.hours.length > 0) {
    const merged: Record<string, DayHours> = { ...next.day_hours };
    for (const day of DAYS) {
      const detected = result.hours.find((h) => h.day === day);
      if (!detected) continue;
      merged[day] = {
        open: detected.open || merged[day]?.open || "09:00",
        close: detected.close || merged[day]?.close || "17:00",
        isOpen: detected.is_open,
      };
    }
    next.day_hours = merged;
  }

  return next;
}

export function acceptedServices(
  result: SiteImportResult,
  selection: SiteImportSelection,
): SiteImportService[] {
  const seen = new Set<string>();
  return selection.serviceIndexes
    .map((i) => result.services[i])
    .filter((s): s is SiteImportService => Boolean(s?.name))
    .filter((s) => {
      const key = s.name.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
