/**
 * SW-68: the booking recall notice's render conditions.
 *
 * The notice is a guest-facing heads-up, so the contract is mostly
 * about when it must NOT appear: a partial VIN, a failed lookup, or
 * zero recalls on file all render nothing — and it must never word
 * model-level NHTSA data as this car's open recalls.
 */
import { describe, it, expect, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

jest.mock("@/application/queries/recall-lookup.query", () => ({
  lookupRecallsByVin: jest.fn(),
}));

import { VinRecallNotice } from "@/components/booking/VinRecallNotice";
import { lookupRecallsByVin } from "@/application/queries/recall-lookup.query";

const lookupMock = lookupRecallsByVin as unknown as jest.Mock;

const TRANSIT_VIN = "1FTBR1Y86PKB51521";

const twoCampaigns = {
  vehicle: { year: 2023, make: "FORD", model: "Transit" },
  campaigns: [
    {
      campaignNumber: "22V791000",
      component: "ELECTRICAL SYSTEM: INSTRUMENT CLUSTER/PANEL",
      summary: "The HVAC controls may become inoperative.",
      consequence: "Loss of defrost visibility.",
      remedy: "Dealers will update the software, free of charge.",
      reportReceivedDate: "20/10/2022",
    },
    {
      campaignNumber: "23V071000",
      component: "FUEL SYSTEM, GASOLINE: STORAGE",
      summary: "The fuel tank vent valve may stick.",
      consequence: "Fuel odor.",
      remedy: "Dealers will replace the valve, free of charge.",
      reportReceivedDate: "10/02/2023",
    },
  ],
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 900));

describe("VinRecallNotice", () => {
  it("renders nothing and never looks up while the VIN is incomplete", async () => {
    const { container } = render(<VinRecallNotice vin="1FTBR1Y86" />);
    await settle();
    expect(lookupMock).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the lookup fails soft (null)", async () => {
    lookupMock.mockResolvedValue(null);
    const { container } = render(<VinRecallNotice vin={TRANSIT_VIN} />);
    await settle();
    expect(lookupMock).toHaveBeenCalledWith(TRANSIT_VIN);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when no recalls are on file", async () => {
    lookupMock.mockResolvedValue({
      vehicle: { year: 2023, make: "FORD", model: "Transit" },
      campaigns: [],
    });
    const { container } = render(<VinRecallNotice vin={TRANSIT_VIN} />);
    await settle();
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the count, each campaign, and the honest dealer-confirmation line", async () => {
    lookupMock.mockResolvedValue(twoCampaigns);
    render(<VinRecallNotice vin={TRANSIT_VIN} />);

    expect(
      await screen.findByText(
        "NHTSA has 2 recalls on file for a 2023 Ford Transit",
        undefined,
        { timeout: 3000 },
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("ELECTRICAL SYSTEM: INSTRUMENT CLUSTER/PANEL")).toBeInTheDocument();
    expect(screen.getByText("The HVAC controls may become inoperative.")).toBeInTheDocument();
    expect(screen.getByText(/Dealers will update the software/)).toBeInTheDocument();
    expect(screen.getByText("FUEL SYSTEM, GASOLINE: STORAGE")).toBeInTheDocument();
    // The honesty line: model-level data, only a dealer can confirm for THIS car.
    expect(
      screen.getByText(/Only a dealer can confirm whether this specific car still needs a repair/),
    ).toBeInTheDocument();
  });

  it("uses the singular and de-shouts the make for one recall", async () => {
    lookupMock.mockResolvedValue({
      vehicle: { year: 2023, make: "FORD", model: "Transit" },
      campaigns: [twoCampaigns.campaigns[0]],
    });
    render(<VinRecallNotice vin={TRANSIT_VIN} />);
    expect(
      await screen.findByText("NHTSA has 1 recall on file for a 2023 Ford Transit", undefined, {
        timeout: 3000,
      }),
    ).toBeInTheDocument();
  });

  it("dismisses on the close button and stays down for that VIN", async () => {
    lookupMock.mockResolvedValue(twoCampaigns);
    render(<VinRecallNotice vin={TRANSIT_VIN} />);
    await screen.findByTestId("vin-recall-notice", undefined, { timeout: 3000 });
    fireEvent.click(screen.getByRole("button", { name: "Dismiss recall notice" }));
    await waitFor(() => {
      expect(screen.queryByTestId("vin-recall-notice")).not.toBeInTheDocument();
    });
  });

  it("looks up once per VIN even across re-renders with the same VIN", async () => {
    lookupMock.mockResolvedValue(twoCampaigns);
    const { rerender } = render(<VinRecallNotice vin={TRANSIT_VIN} />);
    await screen.findByTestId("vin-recall-notice", undefined, { timeout: 3000 });
    rerender(<VinRecallNotice vin={TRANSIT_VIN} />);
    await settle();
    expect(lookupMock).toHaveBeenCalledTimes(1);
  });
});
