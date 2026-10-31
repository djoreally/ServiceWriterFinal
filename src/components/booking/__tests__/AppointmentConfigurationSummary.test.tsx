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

  it("renders the odometer from the vehicle record in the same block", async () => {
    mockedFetch.mockResolvedValue({
      vehicles: [
        {
          ...configuration.vehicles[0],
          vehicle: { ...configuration.vehicles[0].vehicle, mileage: 60020 },
        },
      ],
    });
    render(<AppointmentConfigurationSummary appointmentId="appt-1" />);
    expect(await screen.findByText("Odometer 60,020 mi")).toBeInTheDocument();
  });

  it("renders the oil service specifications", async () => {
    render(<AppointmentConfigurationSummary appointmentId="appt-1" />);
    await screen.findByText("Oil service specifications");
    expect(screen.getByText("5W-20 Full Synthetic")).toBeInTheDocument();
    expect(screen.getByText("4.5 qt")).toBeInTheDocument();
    // The capacity-source provenance line was removed by the appointment
    // UI cleanup (42f13779d); the spec grid shows engine and filter.
    expect(screen.getAllByText("2.5L I4").length).toBeGreaterThan(0);
    expect(screen.getByText("Spin-on standard")).toBeInTheDocument();
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

  // Phase 1 / B4: EVERY vehicle on the job renders with its merged working
  // spec and its specStatus state — verified and needs_verification side
  // by side (the two-vehicle job shape).
  it("renders every vehicle with its spec status state", async () => {
    mockedFetch.mockResolvedValue({
      vehicles: [
        {
          clientVehicleId: "cv-jag",
          vehicle: { year: 2020, make: "Jaguar", model: "F-PACE", vin: "SADCJ2FXXLA648278", mileage: 60020 },
          oil: { engine: "2.0L I4", oilType: "0W-20 Full Synthetic", oilCapacity: "5.8 qt", oilFilter: "OE filter" },
          specStatus: "verified",
          specSources: { engine: "learned", oilType: "learned", oilCapacity: "learned", oilFilter: "learned" },
        },
        {
          clientVehicleId: "cv-sub",
          vehicle: { year: 2025, make: "Subaru", model: "Crosstrek", mileage: 6755 },
          oil: { engine: "2.5L H4", oilType: "0W-20 Full Synthetic", oilCapacity: "4.4 qt" },
          specStatus: "needs_verification",
          specSources: { engine: "catalog", oilType: "catalog", oilCapacity: "catalog" },
        },
      ],
    });
    render(<AppointmentConfigurationSummary appointmentId="appt-2" />);
    expect(await screen.findByText("2020 Jaguar F-PACE")).toBeInTheDocument();
    expect(screen.getByText("2025 Subaru Crosstrek")).toBeInTheDocument();
    expect(screen.getByText("2 vehicles on this job")).toBeInTheDocument();
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.getByText("5.8 qt")).toBeInTheDocument();
    expect(screen.getByText("Needs verification")).toBeInTheDocument();
    expect(screen.getByText(/Still needed: filter/)).toBeInTheDocument();
    expect(screen.queryByText("Verify")).not.toBeInTheDocument();
  });
});
