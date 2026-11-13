import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

jest.mock("@/lib/api-client", () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
  ApiClientError: class ApiClientError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));

jest.mock("@/lib/auth/current-user", () => ({
  getCurrentAuthUser: jest.fn(),
}));

jest.mock("@/application/queries/settings.query", () => ({
  resolveCurrentWorkspace: jest.fn(),
}));

import {
  CARFAX_FEED_FIELDS,
  formatCarfaxFeed,
} from "@/application/commands/carfax.command";
import type {
  CarfaxExportServiceRecord,
  CarfaxFeedBusiness,
} from "@/application/commands/carfax.command";

/** Parse one pipe-delimited line of double-quoted values ("" = escaped quote). */
function parseFeedLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i < line.length) {
    expect(line[i]).toBe('"');
    let val = "";
    i++;
    while (i < line.length) {
      if (line[i] === '"') {
        if (line[i + 1] === '"') {
          val += '"';
          i += 2;
        } else {
          i++;
          break;
        }
      } else {
        val += line[i];
        i++;
      }
    }
    fields.push(val);
    if (i < line.length) {
      expect(line[i]).toBe("|");
      i++;
    }
  }
  return fields;
}

function fieldIndex(name: string): number {
  return CARFAX_FEED_FIELDS.indexOf(name as never);
}

function fieldOf(line: string, name: string): string {
  return parseFeedLine(line)[fieldIndex(name)];
}

const BUSINESS: CarfaxFeedBusiness = {
  carfax_location_id: "servicewriter01",
  business_name: "MOMS Mobile Oil Change",
  address: "428 Railroad Avenue",
  city: "Ambler",
  state: "Pennsylvania",
  postal_code: "19002",
  phone: "215-767-2125",
  website_url: "https://momsoilchange.com/",
};

function makeService(overrides: Partial<CarfaxExportServiceRecord> = {}): CarfaxExportServiceRecord {
  return {
    id: "rec-1",
    service_number: "SR-1",
    service_date: "2026-02-07",
    service_type: "Service",
    description: "Full Synthetic Oil Change",
    created_at: "2026-02-07T00:00:00.000Z",
    vehicles: {
      vin: "1FTBR1Y86PKB51521",
      make: "Ford",
      model: "Transit",
      year: 2023,
      license_plate: "ZXB-9797",
      plate_state: "PA",
      mileage: 57700,
      odometer_measure: "MI",
    },
    labor_items: [],
    service_items: [],
    ...overrides,
  };
}

describe("CARFAX_FEED_FIELDS", () => {
  it("pins the 24 spec fields in their exact mandated order", () => {
    expect([...CARFAX_FEED_FIELDS]).toEqual([
      "VIN", "RO_OPEN_DATE", "RO_CLOSE_DATE", "MILEAGE", "ODOMETER_MEASURE",
      "RO_INVOICE_NUMBER", "SERVICE_DESCRIPTION", "LABOR_DESCRIPTION",
      "PART_NAME_DESCRIPTION", "PART_QUANTITY", "MAKE", "MODEL", "MODEL_YEAR",
      "PLATE", "PLATE_STATE", "MANAGEMENT_SYSTEM", "LOCATION_ID", "LOCATION_NAME",
      "ADDRESS", "CITY", "STATE", "POSTAL_CODE", "PHONE", "URL",
    ]);
    expect(CARFAX_FEED_FIELDS).toHaveLength(24);
  });

  it("builds the header row from the constant, every name quoted", () => {
    const header = formatCarfaxFeed([], BUSINESS).split("\n")[0];
    expect(header).toBe(CARFAX_FEED_FIELDS.map((f) => `"${f}"`).join("|"));
    expect(header).toBe(
      '"VIN"|"RO_OPEN_DATE"|"RO_CLOSE_DATE"|"MILEAGE"|"ODOMETER_MEASURE"|"RO_INVOICE_NUMBER"|"SERVICE_DESCRIPTION"|"LABOR_DESCRIPTION"|"PART_NAME_DESCRIPTION"|"PART_QUANTITY"|"MAKE"|"MODEL"|"MODEL_YEAR"|"PLATE"|"PLATE_STATE"|"MANAGEMENT_SYSTEM"|"LOCATION_ID"|"LOCATION_NAME"|"ADDRESS"|"CITY"|"STATE"|"POSTAL_CODE"|"PHONE"|"URL"',
    );
  });
});

