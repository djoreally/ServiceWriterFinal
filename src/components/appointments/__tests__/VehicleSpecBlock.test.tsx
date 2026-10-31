import { render, screen } from "@testing-library/react";
import { VehicleSpecBlock } from "@/components/appointments/VehicleSpecBlock";
import type { BookingVehicleConfiguration } from "@/lib/booking-configuration";

// Phase 1 / B4 (T-2/T-3): every vehicle renders its merged working spec
// with an honest state chip and per-field provenance. A missing value is
// named as missing — the naked "Verify" placeholder never appears.

const jaguar: BookingVehicleConfiguration = {
  clientVehicleId: "cv-jag",
  vehicle: { year: "2020", make: "Jaguar", model: "F-PACE", licensePlate: "JAG1", vin: "SADCJ2FXXLA648278", mileage: 60020 },
  services: [{ id: "svc-1", name: "Full Synthetic Oil Change", price: 119, quantity: 1 }],
  oil: { engine: "2.0L I4", oilType: "0W-20 Full Synthetic", oilCapacity: "5.8 qt", oilFilter: "OE filter" },
  specStatus: "verified",
  specSources: { engine: "learned", oilType: "learned", oilCapacity: "learned", oilFilter: "learned" },
};

const crosstrek: BookingVehicleConfiguration = {
  clientVehicleId: "cv-sub",
  vehicle: { year: "2025", make: "Subaru", model: "Crosstrek", mileage: 6755 },
  services: [{ id: "svc-2", name: "Full Synthetic Oil Change", price: 119, quantity: 1 }],
  oil: { engine: "2.5L H4", oilType: "0W-20 Full Synthetic", oilCapacity: "4.4 qt" },
  specStatus: "needs_verification",
  specSources: { engine: "catalog", oilType: "catalog", oilCapacity: "catalog" },
};

describe("VehicleSpecBlock — verified vehicle (learned working spec)", () => {
  it("shows the Verified chip and the working capacity as the hero value", () => {
    render(<VehicleSpecBlock vehicle={jaguar} />);
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.getByText("5.8 qt")).toBeInTheDocument();
    expect(screen.getAllByText("From service history").length).toBeGreaterThan(0);
  });

  it("renders the vehicle's own services with prices", () => {
    render(<VehicleSpecBlock vehicle={jaguar} />);
    expect(screen.getByText("Full Synthetic Oil Change")).toBeInTheDocument();
    expect(screen.getByText("$119.00")).toBeInTheDocument();
  });
});

describe("VehicleSpecBlock — needs_verification vehicle", () => {
  it("shows what IS known and names what is still needed", () => {
    render(<VehicleSpecBlock vehicle={crosstrek} />);
    expect(screen.getByText("Needs verification")).toBeInTheDocument();
    expect(screen.getByText("4.4 qt")).toBeInTheDocument();
    expect(screen.getAllByText("From catalog").length).toBeGreaterThan(0);
    expect(screen.getByText(/Still needed: filter/)).toBeInTheDocument();
    expect(screen.getByText("Not recorded")).toBeInTheDocument();
  });

  it("never renders a naked Verify placeholder", () => {
    render(<VehicleSpecBlock vehicle={crosstrek} />);
    expect(screen.queryByText("Verify")).not.toBeInTheDocument();
  });
});

describe("VehicleSpecBlock — from_catalog vehicle", () => {
  it("shows the From catalog state chip", () => {
    render(
      <VehicleSpecBlock
        vehicle={{
          ...jaguar,
          clientVehicleId: "cv-cat",
          specStatus: "from_catalog",
          specSources: { engine: "catalog", oilType: "catalog", oilCapacity: "learned", oilFilter: "catalog" },
        }}
      />,
    );
    // The chip and the per-field provenance both read "From catalog".
    expect(screen.getAllByText("From catalog").length).toBeGreaterThan(0);
    expect(screen.queryByText("Verified")).not.toBeInTheDocument();
  });
});
