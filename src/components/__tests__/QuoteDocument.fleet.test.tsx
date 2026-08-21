import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import QuoteDocument from "@/components/QuoteDocument";
import { buildFleetMetadata, emptyFleetLine } from "@/lib/fleet-quote";

jest.mock("@/application/queries/quote-document.query", () => ({
  fetchQuoteDocumentData: jest.fn(),
  sendQuoteEmail: jest.fn(),
}));

jest.mock("@/contexts/RegionalSettingsContext", () => ({
  useRegionalSettings: () => ({
    formatCurrency: (value: number) => `$${value.toFixed(2)}`,
    formatDate: (value: string) => value,
  }),
}));

describe("QuoteDocument fleet rendering", () => {
  it("renders fleet vehicle table from fleet metadata notes", async () => {
    const { fetchQuoteDocumentData } = await import("@/application/queries/quote-document.query");

    const fleetMetadata = buildFleetMetadata([
      {
        ...emptyFleetLine(),
        vin: "1HGCM82633A123456",
        year: "2023",
        make: "Ford",
        model: "Transit",
        quantity: "3",
        engine: "3.5L V6",
        fuel_type: "Gasoline",
        decode_status: "decoded",
      },
    ]);

    (fetchQuoteDocumentData as jest.Mock).mockResolvedValue({
      quote: {
        id: "q1",
        quote_number: "QT-1",
        quote_date: "2026-03-31",
        valid_until: "2026-04-30",
        description: "Fleet service",
        labor_hours: 2,
        labor_cost: 200,
        parts_cost: 100,
        total_cost: 300,
        status: "pending",
        notes: "Handle with priority",
        fleet_metadata: fleetMetadata,
      },
      quoteItems: [],
      customer: {
        name: "Acme Fleet",
        email: "ops@acme.com",
        phone: null,
        address: null,
        created_at: "2026-03-31",
      },
      vehicle: null,
      business: {
        business_name: "Service Writer",
        owner_name: "Owner",
        phone: "555-5555",
        email: "biz@example.com",
        address: "123 Main",
        logo_url: "",
      },
    });

    render(<QuoteDocument quoteId="q1" customerId="c1" vehicleId="v1" onClose={() => undefined} />);

    await waitFor(() => expect(screen.getByText("Fleet Vehicle Details")).toBeInTheDocument());
    expect(screen.getByText("Total Units: 3")).toBeInTheDocument();
    expect(screen.getByText("2023 Ford Transit")).toBeInTheDocument();
    expect(screen.getByText("1HGCM82633A123456")).toBeInTheDocument();
    expect(screen.getByText("Handle with priority")).toBeInTheDocument();
  });
});
