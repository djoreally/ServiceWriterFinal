import { describe, expect, it } from "@jest/globals";
import { isStartupDecisionPath, resolveStartupRoute } from "@/lib/resolveStartupRoute";

describe("resolveStartupRoute", () => {
  it("keeps anonymous users on the public homepage", () => {
    expect(
      resolveStartupRoute({
        currentPath: "/",
        isAuthenticated: false,
        persistedIntendedPath: null,
      }),
    ).toBe("/");
  });

  it("leaves anonymous protected-route visits to route-level guards", () => {
    expect(
      resolveStartupRoute({
        currentPath: "/dashboard",
        isAuthenticated: false,
        persistedIntendedPath: null,
      }),
    ).toBe("/dashboard");
  });

  it("sends authenticated onboarded root visits to dashboard", () => {
    expect(
      resolveStartupRoute({
        currentPath: "/",
        isAuthenticated: true,
        persistedIntendedPath: null,
      }),
    ).toBe("/dashboard");
  });

  it("ignores stale persisted settings destinations on startup", () => {
    expect(
      resolveStartupRoute({
        currentPath: "/",
        isAuthenticated: true,
        persistedIntendedPath: "/settings",
      }),
    ).toBe("/dashboard");
  });

  it("sends authenticated technicians to the field app from generic startup routes", () => {
    expect(
      resolveStartupRoute({
        currentPath: "/",
        isAuthenticated: true,
        persistedIntendedPath: null,
        role: "technician",
      }),
    ).toBe("/tech-app");
  });

  it("redirects authenticated technicians away from the owner dashboard", () => {
    expect(
      resolveStartupRoute({
        currentPath: "/dashboard",
        isAuthenticated: true,
        persistedIntendedPath: null,
        role: "technician",
      }),
    ).toBe("/tech-app");
  });

  it("redirects authenticated technicians away from the retired team dashboard", () => {
    expect(
      resolveStartupRoute({
        currentPath: "/team/dashboard",
        isAuthenticated: true,
        persistedIntendedPath: null,
        role: "technician",
      }),
    ).toBe("/tech-app");
  });

  it("preserves technician workspace deep links", () => {
    expect(
      resolveStartupRoute({
        currentPath: "/tech-app/jobs",
        isAuthenticated: true,
        persistedIntendedPath: null,
        role: "technician",
      }),
    ).toBe("/tech-app/jobs");
  });

  it("preserves authenticated concrete app routes outside the startup-decision set", () => {
    expect(
      resolveStartupRoute({
        currentPath: "/customers",
        isAuthenticated: true,
        persistedIntendedPath: null,
      }),
    ).toBe("/customers");
  });

  it("routes dispatchers to the board even when the plan gate is active", () => {
    expect(
      resolveStartupRoute({
        currentPath: "/",
        isAuthenticated: true,
        persistedIntendedPath: null,
        role: "dispatcher",
        requiresPlan: true,
      }),
    ).toBe("/dispatch");
  });

  it("keeps managers off owner onboarding", () => {
    expect(
      resolveStartupRoute({
        currentPath: "/",
        isAuthenticated: true,
        persistedIntendedPath: null,
        role: "manager",
        requiresOnboarding: true,
      }),
    ).toBe("/dispatch");
  });

  it("routes fleet managers to Fleet OS instead of the owner dashboard", () => {
    expect(
      resolveStartupRoute({
        currentPath: "/",
        isAuthenticated: true,
        persistedIntendedPath: null,
        role: "fleet_manager",
        requiresPlan: true,
      }),
    ).toBe("/fleet-os");
  });

  it("preserves dispatcher deep links instead of forcing the board", () => {
    expect(
      resolveStartupRoute({
        currentPath: "/appointments",
        isAuthenticated: true,
        persistedIntendedPath: null,
        role: "dispatcher",
      }),
    ).toBe("/appointments");
  });
});

describe("isStartupDecisionPath", () => {
  it("recognizes only generic startup routes", () => {
    expect(isStartupDecisionPath("/")).toBe(true);
    expect(isStartupDecisionPath("/login")).toBe(true);
    expect(isStartupDecisionPath("/plans")).toBe(true);
    expect(isStartupDecisionPath("/dashboard")).toBe(false);
    expect(isStartupDecisionPath("/customers")).toBe(false);
  });

  it("leaves workforce login portals to WorkforceAuth", () => {
    expect(isStartupDecisionPath("/login/business")).toBe(false);
    expect(isStartupDecisionPath("/login/dispatch")).toBe(false);
    expect(isStartupDecisionPath("/login/technician")).toBe(false);
    expect(isStartupDecisionPath("/login/magic-link")).toBe(false);
  });
});
