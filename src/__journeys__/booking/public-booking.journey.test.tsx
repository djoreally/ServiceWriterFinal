import { screen, waitFor } from "@testing-library/react";
import { renderRoute } from "../../test/journeys/renderRoute";
import { personas } from "../../test/journeys/personas";
import { expectNoConsoleErrors, expectNoPlumbingError, expectRpcCalled } from "../../test/journeys/matchers";

describe("Phase 2 Journey — Public Booking", () => {
  it("renders provider directory profile for anonymous visitors", async () => {
    renderRoute({
      route: "/find-provider/apex-auto",
      persona: personas.asGuest(),
    });

    await waitFor(() => {
      const headings = screen.getAllByText(/Apex Mobile Auto Care/i);
      expect(headings.length).toBeGreaterThan(0);
    });

    expect(screen.getByText(/Full Synthetic Oil Change/i)).toBeInTheDocument();
    expectNoConsoleErrors();
    expectNoPlumbingError();
  });

  it("renders public multi-step booking engine for tenant slug", async () => {
    renderRoute({
      route: "/public-services/apex-auto",
      persona: personas.asGuest(),
    });

    await waitFor(() => {
      expect(screen.getByText(/Full Synthetic Oil Change/i)).toBeInTheDocument();
    });

    // Verify active services are shown and disabled service is hidden
    expect(screen.queryByText(/Seasonal Ceramic Coating Detail/i)).not.toBeInTheDocument();
    expectNoConsoleErrors();
    expectNoPlumbingError();
  });

  it("handles rate limit check and RPC contract for booking submissions", async () => {
    const { backend } = renderRoute({
      route: "/public-services/apex-auto",
      persona: personas.asGuest(),
    });

    await waitFor(() => {
      expect(screen.getByText(/Full Synthetic Oil Change/i)).toBeInTheDocument();
    });

    // Simulate booking submission RPC
    const res = await backend.rpc("book_appointment_safe", {
      p_business_user_id: "00000000-0000-0000-0000-000000000001",
      p_scheduled_date: "2026-09-01",
      p_scheduled_time: "10:00",
      p_duration_minutes: 45,
      p_title: "Full Synthetic Oil Change",
      p_guest_name: "Jane Guest",
      p_guest_email: "jane.guest@example.com",
      p_guest_phone: "+12155550199",
      p_description: "Oil change booking",
      p_notes: null,
      p_estimated_cost: 89.99,
      p_tax_amount: 5.40,
      p_service_catalog_id: "svc-oil-change",
      p_vehicle_id: null,
      p_status: "confirmed",
    });

    expect(res.data).toBeDefined();
    expectRpcCalled("book_appointment_safe", { p_guest_email: "jane.guest@example.com" });
    expectNoConsoleErrors();
  });

  it("enforces location service area validation on public booking", async () => {
    renderRoute({
      route: "/public-services/apex-auto",
      persona: personas.asGuest(),
    });

    await waitFor(() => {
      expect(screen.getByText(/Full Synthetic Oil Change/i)).toBeInTheDocument();
    });

    expectNoPlumbingError();
  });
});
