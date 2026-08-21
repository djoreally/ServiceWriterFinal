import {
  buildFleetMetadata,
  buildFleetNotes,
  emptyFleetLine,
  getFleetQuantityMultiplier,
  parseFleetNotes,
  readFleetQuoteStorage,
} from "@/lib/fleet-quote";

describe("fleet-quote helpers", () => {
  it("round-trips fleet notes payload and keeps user notes", () => {
    const rows = [
      {
        ...emptyFleetLine(),
        vin: "1HGCM82633A123456",
        year: "2022",
        make: "Ford",
        model: "Transit",
        quantity: "4",
        decode_status: "decoded" as const,
      },
    ];

    const saved = buildFleetNotes("Commercial customer", rows);
    const parsed = parseFleetNotes(saved);

    expect(parsed.userNotes).toBe("Commercial customer");
    expect(parsed.fleetVehicles).toHaveLength(1);
    expect(parsed.fleetVehicles[0].vin).toBe("1HGCM82633A123456");
    expect(parsed.fleetVehicles[0].quantity).toBe("4");
  });

  it("computes multiplier from active fleet rows only", () => {
    const rows = [
      { ...emptyFleetLine(), year: "2021", make: "Ford", model: "F-150", quantity: "2" },
      { ...emptyFleetLine(), year: "2020", make: "Chevrolet", model: "Express", quantity: "3" },
      { ...emptyFleetLine() }, // inactive row should be ignored
    ];

    expect(getFleetQuantityMultiplier(rows)).toBe(5);
  });

  it("prefers json fleet_metadata and falls back to legacy note markers", () => {
    const metadataRows = [
      { ...emptyFleetLine(), year: "2025", make: "Ford", model: "Transit", quantity: "2" },
    ];
    const legacyRows = [
      { ...emptyFleetLine(), year: "2021", make: "Chevrolet", model: "Express", quantity: "7" },
    ];

    const mixed = readFleetQuoteStorage({
      notes: buildFleetNotes("Legacy notes", legacyRows),
      fleet_metadata: buildFleetMetadata(metadataRows),
    });
    expect(mixed.userNotes).toBe("Legacy notes");
    expect(mixed.fleetVehicles).toHaveLength(1);
    expect(mixed.fleetVehicles[0].year).toBe("2025");
    expect(mixed.fleetVehicles[0].quantity).toBe("2");

    const legacyOnly = readFleetQuoteStorage({
      notes: buildFleetNotes("Legacy only", legacyRows),
      fleet_metadata: null,
    });
    expect(legacyOnly.userNotes).toBe("Legacy only");
    expect(legacyOnly.fleetVehicles[0].year).toBe("2021");
    expect(legacyOnly.fleetVehicles[0].quantity).toBe("7");
  });
});
