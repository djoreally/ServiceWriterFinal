import { describe, it, expect } from "@jest/globals";
import {
  decodePlateWithVehicleDatabases,
  decodeVinWithVehicleDatabases,
  mapVehicleDatabasesResponse,
  mapVehicleDatabasesVinResponse,
} from "../vehicle-databases";

describe("mapVehicleDatabasesResponse", () => {
  it("maps the documented US shape nested under data", () => {
    const result = mapVehicleDatabasesResponse({
      status: "success",
      data: {
        VIN: "5UXCR6C09N9K12345",
        License: "ABC1234",
        State: "PA",
        Make: "BMW",
        Model: "X5",
        Year: 2022,
      },
    });
    expect(result).toEqual({
      success: true,
      vehicle: { vin: "5UXCR6C09N9K12345", make: "BMW", model: "X5", year: 2022 },
    });
  });

  it("maps a top-level shape and coerces a string year", () => {
    const result = mapVehicleDatabasesResponse({
      VIN: "1FTNE2EW5MDA12345",
      Make: "Ford",
      Model: "Transit",
      Year: "2023",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.vehicle.year).toBe(2023);
      expect(result.vehicle.vin).toBe("1FTNE2EW5MDA12345");
    }
  });

  it("tolerates lowercase keys", () => {
    const result = mapVehicleDatabasesResponse({
      data: { vin: "3n1cp5cv8pl573760", make: "Nissan", model: "Kicks", year: 2023 },
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.vehicle.vin).toBe("3N1CP5CV8PL573760");
  });

  it("never invents a vehicle: no VIN or no year means not found", () => {
    expect(mapVehicleDatabasesResponse({ data: { Make: "BMW", Year: 2022 } })).toEqual({
      success: false,
      error: "Vehicle not found",
    });
    expect(mapVehicleDatabasesResponse({ data: { VIN: "5UXCR6C09N9K12345" } })).toEqual({
      success: false,
      error: "Vehicle not found",
    });
    expect(mapVehicleDatabasesResponse(null)).toEqual({ success: false, error: "Vehicle not found" });
    expect(mapVehicleDatabasesResponse("junk")).toEqual({ success: false, error: "Vehicle not found" });
  });
});

describe("decodePlateWithVehicleDatabases", () => {
  const okResponse = (payload: unknown) =>
    ({ ok: true, status: 200, json: async () => payload }) as Response;

  it("calls the license-decode endpoint with the key headers", async () => {
    const seen: { url: string; headers: Record<string, string> } = { url: "", headers: {} };
    const fetchFn = async (url: string, init?: RequestInit) => {
      seen.url = url;
      seen.headers = (init?.headers ?? {}) as Record<string, string>;
      return okResponse({ data: { VIN: "5UXCR6C09N9K12345", Make: "BMW", Model: "X5", Year: 2022 } });
    };
    const result = await decodePlateWithVehicleDatabases("ABC 1234", "PA", "secret-key", fetchFn as never);
    expect(seen.url).toBe("https://api.vehicledatabases.com/license-decode/ABC%201234/PA");
    expect(seen.headers["x-AuthKey"]).toBe("secret-key");
    expect(result.success).toBe(true);
  });

  it("reads a 404 as Vehicle not found and other failures as lookup failed", async () => {
    const notFound = async () => ({ ok: false, status: 404, json: async () => ({}) }) as Response;
    expect(await decodePlateWithVehicleDatabases("X", "PA", "k", notFound as never)).toEqual({
      success: false,
      error: "Vehicle not found",
    });
    const broken = async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response;
    expect(await decodePlateWithVehicleDatabases("X", "PA", "k", broken as never)).toEqual({
      success: false,
      error: "Plate lookup failed",
    });
    const offline = async () => {
      throw new Error("network down");
    };
    expect(await decodePlateWithVehicleDatabases("X", "PA", "k", offline as never)).toEqual({
      success: false,
      error: "Plate lookup failed",
    });
  });
});

describe("Vehicle Databases VIN decode", () => {
  it("maps the provider's nested VIN/basic/engine response without fabricating fields", () => {
    expect(mapVehicleDatabasesVinResponse({
      status: "success",
      data: {
        intro: { vin: "5UXCR6C09N9K12345" },
        basic: { make: "BMW", model: "X5", year: "2022", trim: "xDrive40i", body_type: "SUV" },
        engine: { engine_description: "3.0L I6", transmission: "Automatic", fuel_type: "Gasoline" },
      },
    })).toEqual({
      success: true,
      vehicle: {
        vin: "5UXCR6C09N9K12345",
        year: 2022,
        make: "BMW",
        model: "X5",
        trim: "xDrive40i",
        engine: "3.0L I6",
        transmission: "Automatic",
        driveType: null,
        fuelType: "Gasoline",
        bodyClass: "SUV",
      },
    });
  });

  it("calls the documented VIN decode endpoint with the same key header", async () => {
    const seen: { url: string; key: string } = { url: "", key: "" };
    const fetchFn = async (url: string, init?: RequestInit) => {
      seen.url = url;
      seen.key = ((init?.headers ?? {}) as Record<string, string>)["x-AuthKey"];
      return ({
        ok: true,
        status: 200,
        json: async () => ({ data: { vin: "5UXCR6C09N9K12345", year: 2022, make: "BMW", model: "X5", engine: "3.0L I6" } }),
      }) as Response;
    };
    const result = await decodeVinWithVehicleDatabases("5uxcr6c09n9k12345", "secret-key", fetchFn as never);
    expect(seen.url).toBe("https://api.vehicledatabases.com/vin-decode/5UXCR6C09N9K12345");
    expect(seen.key).toBe("secret-key");
    expect(result.success).toBe(true);
  });
});
