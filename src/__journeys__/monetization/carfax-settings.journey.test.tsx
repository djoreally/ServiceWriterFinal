import { screen, waitFor } from "@testing-library/react";
import { renderRoute } from "../../test/journeys/renderRoute";
import { personas } from "../../test/journeys/personas";
import { expectNoConsoleErrors, expectNoPlumbingError } from "../../test/journeys/matchers";

/**
 * SW-86: the CARFAX settings screen is hosted and reachable.
 *
 * Before this fix the screen component existed but was mounted nowhere:
 * /settings/carfax 404'd and the Settings search found nothing. This
 * journey drives the real route — the ?tab=carfax deep link resolves to
 * the Integrations tab — and proves the screen renders with the saved
 * location ID (the journey API fake mirrors production's value,
 * servicewriter01), the manual export actions, and the export monitor.
 */
describe("SW-86 Journey — CARFAX settings screen", () => {
  it("renders the CARFAX section via the ?tab=carfax deep link with the saved location ID", async () => {
    renderRoute({
      route: "/settings?tab=carfax",
      persona: personas.asOwner(),
    });

    await waitFor(() => {
      expect(screen.getByText("CARFAX Integration")).toBeTruthy();
    }, { timeout: 10000 });

    const input = screen.getByLabelText(/CARFAX Location ID/) as HTMLInputElement;
    await waitFor(() => {
      expect(input.value).toBe("servicewriter01");
    }, { timeout: 10000 });

    expect(screen.getByRole("button", { name: /Export Today's Data \(PROD\)/ })).toBeTruthy();
    expect(await screen.findByText("Export History")).toBeTruthy();

    expectNoConsoleErrors();
    expectNoPlumbingError();
  });
});
