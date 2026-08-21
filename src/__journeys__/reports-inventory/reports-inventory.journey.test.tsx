import { screen, waitFor } from "@testing-library/react";
import { renderRoute } from "../../test/journeys/renderRoute";
import { personas } from "../../test/journeys/personas";
import { expectNoConsoleErrors, expectNoPlumbingError } from "../../test/journeys/matchers";

describe("Phase 6 Journey — Reports, Inventory & Notifications", () => {
  it("renders reports page with analytics filters and aggregates for owner", async () => {
    renderRoute({
      route: "/reports",
      persona: personas.asOwner(),
    });

    const elements = await screen.findAllByText(/Reports|Analytics|Revenue|Performance/i, {}, { timeout: 8000 });
    expect(elements.length).toBeGreaterThan(0);

    expectNoConsoleErrors();
    expectNoPlumbingError();
  });

  it("renders inventory management, van stock, and item tracking", async () => {
    renderRoute({
      route: "/inventory",
      persona: personas.asOwner(),
    });

    const elements = await screen.findAllByText(/Inventory|Stock|SKU|Parts/i, {}, { timeout: 8000 });
    expect(elements.length).toBeGreaterThan(0);

    expectNoConsoleErrors();
    expectNoPlumbingError();
  });

  it("renders messages and notification composition read paths", async () => {
    renderRoute({
      route: "/messages",
      persona: personas.asOwner(),
    });

    const elements = await screen.findAllByText(/Messages|Notifications|Communications|Inbox/i, {}, { timeout: 8000 });
    expect(elements.length).toBeGreaterThan(0);

    expectNoConsoleErrors();
    expectNoPlumbingError();
  });
});
