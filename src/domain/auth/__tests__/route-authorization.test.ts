import { describe, expect, it } from "@jest/globals";
import { canAccessRoute, canWrite } from "@/domain/auth/route-authorization";

const roles = ["admin", "owner", "manager", "dispatcher", "fleet_manager", "technician"] as const;

describe("role-by-route authorization contract", () => {
  it.each(roles)("allows only admin on privileged settings routes (%s)", (role) => {
    const owner = role === "admin" || role === "owner";
    expect(canAccessRoute(role, "/settings")).toBe(owner);
    expect(canAccessRoute(role, "/admin")).toBe(owner);
    expect(canAccessRoute(role, "/vehicle-specs")).toBe(owner);
    expect(canAccessRoute(role, "/receptionist")).toBe(owner);
    expect(canAccessRoute(role, "/marketplace/listing")).toBe(owner);
  });

  it.each(roles)("keeps owner-only financial reporting closed (%s)", (role) => {
    const owner = role === "admin" || role === "owner";
    expect(canAccessRoute(role, "/financials")).toBe(owner);
    expect(canAccessRoute(role, "/expenses")).toBe(owner);
    expect(canAccessRoute(role, "/reports")).toBe(owner);
    expect(canAccessRoute(role, "/tax-compliance")).toBe(owner);
  });

  it.each(roles)("gives office staff billing without reporting (%s)", (role) => {
    const office = ["admin", "owner", "manager"].includes(role);
    expect(canAccessRoute(role, "/invoices")).toBe(office);
    expect(canAccessRoute(role, "/payments")).toBe(office);
    expect(canAccessRoute(role, "/pricing-tool")).toBe(office);
    expect(canAccessRoute(role, "/dashboard")).toBe(office);
    expect(canAccessRoute(role, "/team-os")).toBe(office);
  });

  it.each(roles)("opens the daily board to dispatch + office (%s)", (role) => {
    const board = ["admin", "owner", "manager", "dispatcher"].includes(role);
    const scheduling = board || role === "fleet_manager";
    expect(canAccessRoute(role, "/dispatch")).toBe(board);
    expect(canAccessRoute(role, "/dispatch-engine")).toBe(board);
    expect(canAccessRoute(role, "/command-center")).toBe(board);
    expect(canAccessRoute(role, "/appointments/abc")).toBe(scheduling);
    expect(canAccessRoute(role, "/messages")).toBe(board);
    expect(canAccessRoute(role, "/customers/abc")).toBe(board);
    expect(canAccessRoute(role, "/vehicles/abc")).toBe(board);
    expect(canAccessRoute(role, "/services")).toBe(board);
  });

  it("splits Fleet OS between the board and the commercial back office", () => {
    expect(canAccessRoute("dispatcher", "/fleet-os/dispatch")).toBe(false);
    expect(canAccessRoute("dispatcher", "/fleet-os/scheduler")).toBe(true);
    expect(canAccessRoute("dispatcher", "/fleet-os/contracts")).toBe(false);
    expect(canAccessRoute("dispatcher", "/fleet-os/invoices")).toBe(false);
    expect(canAccessRoute("manager", "/fleet-os/contracts")).toBe(true);
    expect(canAccessRoute("fleet_manager", "/fleet-os/scheduler")).toBe(true);
    expect(canAccessRoute("fleet_manager", "/fleet-os/vehicles")).toBe(true);
    expect(canAccessRoute("fleet_manager", "/fleet-os/contracts")).toBe(true);
    expect(canAccessRoute("fleet_manager", "/settings")).toBe(false);
  });

  it.each(roles)("contains technicians in their dedicated workspace (%s)", (role) =>
    expect(canAccessRoute(role, "/tech-app/jobs")).toBe(role === "technician")
  );

  it("keeps customer access inside the customer dashboard boundary", () => {
    expect(canAccessRoute("customer", "/customer/dashboard")).toBe(true);
    expect(canAccessRoute("customer", "/customer/invoices")).toBe(true);
    expect(canAccessRoute("customer", "/dashboard")).toBe(false);
    expect(canAccessRoute("customer", "/customers")).toBe(false);
    expect(canAccessRoute("customer", "/dispatch")).toBe(false);
    expect(canWrite("customer", "invoices")).toBe(false);
  });

  it("denies every protected route for an unresolved identity", () => {
    expect(canAccessRoute(null, "/dashboard")).toBe(false);
    expect(canAccessRoute(null, "/admin")).toBe(false);
  });

  it("denies unlisted routes for non-admins (deny by default)", () => {
    expect(canAccessRoute("dispatcher", "/some-future-surface")).toBe(false);
    expect(canAccessRoute("manager", "/some-future-surface")).toBe(false);
    expect(canAccessRoute("admin", "/some-future-surface")).toBe(true);
    expect(canAccessRoute("owner", "/some-future-surface")).toBe(false);
  });

  it("ignores query strings so nav links resolve", () => {
    expect(canAccessRoute("manager", "/settings?tab=team")).toBe(false);
    expect(canAccessRoute("admin", "/settings?tab=team")).toBe(true);
    expect(canAccessRoute("owner", "/settings?tab=team")).toBe(true);
  });

  it("keeps shared self-service surfaces open to all staff", () => {
    for (const role of roles) {
      expect(canAccessRoute(role, "/settings/sessions")).toBe(true);
      expect(canAccessRoute(role, "/knowledge-base/billing")).toBe(true);
    }
  });
});

describe("write capability contract", () => {
  it("makes dispatchers read-only on pricing + catalog surfaces", () => {
    expect(canWrite("dispatcher", "quotes")).toBe(false);
    expect(canWrite("dispatcher", "availability")).toBe(false);
    expect(canWrite("dispatcher", "service-catalog")).toBe(false);
    expect(canWrite("dispatcher", "appointments")).toBe(true);
    expect(canWrite("dispatcher", "customers")).toBe(true);
  });

  it("lets office staff mutate everything they can reach", () => {
    expect(canWrite("manager", "quotes")).toBe(true);
    expect(canWrite("manager", "invoices")).toBe(true);
    expect(canWrite("manager", "settings")).toBe(false);
    expect(canWrite("admin", "settings")).toBe(true);
    expect(canWrite("owner", "settings")).toBe(true);
    expect(canWrite("fleet_manager", "appointments")).toBe(true);
    expect(canWrite("fleet_manager", "invoices")).toBe(false);
  });
});