describe("formatCarfaxFeed — one line per service event", () => {
  it("emits exactly one line for a record with no line items, labor/part empty", () => {
    const lines = formatCarfaxFeed([makeService()], BUSINESS).split("\n");
    expect(lines).toHaveLength(2);
    expect(parseFeedLine(lines[1])).toHaveLength(24);
    expect(fieldOf(lines[1], "LABOR_DESCRIPTION")).toBe("");
    expect(fieldOf(lines[1], "PART_NAME_DESCRIPTION")).toBe("");
    expect(fieldOf(lines[1], "PART_QUANTITY")).toBe("");
  });

  it("pairs the i-th labor line with the i-th part line, record fields repeated", () => {
    const service = makeService({
      labor_items: [{ description: "Oil change labor" }, { description: "Tire rotation" }],
      service_items: [{ description: "Oil filter", quantity: 1 }],
    });
    const lines = formatCarfaxFeed([service], BUSINESS).split("\n");
    expect(lines).toHaveLength(3); // header + 2 event lines
    expect(fieldOf(lines[1], "LABOR_DESCRIPTION")).toBe("Oil change labor");
    expect(fieldOf(lines[1], "PART_NAME_DESCRIPTION")).toBe("Oil filter");
    expect(fieldOf(lines[1], "PART_QUANTITY")).toBe("1");
    expect(fieldOf(lines[2], "LABOR_DESCRIPTION")).toBe("Tire rotation");
    expect(fieldOf(lines[2], "PART_NAME_DESCRIPTION")).toBe("");
    expect(fieldOf(lines[2], "PART_QUANTITY")).toBe("");
    // Record-level fields repeat identically on every event line.
    for (const line of lines.slice(1)) {
      expect(fieldOf(line, "VIN")).toBe("1FTBR1Y86PKB51521");
      expect(fieldOf(line, "RO_INVOICE_NUMBER")).toBe("SR-1");
      expect(fieldOf(line, "LOCATION_ID")).toBe("servicewriter01");
    }
  });

  it("emits one line per part when parts outnumber labor lines", () => {
    const service = makeService({
      labor_items: [{ description: "Brake labor" }],
      service_items: [
        { description: "Front pads", quantity: 1 },
        { description: "Rear pads", quantity: 2 },
      ],
    });
    const lines = formatCarfaxFeed([service], BUSINESS).split("\n");
    expect(lines).toHaveLength(3);
    expect(fieldOf(lines[2], "LABOR_DESCRIPTION")).toBe("");
    expect(fieldOf(lines[2], "PART_NAME_DESCRIPTION")).toBe("Rear pads");
    expect(fieldOf(lines[2], "PART_QUANTITY")).toBe("2");
  });
});

describe("formatCarfaxFeed — quoting and quantities", () => {
  it("doubles embedded double quotes and keeps pipes inside values intact", () => {
    const service = makeService({ description: 'Customer said "use 5W-30" | top off' });
    const dataLine = formatCarfaxFeed([service], BUSINESS).split("\n")[1];
    expect(dataLine).toContain('"Customer said ""use 5W-30"" | top off"');
    expect(parseFeedLine(dataLine)).toHaveLength(24);
    expect(fieldOf(dataLine, "SERVICE_DESCRIPTION")).toBe('Customer said "use 5W-30" | top off');
  });

  it("prints the real part quantity — integers bare, fractions as-is", () => {
    const service = makeService({
      service_items: [
        { description: "Oil", quantity: 6 },
        { description: "Coolant top-off", quantity: 0.5 },
      ],
    });
    const lines = formatCarfaxFeed([service], BUSINESS).split("\n");
    expect(fieldOf(lines[1], "PART_QUANTITY")).toBe("6");
    expect(fieldOf(lines[2], "PART_QUANTITY")).toBe("0.5");
  });

  it("never invents a quantity: a part without one prints empty, not 0", () => {
    const service = makeService({
      service_items: [{ description: "Oil filter", quantity: null }],
    });
    const dataLine = formatCarfaxFeed([service], BUSINESS).split("\n")[1];
    expect(fieldOf(dataLine, "PART_QUANTITY")).toBe("");
  });
});

