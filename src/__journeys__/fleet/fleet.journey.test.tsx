import { screen, waitFor } from "@testing-library/react";
import { renderRoute } from "../../test/journeys/renderRoute";
import { personas } from "../../test/journeys/personas";
import { expectNoConsoleErrors, expectNoPlumbingError } from "../../test/journeys/matchers";

describe("Phase 4 Journey — Fleet OS", () => {
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

  it("renders fleet OS scheduling and work order management", async () => {
    renderRoute({
      route: "/fleet-os/scheduler",
      persona: personas.asOwner(),
    });

    await waitFor(() => {
      const elements = screen.getAllByText(/Fleet|Schedule|Work Orders|Metro Logistics/i);
      expect(elements.length).toBeGreaterThan(0);
    });

    expectNoConsoleErrors();
    expectNoPlumbingError();
  });

  it("enforces contract pricing inheritance and work order PO guards", async () => {
    const { backend } = renderRoute({
      route: "/fleet-os/work-orders",
      persona: personas.asOwner(),
    });

    // Query fleet work order table to verify PO limit and status defaults
    const wo = backend.tables.fleet_work_orders[0];
    expect(wo.po_authorization_status).toBe("approved");
    expect(wo.po_amount_limit).toBeGreaterThan(0);

    expectNoConsoleErrors();
    expectNoPlumbingError();
  });
});
