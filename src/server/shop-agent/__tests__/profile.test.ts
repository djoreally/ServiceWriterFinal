/**
 * Shop Agent Phase 1 — profile reader tests.
 * Supabase is mocked; no live DB.
 */
import { describe, it, expect } from "@jest/globals";
import { installWebGlobals as mockInstallWebGlobals } from "../../hono/test-support/webGlobals";

jest.mock("next/server", () => {
  mockInstallWebGlobals();
  return jest.requireActual("next/server");
});

import {
  getShopProfile,
  buildBusinessHours,
  isWithinBusinessHours,
  currentLocalMinutes,
} from "../profile";
import type { ShopProfile } from "../zeroai/types";

// ---------------------------------------------------------------------------
// Minimal chainable supabase mock.
// ---------------------------------------------------------------------------

type SeedEntry = { data: any; error: any } | ((ctx: { table: string; op: string }) => { data: any; error: any });

function mockSupabase(seed: Record<string, SeedEntry>) {
  const client: any = {
    from(table: string) {
      const builder: any = {
        select() { return builder; },
        eq() { return builder; },
        neq() { return builder; },
        not() { return builder; },
        lt() { return builder; },
        gt() { return builder; },
        gte() { return builder; },
        lte() { return builder; },
        in() { return builder; },
        like() { return builder; },
        order() { return builder; },
        limit() { return builder; },
        range() { return builder; },
        maybeSingle() { return resolve("single"); },
        single() { return resolve("single"); },
        // Thenable: supports `await query` without a terminal single().
        then(onFulfilled: any, onRejected: any) {
          return resolve("query").then(onFulfilled, onRejected);
        },
      };
      function resolve(op: string) {
        const entry = seed[`${table}:${op}`] ?? seed[table];
        const res =
          typeof entry === "function"
            ? (entry as (ctx: { table: string; op: string }) => { data: any; error: any })({ table, op })
            : entry;
        return Promise.resolve(res ?? { data: null, error: null });
      }
      return builder;
    },
  };
  return client;
}

const WS_ID = "11111111-1111-4111-8111-111111111111";

function seedComplete() {
  return mockSupabase({
    "workspaces": {
      data: { id: WS_ID, name: "MOMS Mobile Oil Change", timezone: "America/New_York" },
      error: null,
    },
    "workspace_settings": {
      data: {
        phone: "(215) 767-2125",
        email: "support@momsoilchange.com",
        website_url: "https://momsoilchange.com",
        booking_slug: "moms",
        city: "Ambler",
        postal_code: "19002",
        service_radius_miles: 25,
        day_hours: {
          monday: { is_open: true, open: "08:00", close: "19:00" },
          saturday: { is_open: true, open: "08:00", close: "19:00" },
        },
        working_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        opening_time: "08:00:00",
        closing_time: "19:00:00",
        operational_settings: {},
      },
      error: null,
    },
    "service_catalog": {
      data: [
        { id: "svc-1", name: "Oil Change", description: "Full synthetic", labor_price: 79, estimated_minutes: 30, category: "maintenance", is_active: true },
      ],
      error: null,
    },
  });
}

describe("getShopProfile", () => {
  it("builds a complete profile with score 100", async () => {
    const profile = await getShopProfile(seedComplete(), WS_ID);
    expect(profile.workspaceId).toBe(WS_ID);
    expect(profile.businessName).toBe("MOMS Mobile Oil Change");
    expect(profile.publicPhone).toBe("(215) 767-2125");
    expect(profile.hours.timezone).toBe("America/New_York");
    expect(profile.hours.days.monday).toEqual({ open: "08:00", close: "19:00" });
    expect(profile.hours.days.sunday).toBeNull();
    expect(profile.services).toHaveLength(1);
    expect(profile.services[0]).toMatchObject({ name: "Oil Change", priceMin: 79, priceMax: 79 });
    expect(profile.serviceArea).toMatchObject({ towns: ["Ambler"], zips: ["19002"], radiusMiles: 25 });
    expect(profile.bookingUrl).toBe("https://momsoilchange.com/book/moms");
    // Optional sections stay undefined when absent — never fail.
    expect(profile.brandVoice).toBeUndefined();
    expect(profile.policies).toBeUndefined();
    expect(profile.escalation).toBeUndefined();
    expect(profile.completenessScore).toBe(100);
    expect(profile.missingFields).toEqual([]);
  });

  it("scores missing phone and services correctly", async () => {
    const supabase = mockSupabase({
      "workspaces": { data: { id: WS_ID, name: "Shop", timezone: "America/New_York" }, error: null },
      "workspace_settings": {
        data: {
          phone: null,
          city: "Philly",
          postal_code: null,
          service_radius_miles: null,
          working_days: ["Monday"],
          opening_time: "09:00:00",
          closing_time: "17:00:00",
          operational_settings: {},
        },
        error: null,
      },
      "service_catalog": { data: [], error: null },
    });
    const profile = await getShopProfile(supabase, WS_ID);
    // Filled: businessName, timezone, hours = 3/5 -> 60.
    expect(profile.completenessScore).toBe(60);
    expect(profile.missingFields).toEqual(expect.arrayContaining(["publicPhone", "services"]));
    expect(profile.services).toEqual([]);
    expect(profile.publicPhone).toBeUndefined();
  });

  it("notes an empty service area in missingFields without lowering the score", async () => {
    const supabase = seedComplete();
    // Override: strip city/postal from settings via a fresh seed.
    const bare = mockSupabase({
      "workspaces": { data: { id: WS_ID, name: "Shop", timezone: "America/New_York" }, error: null },
      "workspace_settings": {
        data: { phone: "555-0100", city: null, postal_code: null, working_days: ["Monday"], opening_time: "09:00:00", closing_time: "17:00:00", operational_settings: {} },
        error: null,
      },
      "service_catalog": {
        data: [{ id: "s1", name: "Oil Change", labor_price: 50, estimated_minutes: 30, is_active: true }],
        error: null,
      },
    });
    void supabase;
    const profile = await getShopProfile(bare, WS_ID);
    expect(profile.completenessScore).toBe(100);
    expect(profile.missingFields).toEqual(["serviceArea"]);
    expect(profile.serviceArea.towns).toEqual([]);
    expect(profile.serviceArea.zips).toEqual([]);
  });

  it("reads optional agent sections from operational_settings when present", async () => {
    const supabase = mockSupabase({
      "workspaces": { data: { id: WS_ID, name: "Shop", timezone: "UTC" }, error: null },
      "workspace_settings": {
        data: {
          phone: "555-0100",
          working_days: ["Monday"],
          operational_settings: {
            agent_brand_voice: "plain-spoken, no corporate polish",
            agent_policies: { cancellation: "24h notice" },
            agent_escalation: { ownerPhone: "555-0199", callbackPromise: "within 2 business hours" },
          },
        },
        error: null,
      },
      "service_catalog": { data: [{ id: "s1", name: "Oil Change", labor_price: 50, is_active: true }], error: null },
    });
    const profile = await getShopProfile(supabase, WS_ID);
    expect(profile.brandVoice).toBe("plain-spoken, no corporate polish");
    expect(profile.policies).toEqual({ cancellation: "24h notice" });
    expect(profile.escalation).toEqual({ ownerPhone: "555-0199", callbackPromise: "within 2 business hours" });
  });
});

