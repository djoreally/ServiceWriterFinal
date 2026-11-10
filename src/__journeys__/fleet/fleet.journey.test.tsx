import { screen, waitFor } from "@testing-library/react";
import { renderRoute } from "../../test/journeys/renderRoute";
import { personas } from "../../test/journeys/personas";
import { expectNoConsoleErrors, expectNoPlumbingError } from "../../test/journeys/matchers";

describe("Phase 4 Journey — Fleet (vans core, Fleet OS stripped)", () => {
  it("renders fleet command center with vans and technicians for owner", async () => {
    renderRoute({
      route: "/fleet",
      persona: personas.asOwner(),
    });

    await waitFor(() => {
      const elements = screen.getAllByText(/Fleet Command Center|Total Vans|Mobile Unit 1/i);
      expect(elements.length).toBeGreaterThan(0);
    });

    expectNoConsoleErrors();
    expectNoPlumbingError();
  });

  // S1 (Fleet OS strip): the /fleet-os/* section page is deleted and the
  // prefix is unregistered, so these paths now fall through to the SPA
  // catch-all NotFound — the door is closed even for the owner.
  // expectNoConsoleErrors is intentionally not called here: the NotFound
  // page logs the attempted route via console.error by design.
  it("serves NotFound for the stripped Fleet OS scheduler", async () => {
    renderRoute({
      route: "/fleet-os/scheduler",
      persona: personas.asOwner(),
    });

    await waitFor(() => {
      expect(screen.getByText(/Oops! Page not found/i)).toBeTruthy();
    });

    expectNoPlumbingError();
  });

  it("serves NotFound for the stripped Fleet OS work orders", async () => {
    renderRoute({
      route: "/fleet-os/work-orders",
      persona: personas.asOwner(),
    });

    await waitFor(() => {
      expect(screen.getByText(/Oops! Page not found/i)).toBeTruthy();
    });

    expectNoPlumbingError();
  });
});
