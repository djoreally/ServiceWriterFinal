import { canAccessRoute, canWrite, ROUTE_ACCESS } from "@/domain/auth/access-policy";

describe("access-policy", () => {
  describe("canAccessRoute", () => {
    it("denies when no role is present", () => {
      expect(canAccessRoute(null, "/dashboard")).toBe(false);
    });

    it("grants admins the office dashboard and finance routes", () => {
      expect(canAccessRoute("admin", "/dashboard")).toBe(true);
      expect(canAccessRoute("admin", "/financials")).toBe(true);
      expect(canAccessRoute("admin", "/settings")).toBe(true);
    });

    it("denies technicians office/finance routes", () => {
      expect(canAccessRoute("technician", "/financials")).toBe(false);
      expect(canAccessRoute("technician", "/settings")).toBe(false);
      expect(canAccessRoute("technician", "/invoices")).toBe(false);
    });

    it("grants technicians their field app", () => {
      expect(canAccessRoute("technician", "/tech-app")).toBe(true);
      expect(canAccessRoute("dispatcher", "/tech-app")).toBe(false);
    });

    it("matches nested paths under a prefix", () => {
      expect(canAccessRoute("dispatcher", "/dispatch/board")).toBe(true);
      expect(canAccessRoute("dispatcher", "/dispatch")).toBe(true);
    });

    it("normalizes trailing slashes, query strings, and hashes", () => {
      expect(canAccessRoute("dispatcher", "/dispatch/")).toBe(true);
      expect(canAccessRoute("dispatcher", "/dispatch?tab=today")).toBe(true);
      expect(canAccessRoute("dispatcher", "/dispatch#board")).toBe(true);
    });

    it("keeps growth-tool sub-pages admin-only (first-match-wins before /crm)", () => {
      for (const path of ["/crm/growth", "/crm/newsletter", "/crm/videos", "/crm/retention"]) {
        expect(canAccessRoute("admin", path)).toBe(true);
        expect(canAccessRoute("manager", path)).toBe(false);
        expect(canAccessRoute("dispatcher", path)).toBe(false);
      }
      // The broader /crm hub stays open to the CRM role set
      expect(canAccessRoute("manager", "/crm")).toBe(true);
      expect(canAccessRoute("technician", "/crm")).toBe(false);
    });

    it("keeps customers fenced inside /customer/*", () => {
      expect(canAccessRoute("customer", "/customer/dashboard")).toBe(true);
      expect(canAccessRoute("customer", "/customer")).toBe(true);
      expect(canAccessRoute("customer", "/dashboard")).toBe(false);
      expect(canAccessRoute("customer", "/crm")).toBe(false);
    });

    it("is deny-by-default for unlisted paths (admins excepted)", () => {
      expect(canAccessRoute("manager", "/some-new-secret-route")).toBe(false);
      expect(canAccessRoute("admin", "/some-new-secret-route")).toBe(true);
    });

    it("grants fleet managers the fleet surface but not dispatch-only office areas", () => {
      expect(canAccessRoute("fleet_manager", "/fleet")).toBe(true);
      expect(canAccessRoute("fleet_manager", "/fleet-os/work-orders")).toBe(true);
      expect(canAccessRoute("fleet_manager", "/financials")).toBe(false);
    });
  });

  describe("canWrite", () => {
    it("denies without a role", () => {
      expect(canWrite(null, "quotes")).toBe(false);
    });

    it("lets admins and owners write everywhere", () => {
      expect(canWrite("admin", "settings")).toBe(true);
      expect(canWrite("owner", "invoices")).toBe(true);
    });

    it("keeps viewers and customers read-only", () => {
      expect(canWrite("viewer", "appointments")).toBe(false);
      expect(canWrite("customer", "quotes")).toBe(false);
    });

    it("blocks dispatchers from quote/catalog writes but allows appointment writes", () => {
      expect(canWrite("dispatcher", "quotes")).toBe(false);
      expect(canWrite("dispatcher", "service-catalog")).toBe(false);
      expect(canWrite("dispatcher", "appointments")).toBe(true);
    });

    it("blocks managers from settings writes", () => {
      expect(canWrite("manager", "settings")).toBe(false);
      expect(canWrite("manager", "customers")).toBe(true);
    });

    it("denies writes when the role cannot access the area route at all", () => {
      expect(canWrite("technician", "invoices")).toBe(false);
    });
  });

  describe("ROUTE_ACCESS table", () => {
    it("lists the growth sub-pages before the broader /crm rule", () => {
      const growthIndex = ROUTE_ACCESS.findIndex((r) => r.match === "/crm/growth");
      const crmIndex = ROUTE_ACCESS.findIndex((r) => r.match === "/crm");
      expect(growthIndex).toBeGreaterThanOrEqual(0);
      expect(crmIndex).toBeGreaterThanOrEqual(0);
      expect(growthIndex).toBeLessThan(crmIndex);
    });
  });
});
