import { screen, waitFor } from "@testing-library/react";
import { renderRoute } from "../../test/journeys/renderRoute";
import { personas } from "../../test/journeys/personas";
import { expectNoConsoleErrors, expectNoPlumbingError } from "../../test/journeys/matchers";

describe("Phase 1 Journey — Auth and Routing Spine", () => {
  it("boots to dashboard for shop owner persona", async () => {
    const { getCurrentPath } = renderRoute({
      route: "/dashboard",
      persona: personas.asOwner(),
    });

    await waitFor(() => {
      expect(getCurrentPath()).toBe("/dashboard");
    });

    const elements = await screen.findAllByText(/Dashboard/i);
    expect(elements.length).toBeGreaterThan(0);
    expectNoConsoleErrors();
    expectNoPlumbingError();
  });

  it("boots to technician app for technician persona", async () => {
    const { getCurrentPath } = renderRoute({
      route: "/tech-app",
      persona: personas.asTechnician(),
    });

    await waitFor(() => {
      expect(getCurrentPath()).toBe("/tech-app");
    });

    expectNoConsoleErrors();
    expectNoPlumbingError();
  });

  it("boots to dispatch engine for dispatcher persona", async () => {
    const { getCurrentPath } = renderRoute({
      route: "/dispatch",
      persona: personas.asDispatcher(),
    });

    await waitFor(() => {
      expect(getCurrentPath()).toBe("/dispatch");
    });

    expectNoConsoleErrors();
    expectNoPlumbingError();
  });

  it("redirects unauthenticated guest accessing protected route to login", async () => {
    const { getCurrentPath } = renderRoute({
      route: "/dashboard",
      persona: personas.asGuest(),
    });

    await waitFor(() => {
      expect(getCurrentPath()).toBe("/login");
    });

    expect(await screen.findByText(/Sign in/i)).toBeInTheDocument();
    expectNoConsoleErrors();
    expectNoPlumbingError();
  });

  it("handles sign out flow and returns to unauthenticated state", async () => {
    const { backend, getCurrentPath } = renderRoute({
      route: "/dashboard",
      persona: personas.asOwner(),
    });

    await waitFor(() => {
      expect(getCurrentPath()).toBe("/dashboard");
    });

    // Perform sign out action via backend auth
    await backend.auth.signOut();

    await waitFor(() => {
      expect(getCurrentPath()).toBe("/login");
    });

    expectNoConsoleErrors();
  });

  it("settles route in a single navigation without redirect loops", async () => {
    const { getCurrentPath } = renderRoute({
      route: "/dashboard",
      persona: personas.asOwner(),
    });

    await waitFor(() => {
      expect(getCurrentPath()).toBe("/dashboard");
    });

    expectNoPlumbingError();
  });
});