describe("buildBusinessHours", () => {
  it("prefers day_hours over the working_days fallback", () => {
    const hours = buildBusinessHours("UTC", {
      day_hours: { monday: { isOpen: false }, tuesday: { is_open: true, open: "10:00", close: "15:00" } },
      working_days: ["Monday", "Tuesday"],
      opening_time: "09:00:00",
      closing_time: "17:00:00",
    });
    expect(hours.days.monday).toBeNull();
    expect(hours.days.tuesday).toEqual({ open: "10:00", close: "15:00" });
    // Wednesday is in neither day_hours nor working_days -> closed.
    expect(hours.days.wednesday).toBeNull();
  });

  it("falls back to working_days + opening/closing times", () => {
    const hours = buildBusinessHours("UTC", {
      day_hours: {},
      working_days: ["Friday"],
      opening_time: "08:30:00",
      closing_time: "18:00:00",
    });
    expect(hours.days.friday).toEqual({ open: "08:30", close: "18:00" });
    expect(hours.days.monday).toBeNull();
  });
});

describe("isWithinBusinessHours", () => {
  // 2026-10-05 is a Monday; America/New_York is UTC-4 (EDT).
  const profile: ShopProfile = {
    workspaceId: WS_ID,
    businessName: "Shop",
    hours: {
      timezone: "America/New_York",
      days: {
        monday: { open: "09:00", close: "17:00" },
        tuesday: { open: "09:00", close: "17:00" },
        wednesday: { open: "09:00", close: "17:00" },
        thursday: { open: "09:00", close: "17:00" },
        friday: { open: "09:00", close: "17:00" },
        saturday: null,
        sunday: null,
      },
    },
    serviceArea: { towns: [], zips: [] },
    services: [],
    completenessScore: 0,
    missingFields: [],
  };

  it("accepts the open boundary and rejects the close boundary", () => {
    expect(isWithinBusinessHours(profile, new Date("2026-10-05T13:00:00Z"))).toBe(true); // Mon 09:00 EDT
    expect(isWithinBusinessHours(profile, new Date("2026-10-05T20:59:00Z"))).toBe(true); // Mon 16:59 EDT
    expect(isWithinBusinessHours(profile, new Date("2026-10-05T21:00:00Z"))).toBe(false); // Mon 17:00 EDT
    expect(isWithinBusinessHours(profile, new Date("2026-10-05T12:59:00Z"))).toBe(false); // Mon 08:59 EDT
  });

  it("rejects closed days", () => {
    expect(isWithinBusinessHours(profile, new Date("2026-10-04T13:00:00Z"))).toBe(false); // Sun 09:00 EDT
    expect(isWithinBusinessHours(profile, new Date("2026-10-03T13:00:00Z"))).toBe(false); // Sat 09:00 EDT
  });
});

describe("currentLocalMinutes", () => {
  it("returns local minutes-since-midnight", () => {
    // 2026-10-05T13:30:00Z = Mon 09:30 EDT
    expect(currentLocalMinutes("America/New_York", new Date("2026-10-05T13:30:00Z"))).toBe(9 * 60 + 30);
    expect(currentLocalMinutes("UTC", new Date("2026-10-05T13:30:00Z"))).toBe(13 * 60 + 30);
  });
});
