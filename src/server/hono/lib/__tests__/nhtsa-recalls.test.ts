/**
 * SW-68: the free NHTSA recall chain behind the booking popup.
 *
 * VIN → vPIC decode → recallsByVehicle. Everything is fail-soft:
 * a bad VIN, a failed decode, an NHTSA error, or a timeout answers
 * { success: false } and never throws — the booking UI reads that
 * as "show nothing" and the booking is never blocked.
 */
import { describe, it, expect, beforeEach } from "@jest/globals";
import {
  clearNhtsaRecallCache,
  lookupRecallsByVin,
  mapNhtsaRecallsResponse,
  modelCandidates,
} from "../nhtsa-recalls";

const TRANSIT_VIN = "1FTBR1Y86PKB51521";
const TRANSIT_VIN_2 = "1FTBR1Y86PKB51522";

function vpicPayload(model = "Transit") {
  return {
    Results: [
      { Variable: "Model Year", Value: "2023" },
      { Variable: "Make", Value: "FORD" },
      { Variable: "Model", Value: model },
      { Variable: "Displacement (L)", Value: "3.5" },
      { Variable: "Engine Number of Cylinders", Value: "6" },
    ],
  };
}

function recallsPayload(count: number) {
  return {
    Count: count,
    Message: "Results returned successfully",
    results: Array.from({ length: count }, (_, i) => ({
      Manufacturer: "Ford Motor Company",
      NHTSACampaignNumber: `2${i}V00000${i}`,
      Component: `COMPONENT ${i}`,
      Summary: `Summary ${i}`,
      Consequence: `Consequence ${i}`,
      Remedy: `Remedy ${i}`,
      ReportReceivedDate: "20/10/2022",
    })),
  };
}

const okResponse = (payload: unknown) =>
  ({ ok: true, status: 200, json: async () => payload }) as Response;

const errorResponse = () =>
  ({ ok: false, status: 500, json: async () => ({}) }) as Response;

/** Fetch mock that routes vPIC vs recalls by URL and records every call. */
function routedFetch(handlers: {
  decode?: (url: string) => Promise<Response>;
  recalls?: (url: string) => Promise<Response>;
}) {
  const calls: string[] = [];
  const fetchFn = async (url: string) => {
    calls.push(url);
    if (url.includes("decodevin")) {
      return handlers.decode ? handlers.decode(url) : okResponse(vpicPayload());
    }
    return handlers.recalls ? handlers.recalls(url) : okResponse(recallsPayload(0));
  };
  return { fetchFn, calls };
}

beforeEach(() => {
  clearNhtsaRecallCache();
});

describe("mapNhtsaRecallsResponse", () => {
  it("maps campaign fields and skips rows with no identifier", () => {
    const campaigns = mapNhtsaRecallsResponse({
      results: [
        {
          NHTSACampaignNumber: "22V791000",
          Component: "ELECTRICAL SYSTEM",
          Summary: "S",
          Consequence: "C",
          Remedy: "R",
          ReportReceivedDate: "20/10/2022",
        },
        { Summary: "orphan row" },
        "junk",
      ],
    });
    expect(campaigns).toEqual([
      {
        campaignNumber: "22V791000",
        component: "ELECTRICAL SYSTEM",
        summary: "S",
        consequence: "C",
        remedy: "R",
        reportReceivedDate: "20/10/2022",
      },
    ]);
  });

  it("treats a well-formed empty results array as a real answer", () => {
    expect(mapNhtsaRecallsResponse({ Count: 0, results: [] })).toEqual([]);
  });

  it("returns null for malformed bodies", () => {
    expect(mapNhtsaRecallsResponse(null)).toBeNull();
    expect(mapNhtsaRecallsResponse("junk")).toBeNull();
    expect(mapNhtsaRecallsResponse({})).toBeNull();
    expect(mapNhtsaRecallsResponse({ results: "nope" })).toBeNull();
  });
});

describe("modelCandidates", () => {
  it("progressively trims suffix words", () => {
    expect(modelCandidates("Transit Cargo Van")).toEqual([
      "Transit Cargo Van",
      "Transit Cargo",
      "Transit",
    ]);
    expect(modelCandidates("Silverado 1500")).toEqual(["Silverado 1500", "Silverado"]);
    expect(modelCandidates("Transit")).toEqual(["Transit"]);
    expect(modelCandidates("  ")).toEqual([]);
  });
});

