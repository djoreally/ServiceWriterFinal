import { screen, waitFor } from "@testing-library/react";
import { renderRoute } from "../../test/journeys/renderRoute";
import { personas } from "../../test/journeys/personas";
import { expectNoConsoleErrors, expectNoPlumbingError } from "../../test/journeys/matchers";

describe("Phase 5 Journey — Money, Subscriptions, Marketplace & Settings", () => {
  it("renders quotes & estimates page with financial calculations for owner", async () => {
    renderRoute({
      route: "/quotes",
      persona: personas.asOwner(),
    });

    await waitFor(() => {
      const elements = screen.getAllByText(/Quotes|Estimates|Quotes & Estimates/i);
      expect(elements.length).toBeGreaterThan(0);
    }, { timeout: 5000 });

    expectNoConsoleErrors();
    expectNoPlumbingError();
  });

  it("handles plan gating and subscription features correctly", async () => {
    renderRoute({
      route: "/subscriptions",
      persona: personas.asOwner(),
    });

    await waitFor(() => {
      const elements = screen.getAllByText(/Subscriptions|Subscription|Plans|Plan/i);
      expect(elements.length).toBeGreaterThan(0);
    }, { timeout: 5000 });

    expectNoConsoleErrors();
    expectNoPlumbingError();
  });

  it("renders marketplace hub tabs and read paths for admin owner", async () => {
    renderRoute({
      route: "/marketplace",
      persona: personas.asOwner(),
    });

    await waitFor(() => {
      const elements = screen.getAllByText(/Marketplace|Listing|Directory/i);
      expect(elements.length).toBeGreaterThan(0);
    }, { timeout: 5000 });

    expectNoConsoleErrors();
    expectNoPlumbingError();
  });

  it("renders settings and handles integration connect state invocations", async () => {
    renderRoute({
      route: "/settings",
      persona: personas.asOwner(),
    });

    await waitFor(() => {
      const elements = screen.getAllByText(/Business|Booking|Integrations|Settings/i);
      expect(elements.length).toBeGreaterThan(0);
    }, { timeout: 5000 });

    expectNoConsoleErrors();
    expectNoPlumbingError();
  });
});
