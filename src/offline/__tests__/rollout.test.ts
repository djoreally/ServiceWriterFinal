/**
 * Unit tests for offline rollout eligibility logic.
 * Covers all feature-flag combinations to lock in correct gating behavior.
 */
import {
  isOfflineEligibilityConfigured,
  isOfflineEligibleForUser,
  isOfflineEligibleForCurrentUser,
  setCurrentOfflineTenantSlug,
  getOfflineEngineAllowlist,
  getOfflinePilotTenantAllowlist,
} from "../rollout";

// Mutable features object — updated per-test
const featureValues: Record<string, string | boolean | number> = {
  "offline-engine": false,
  "offline-kill-switch": false,
  "offline-engine-allowlist": "",
  "offline-pilot-tenants": "",
  "offline-alert-outbox-depth": 100,
};

jest.mock("@/config/features", () => ({
  get features() {
    return featureValues;
  },
}));

jest.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: jest.fn(),
    },
    rpc: jest.fn(),
  },
}));

import { supabase } from "@/integrations/supabase/client";
import { resetCurrentAuthUserCache } from "@/lib/auth/current-user";

function setFlag(key: string, value: string | boolean | number) {
  featureValues[key] = value;
}

function resetFlags() {
  featureValues["offline-engine"] = false;
  featureValues["offline-kill-switch"] = false;
  featureValues["offline-engine-allowlist"] = "";
  featureValues["offline-pilot-tenants"] = "";
  setCurrentOfflineTenantSlug(null);
}

beforeEach(() => {
  resetFlags();
  resetCurrentAuthUserCache();
  jest.clearAllMocks();
  (supabase.rpc as jest.Mock).mockResolvedValue({
    data: { has_pwa_offline: true },
    error: null,
  });
});

