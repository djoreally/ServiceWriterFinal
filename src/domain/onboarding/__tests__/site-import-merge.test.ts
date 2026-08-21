import { describe, expect, it } from "@jest/globals";
import {
  acceptedServices,
  defaultSelection,
  mergeSiteImport,
  type SiteImportResult,
} from "@/domain/onboarding/site-import-merge";

const baseResult = (overrides: Partial<SiteImportResult> = {}): SiteImportResult => ({
  source_url: "https://myshop.com/",
  business: { name: "My Shop", owner_name: "Jo", email: "jo@myshop.com", phone: "5551234567", address: "1 Main St" },
  branding: {
    logo_url: "https://myshop.com/logo.svg",
    primary_color: "#0a84ff",
    secondary_color: null,
    background_color: null,
    font_family: "Inter",
  },
  services: [
    { name: "Oil Change", description: "Synthetic", price: 89, duration_minutes: 45 },
    { name: "oil change", description: "dupe", price: 99, duration_minutes: 30 },
    { name: "Brake Job", description: "", price: null, duration_minutes: 60 },
  ],
  hours: [
    { day: "monday", open: "08:00", close: "18:00", is_open: true },
    { day: "sunday", open: "09:00", close: "17:00", is_open: false },
  ],
  service_area: { cities: ["Tampa"], radius_miles_hint: 40, base_address: "1 Main St" },
  ...overrides,
});

const target = () => ({
  business_name: "",
  owner_name: "",
  email: "",
  phone: "",
  logo_url: null as string | null,
  service_address: "",
  service_radius_miles: 25,
  day_hours: {
    monday: { open: "09:00", close: "17:00", isOpen: true },
    sunday: { open: "09:00", close: "17:00", isOpen: false },
  },
});

describe("mergeSiteImport", () => {
  it("fills empty fields from the import", () => {
    const result = baseResult();
    const merged = mergeSiteImport(target(), result, defaultSelection(result));
    expect(merged.business_name).toBe("My Shop");
    expect(merged.email).toBe("jo@myshop.com");
    expect(merged.logo_url).toBe("https://myshop.com/logo.svg");
    expect(merged.service_address).toBe("1 Main St");
    expect(merged.service_radius_miles).toBe(40);
    expect(merged.day_hours.monday).toEqual({ open: "08:00", close: "18:00", isOpen: true });
    expect(merged.day_hours.sunday.isOpen).toBe(false);
  });

  it("never overwrites values the owner already entered", () => {
    const result = baseResult();
    const current = { ...target(), business_name: "Mine", email: "me@me.com" };
    const merged = mergeSiteImport(current, result, defaultSelection(result));
    expect(merged.business_name).toBe("Mine");
    expect(merged.email).toBe("me@me.com");
  });

  it("skips deselected sections", () => {
    const result = baseResult();
    const merged = mergeSiteImport(target(), result, {
      business: false,
      branding: false,
      hours: false,
      serviceArea: false,
      serviceIndexes: [],
    });
    expect(merged.business_name).toBe("");
    expect(merged.logo_url).toBeNull();
    expect(merged.service_radius_miles).toBe(25);
    expect(merged.day_hours.monday.open).toBe("09:00");
  });

  it("handles an import with no hours or area", () => {
    const result = baseResult({
      hours: [],
      service_area: { cities: [], radius_miles_hint: null, base_address: null },
    });
    const merged = mergeSiteImport(target(), result, defaultSelection(result));
    expect(merged.day_hours.monday.open).toBe("09:00");
    expect(merged.service_address).toBe("");
  });
});

describe("acceptedServices", () => {
  it("dedupes by name and keeps unpriced services", () => {
    const result = baseResult();
    const accepted = acceptedServices(result, defaultSelection(result));
    expect(accepted.map((s) => s.name)).toEqual(["Oil Change", "Brake Job"]);
    expect(accepted[1].price).toBeNull();
  });

  it("returns nothing when all services are deselected", () => {
    const result = baseResult();
    expect(acceptedServices(result, { ...defaultSelection(result), serviceIndexes: [] })).toEqual([]);
  });
});
