import { render, screen, waitFor } from "@testing-library/react";
import { AppointmentConfigurationSummary } from "@/components/booking/AppointmentConfigurationSummary";

jest.mock("@/application/queries/booking-configuration.query", () => ({
  fetchAppointmentBookingConfiguration: jest.fn(),
}));

import { fetchAppointmentBookingConfiguration } from "@/application/queries/booking-configuration.query";

const mockedFetch = fetchAppointmentBookingConfiguration as jest.Mock;

const configuration = {
  vehicles: [
    {
      clientVehicleId: "cv-1",
      vehicle: {
        year: 2020,
        make: "Toyota",
        model: "Camry",
        licensePlate: "ABC123",
        vin: "1HGCM82633A004352",
      },
      oil: {
        engine: "2.5L I4",
        oilType: "5W-20 Full Synthetic",
        oilCapacity: "4.5 qt",
        oilFilter: "Spin-on standard",
        capacitySource: "manual",
      },
      tire: {
        frontSize: "205/65R16",
        frontQuantity: 4,
        rearSize: null,
        rearQuantity: null,
        productName: "All-Season X",
        sku: "TIRE-1",
        options: { mountAndBalance: true, tpms: false, disposal: true },
      },
      detailing: null,
    },
  ],
};

describe("AppointmentConfigurationSummary", () => {
  beforeEach(() => {
    mockedFetch.mockResolvedValue(configuration);
  });

  it("renders nothing while the configuration is loading", () => {
    mockedFetch.mockReturnValue(new Promise(() => undefined));
    const { container } = render(<AppointmentConfigurationSummary appointmentId="appt-1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the appointment has no configured vehicles", async () => {
    mockedFetch.mockResolvedValue({ vehicles: [] });
    const { container } = render(<AppointmentConfigurationSummary appointmentId="appt-1" />);
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledWith("appt-1"));
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the vehicle identity with plate and VIN badges", async () => {
    render(<AppointmentConfigurationSummary appointmentId="appt-1" />);
    expect(await screen.findByText("2020 Toyota Camry")).toBeInTheDocument();
    expect(screen.getByText("Plate ABC123")).toBeInTheDocument();
    expect(screen.getByText("VIN 1HGCM82633A004352")).toBeInTheDocument();
  });

  it("renders the oil service specifications", async () => {
    render(<AppointmentConfigurationSummary appointmentId="appt-1" />);
    await screen.findByText("Oil service specifications");
    expect(screen.getByText("5W-20 Full Synthetic")).toBeInTheDocument();
    expect(screen.getByText("4.5 qt")).toBeInTheDocument();
    expect(screen.getByText(/Capacity source: MANUAL/)).toBeInTheDocument();
  });

  it("renders the tire fitment summary with selected options", async () => {
    render(<AppointmentConfigurationSummary appointmentId="appt-1" />);
    const summary = await screen.findByText(/Front 205\/65R16 × 4/);
    expect(summary.textContent).toContain("All-Season X (TIRE-1)");
    expect(summary.textContent).toContain("Mount & balance");
    expect(summary.textContent).toContain("Disposal");
    expect(summary.textContent).not.toContain("TPMS");
  });

  it("renders nothing when the fetch fails", async () => {
    mockedFetch.mockRejectedValue(new Error("network down"));
    const { container } = render(<AppointmentConfigurationSummary appointmentId="appt-1" />);
    await waitFor(() => expect(mockedFetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