// ---------------------------------------------------------------------------
// isOfflineEligibilityConfigured
// ---------------------------------------------------------------------------
describe("isOfflineEligibilityConfigured", () => {
  it("returns false when engine flag is off", () => {
    expect(isOfflineEligibilityConfigured()).toBe(false);
  });

  it("returns false when engine flag is on but kill-switch is active", () => {
    setFlag("offline-engine", true);
    setFlag("offline-kill-switch", true);
    expect(isOfflineEligibilityConfigured()).toBe(false);
  });

  it("returns true when engine is on and kill-switch is off", () => {
    setFlag("offline-engine", true);
    expect(isOfflineEligibilityConfigured()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getOfflineEngineAllowlist
// ---------------------------------------------------------------------------
describe("getOfflineEngineAllowlist", () => {
  it("returns empty array when allowlist is empty", () => {
    expect(getOfflineEngineAllowlist()).toEqual([]);
  });

  it("parses comma-separated user IDs, normalizing whitespace and case", () => {
    setFlag("offline-engine-allowlist", "  User-A , USER-B , user-c  ");
    expect(getOfflineEngineAllowlist()).toEqual(["user-a", "user-b", "user-c"]);
  });

  it("filters blank entries", () => {
    setFlag("offline-engine-allowlist", "user-a,,user-b,");
    expect(getOfflineEngineAllowlist()).toEqual(["user-a", "user-b"]);
  });
});

// ---------------------------------------------------------------------------
// getOfflinePilotTenantAllowlist
// ---------------------------------------------------------------------------
describe("getOfflinePilotTenantAllowlist", () => {
  it("returns empty array when pilot tenants not configured", () => {
    expect(getOfflinePilotTenantAllowlist()).toEqual([]);
  });

  it("parses comma-separated tenant slugs, normalizing whitespace and case", () => {
    setFlag("offline-pilot-tenants", " Acme , BETA-SHOP");
    expect(getOfflinePilotTenantAllowlist()).toEqual(["acme", "beta-shop"]);
  });
});

// ---------------------------------------------------------------------------
// isOfflineEligibleForUser
// ---------------------------------------------------------------------------
describe("isOfflineEligibleForUser", () => {
  beforeEach(() => {
    setFlag("offline-engine", true);
  });

  it("returns false when engine is off regardless of user", () => {
    setFlag("offline-engine", false);
    expect(isOfflineEligibleForUser("user-123")).toBe(false);
  });

  it("returns false when kill-switch is active regardless of user", () => {
    setFlag("offline-kill-switch", true);
    expect(isOfflineEligibleForUser("user-123")).toBe(false);
  });

  it("kill-switch overrides matching tenant and matching allowlist user", () => {
    setFlag("offline-kill-switch", true);
    setFlag("offline-pilot-tenants", "shop-alpha");
    setFlag("offline-engine-allowlist", "user-123");
    setCurrentOfflineTenantSlug("shop-alpha");

    expect(isOfflineEligibleForUser("user-123")).toBe(false);
  });

  describe("pilot tenant filtering", () => {
    beforeEach(() => {
      setFlag("offline-pilot-tenants", "shop-alpha,shop-beta");
    });

    it("returns false when no tenant slug is set", () => {
      expect(isOfflineEligibleForUser("user-123")).toBe(false);
    });

    it("returns false when current tenant is not in pilot list", () => {
      setCurrentOfflineTenantSlug("shop-gamma");
      expect(isOfflineEligibleForUser("user-123")).toBe(false);
    });

    it("returns true when current tenant is in pilot list (case-insensitive)", () => {
      setCurrentOfflineTenantSlug("SHOP-ALPHA");
      expect(isOfflineEligibleForUser("user-123")).toBe(true);
    });

    it("normalizes tenant slug whitespace before matching pilot list", () => {
      setCurrentOfflineTenantSlug("  shop-alpha  ");
      expect(isOfflineEligibleForUser("user-123")).toBe(true);
    });
  });

  describe("user allowlist filtering", () => {
    it("returns true for any user when allowlist is empty (open enrollment)", () => {
      expect(isOfflineEligibleForUser("user-999")).toBe(true);
    });

    it("returns false when allowlist is non-empty and no userId provided", () => {
      setFlag("offline-engine-allowlist", "user-a,user-b");
      expect(isOfflineEligibleForUser(null)).toBe(false);
      expect(isOfflineEligibleForUser(undefined)).toBe(false);
    });

    it("returns false when userId is not in allowlist", () => {
      setFlag("offline-engine-allowlist", "user-a,user-b");
      expect(isOfflineEligibleForUser("user-c")).toBe(false);
    });

    it("returns true when userId is in allowlist (case-insensitive)", () => {
      setFlag("offline-engine-allowlist", "user-a,user-b");
      expect(isOfflineEligibleForUser("USER-A")).toBe(true);
    });

    it("returns true when userId is in allowlist (exact match)", () => {
      setFlag("offline-engine-allowlist", "user-a,user-b");
      expect(isOfflineEligibleForUser("user-b")).toBe(true);
    });
  });

  describe("combined pilot tenant + allowlist", () => {
    it("returns false when tenant matches but userId is not in allowlist", () => {
      setFlag("offline-pilot-tenants", "shop-alpha");
      setFlag("offline-engine-allowlist", "user-a");
      setCurrentOfflineTenantSlug("shop-alpha");
      expect(isOfflineEligibleForUser("user-b")).toBe(false);
    });

    it("returns true only when both tenant and userId match", () => {
      setFlag("offline-pilot-tenants", "shop-alpha");
      setFlag("offline-engine-allowlist", "user-a");
      setCurrentOfflineTenantSlug("shop-alpha");
      expect(isOfflineEligibleForUser("user-a")).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// isOfflineEligibleForCurrentUser
// ---------------------------------------------------------------------------
describe("isOfflineEligibleForCurrentUser", () => {
  beforeEach(() => {
    setFlag("offline-engine", true);
  });

  it("returns false when supabase getUser returns an error", async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: null },
      error: new Error("no session"),
    });
    expect(await isOfflineEligibleForCurrentUser()).toBe(false);
  });

  it("returns false when no user is authenticated", async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: null },
      error: null,
    });
    expect(await isOfflineEligibleForCurrentUser()).toBe(false);
  });

  it("returns true when authenticated user is eligible (no allowlist)", async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: "user-xyz" } },
      error: null,
    });
    expect(await isOfflineEligibleForCurrentUser()).toBe(true);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("returns true for any authenticated plan and does not require has_pwa_offline entitlement", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { has_pwa_offline: false },
      error: null,
    });
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: "user-basic-plan" } },
      error: null,
    });

    expect(await isOfflineEligibleForCurrentUser()).toBe(true);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("returns true when authenticated user is in allowlist", async () => {
    setFlag("offline-engine-allowlist", "user-xyz");
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: "user-xyz" } },
      error: null,
    });
    expect(await isOfflineEligibleForCurrentUser()).toBe(true);
  });

  it("returns false when authenticated user is not in allowlist", async () => {
    setFlag("offline-engine-allowlist", "user-other");
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: "user-xyz" } },
      error: null,
    });
    expect(await isOfflineEligibleForCurrentUser()).toBe(false);
  });
});
