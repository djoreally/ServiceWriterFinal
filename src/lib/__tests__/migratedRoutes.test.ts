import {
  getTenantSlugFromHostname,
  isMigratedPath,
  isMigratedTenantPath,
} from "@/lib/migratedRoutes";

describe("migratedRoutes", () => {
  describe("isMigratedPath", () => {
    it("matches migrated App Router prefixes", () => {
      expect(isMigratedPath("/dashboard")).toBe(true);
      expect(isMigratedPath("/crm")).toBe(true);
      expect(isMigratedPath("/fleet-os/scheduler")).toBe(true);
    });

    it("matches nested paths under a prefix (segment-aware)", () => {
      expect(isMigratedPath("/customers/123")).toBe(true);
      expect(isMigratedPath("/crm/growth")).toBe(true);
    });

    it("does not match lookalike prefixes", () => {
      expect(isMigratedPath("/customers-foo")).toBe(false);
      expect(isMigratedPath("/crmx")).toBe(false);
    });

    it("matches retired growth-tool URLs (redirect pages)", () => {
      expect(isMigratedPath("/growth-tools")).toBe(true);
      expect(isMigratedPath("/marketing")).toBe(true);
      expect(isMigratedPath("/newsletter")).toBe(true);
      expect(isMigratedPath("/retention-engine")).toBe(true);
    });

    it("returns false for unmigrated paths", () => {
      expect(isMigratedPath("/login")).toBe(false);
      expect(isMigratedPath("/")).toBe(false);
    });
  });

  describe("isMigratedTenantPath", () => {
    it("matches tenant-subdomain migrated prefixes", () => {
      expect(isMigratedTenantPath("/customer/dashboard")).toBe(true);
      expect(isMigratedTenantPath("/embed/booking")).toBe(true);
      expect(isMigratedTenantPath("/my-bookings")).toBe(true);
    });

    it("returns false for app-shell paths", () => {
      expect(isMigratedTenantPath("/dashboard")).toBe(false);
    });
  });

  describe("getTenantSlugFromHostname", () => {
    it("resolves tenant slugs from subdomains", () => {
      expect(getTenantSlugFromHostname("apex.servicewriter.xyz")).toBe("apex");
      expect(getTenantSlugFromHostname("moms-oil-change.servicewriter.xyz")).toBe(
        "moms-oil-change",
      );
    });

    it("normalizes case and whitespace", () => {
      expect(getTenantSlugFromHostname("  Apex.ServiceWriter.XYZ ")).toBe("apex");
    });

    it("never resolves infrastructure hosts", () => {
      expect(getTenantSlugFromHostname("servicewriter.xyz")).toBeNull();
      expect(getTenantSlugFromHostname("www.servicewriter.xyz")).toBeNull();
      expect(getTenantSlugFromHostname("localhost")).toBeNull();
      expect(getTenantSlugFromHostname("127.0.0.1")).toBeNull();
      expect(getTenantSlugFromHostname("auth.servicewriter.xyz")).toBeNull();
      expect(getTenantSlugFromHostname("api.servicewriter.xyz")).toBeNull();
      expect(getTenantSlugFromHostname("app.servicewriter.xyz")).toBeNull();
    });

    it("rejects non-production domains and malformed slugs", () => {
      expect(getTenantSlugFromHostname("apex.example.com")).toBeNull();
      expect(getTenantSlugFromHostname("apex_service.servicewriter.xyz")).toBeNull();
      expect(getTenantSlugFromHostname("")).toBeNull();
    });
  });
});