describe("formatCarfaxFeed — spec normalizations", () => {
  it("uppercases the odometer measure and defaults a missing one to MI", () => {
    const lower = makeService({
      vehicles: { ...makeService().vehicles, odometer_measure: "mi" },
    });
    expect(fieldOf(formatCarfaxFeed([lower], BUSINESS).split("\n")[1], "ODOMETER_MEASURE")).toBe("MI");
    const km = makeService({
      vehicles: { ...makeService().vehicles, odometer_measure: "km" },
    });
    expect(fieldOf(formatCarfaxFeed([km], BUSINESS).split("\n")[1], "ODOMETER_MEASURE")).toBe("KM");
    const missing = makeService({
      vehicles: { ...makeService().vehicles, odometer_measure: null },
    });
    expect(fieldOf(formatCarfaxFeed([missing], BUSINESS).split("\n")[1], "ODOMETER_MEASURE")).toBe("MI");
  });

  it("maps full state names to 2-letter codes for STATE and PLATE_STATE", () => {
    const service = makeService({
      vehicles: { ...makeService().vehicles, plate_state: "Pennsylvania" },
    });
    const dataLine = formatCarfaxFeed([service], BUSINESS).split("\n")[1];
    expect(fieldOf(dataLine, "STATE")).toBe("PA");
    expect(fieldOf(dataLine, "PLATE_STATE")).toBe("PA");
    const coded = makeService({
      vehicles: { ...makeService().vehicles, plate_state: "pa" },
    });
    expect(fieldOf(formatCarfaxFeed([coded], BUSINESS).split("\n")[1], "PLATE_STATE")).toBe("PA");
  });

  it("formats dates zero-padded MM/DD/YYYY and open date equals close date", () => {
    const dataLine = formatCarfaxFeed([makeService()], BUSINESS).split("\n")[1];
    expect(fieldOf(dataLine, "RO_OPEN_DATE")).toBe("02/07/2026");
    expect(fieldOf(dataLine, "RO_CLOSE_DATE")).toBe("02/07/2026");
  });

  it("rounds mileage to the nearest mile and prints empty when unknown", () => {
    const rounded = makeService({
      vehicles: { ...makeService().vehicles, mileage: 57700.6 },
    });
    expect(fieldOf(formatCarfaxFeed([rounded], BUSINESS).split("\n")[1], "MILEAGE")).toBe("57701");
    const unknown = makeService({
      vehicles: { ...makeService().vehicles, mileage: null },
    });
    expect(fieldOf(formatCarfaxFeed([unknown], BUSINESS).split("\n")[1], "MILEAGE")).toBe("");
  });

  it("uppercases and trims the VIN", () => {
    const service = makeService({
      vehicles: { ...makeService().vehicles, vin: " 1ftbr1y86pkb51521 " },
    });
    expect(fieldOf(formatCarfaxFeed([service], BUSINESS).split("\n")[1], "VIN")).toBe("1FTBR1Y86PKB51521");
  });
});

describe("sample diff proof — formatter output vs the validated sample", () => {
  const fixture = JSON.parse(
    readFileSync(join(__dirname, "fixtures", "carfax-sample-services.json"), "utf8"),
  ) as { business: CarfaxFeedBusiness; services: CarfaxExportServiceRecord[] };
  const expected = readFileSync(
    join(__dirname, "fixtures", "carfax-sample-expected.txt"),
    "utf8",
  ).replace(/\n$/, "");

  it("reproduces the validated sample byte-for-byte (LOCATION_ID = servicewriter01)", () => {
    // The fixture represents the same records the sample was curated from:
    // 17 completed records, 18 service events. The curated-out rows
    // (placeholder VIN, duplicate legacy pairs, blob descriptions, the
    // 934,000-mile row) are data defects removed before the sample was
    // validated — they are not part of this fixture by construction.
    expect(fixture.services).toHaveLength(17);
    const actual = formatCarfaxFeed(fixture.services, fixture.business);
    const actualLines = actual.split("\n");
    const expectedLines = expected.split("\n");
    expect(expectedLines).toHaveLength(19); // header + 18 event lines
    for (const line of expectedLines.slice(1)) {
      expect(fieldOf(line, "LOCATION_ID")).toBe("servicewriter01");
      expect(parseFeedLine(line)).toHaveLength(24);
    }
    expect(actualLines).toHaveLength(expectedLines.length);
    // Line-by-line first so a mismatch names the offending line, then the
    // whole-file comparison as the formal zero-diff assertion.
    actualLines.forEach((line, i) => {
      expect({ line: i + 1, actual: line }).toEqual({ line: i + 1, actual: expectedLines[i] });
    });
    expect(actual).toBe(expected);
  });
});
