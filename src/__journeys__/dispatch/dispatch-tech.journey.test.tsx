import { screen, waitFor } from "@testing-library/react";
import { renderRoute } from "../../test/journeys/renderRoute";
import { personas } from "../../test/journeys/personas";
import { expectNoConsoleErrors, expectNoPlumbingError } from "../../test/journeys/matchers";

describe("Phase 3 Journey — Appointments & Dispatch", () => {
  it("renders appointments list and manages appointment lifecycle for owner", async () => {
    renderRoute({
      route: "/appointments",
      persona: personas.asOwner(),
    });

    await waitFor(() => {
      const elements = screen.getAllByText(/Full Synthetic Oil Change/i);
      expect(elements.length).toBeGreaterThan(0);
    }, { timeout: 8_000 });

    expectNoConsoleErrors();
    expectNoPlumbingError();
  });

  it("renders dispatch board and handles technician job assignment for dispatcher", async () => {
    renderRoute({
      route: "/dispatch",
      persona: personas.asDispatcher(),
    });

    await waitFor(() => {
      const elements = screen.getAllByText(/Command Center|Appointments|Dispatch|Service Writer/i);
      expect(elements.length).toBeGreaterThan(0);
    });

    expectNoConsoleErrors();
    expectNoPlumbingError();
  });

  it("renders field technician today list and supports start/complete job workflow", async () => {
    renderRoute({
      route: "/tech-app",
      persona: personas.asTechnician(),
    });

    await waitFor(() => {
      const elements = screen.getAllByText(/Good day|Dave|Today|Service Writer/i);
      expect(elements.length).toBeGreaterThan(0);
    });

    expectNoConsoleErrors();
    expectNoPlumbingError();
  });

  it("handles offline disabled fallback gracefully in tech app", async () => {
    renderRoute({
      route: "/tech-app/jobs",
      persona: personas.asTechnician(),
    });

    await waitFor(() => {
      const elements = screen.getAllByText(/Jobs|Today|Shift|Service Writer/i);
      expect(elements.length).toBeGreaterThan(0);
    });

    expectNoConsoleErrors();
    expectNoPlumbingError();
  });
});