describe("lookupRecallsByVin", () => {
  it("returns the decoded vehicle and its campaigns (the proven Transit chain)", async () => {
    const { fetchFn, calls } = routedFetch({
      recalls: async () => okResponse(recallsPayload(2)),
    });
    const result = await lookupRecallsByVin(TRANSIT_VIN, fetchFn);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.vehicle).toEqual({ year: 2023, make: "FORD", model: "Transit" });
    expect(result.campaigns).toHaveLength(2);
    expect(result.campaigns[0].component).toBe("COMPONENT 0");
    expect(calls.some((u) => u.includes("decodevin"))).toBe(true);
    expect(calls.some((u) => u.includes("modelYear=2023"))).toBe(true);
  });

  it("answers success with zero campaigns when NHTSA has none on file", async () => {
    const { fetchFn } = routedFetch({ recalls: async () => okResponse(recallsPayload(0)) });
    const result = await lookupRecallsByVin(TRANSIT_VIN, fetchFn);
    expect(result).toEqual({
      success: true,
      vehicle: { year: 2023, make: "FORD", model: "Transit" },
      campaigns: [],
    });
  });

  it("rejects an invalid VIN without any outbound call", async () => {
    const { fetchFn, calls } = routedFetch({});
    for (const bad of ["", "123", "1FTBR1Y86PKB5152I", "1FTBR1Y86PKB515210"]) {
      expect(await lookupRecallsByVin(bad, fetchFn)).toEqual({
        success: false,
        error: "Invalid VIN",
      });
    }
    expect(calls).toHaveLength(0);
  });

  it("fails soft when the VIN does not decode, and never asks for recalls", async () => {
    const { fetchFn, calls } = routedFetch({
      decode: async () =>
        okResponse({
          Results: [
            { Variable: "Model Year", Value: "" },
            { Variable: "Make", Value: "" },
            { Variable: "Model", Value: "" },
          ],
        }),
    });
    const result = await lookupRecallsByVin(TRANSIT_VIN, fetchFn);
    expect(result).toEqual({ success: false, error: "Vehicle not found" });
    expect(calls.some((u) => u.includes("recallsByVehicle"))).toBe(false);
  });

  it("fails soft on an NHTSA HTTP error instead of throwing", async () => {
    const { fetchFn } = routedFetch({ recalls: async () => errorResponse() });
    const result = await lookupRecallsByVin(TRANSIT_VIN, fetchFn);
    expect(result).toEqual({ success: false, error: "Recalls unavailable" });
  });

  it("fails soft when the network call rejects (timeout/abort shape)", async () => {
    const { fetchFn } = routedFetch({
      recalls: async () => {
        throw new Error("The operation was aborted");
      },
    });
    await expect(lookupRecallsByVin(TRANSIT_VIN, fetchFn)).resolves.toEqual({
      success: false,
      error: "Recalls unavailable",
    });
  });

  it("fails soft when the decode call itself rejects", async () => {
    const { fetchFn } = routedFetch({
      decode: async () => {
        throw new Error("network down");
      },
    });
    await expect(lookupRecallsByVin(TRANSIT_VIN, fetchFn)).resolves.toEqual({
      success: false,
      error: "Vehicle not found",
    });
  });

  it("falls back through model-name candidates until one is filed", async () => {
    const triedModels: string[] = [];
    const { fetchFn } = routedFetch({
      decode: async () => okResponse(vpicPayload("Transit Cargo Van")),
      recalls: async (url) => {
        const model = new URL(url).searchParams.get("model") || "";
        triedModels.push(model);
        return okResponse(recallsPayload(model === "Transit" ? 3 : 0));
      },
    });
    const result = await lookupRecallsByVin(TRANSIT_VIN, fetchFn);
    expect(result.success).toBe(true);
    if (result.success) expect(result.campaigns).toHaveLength(3);
    expect(triedModels).toEqual(["Transit Cargo Van", "Transit Cargo", "Transit"]);
  });

  it("caches by year/make/model: a second VIN for the same vehicle skips NHTSA recalls", async () => {
    let recallCalls = 0;
    const { fetchFn } = routedFetch({
      recalls: async () => {
        recallCalls += 1;
        return okResponse(recallsPayload(1));
      },
    });
    const first = await lookupRecallsByVin(TRANSIT_VIN, fetchFn);
    const second = await lookupRecallsByVin(TRANSIT_VIN_2, fetchFn);
    expect(first.success && second.success).toBe(true);
    expect(recallCalls).toBe(1);
  });

  it("does not cache failures — a retry after an outage can succeed", async () => {
    let down = true;
    const { fetchFn } = routedFetch({
      recalls: async () => (down ? errorResponse() : okResponse(recallsPayload(1))),
    });
    expect((await lookupRecallsByVin(TRANSIT_VIN, fetchFn)).success).toBe(false);
    down = false;
    const retry = await lookupRecallsByVin(TRANSIT_VIN, fetchFn);
    expect(retry.success).toBe(true);
    if (retry.success) expect(retry.campaigns).toHaveLength(1);
  });
});
