/**
 * errorResponse <-> Sentry capture contract.
 *
 * The envelope's mapping decides what is reportable: deliberately mapped
 * 4xx outcomes (validation, not-found, conflicts, 4xx ApiErrors, 4xx
 * passthroughs) must NEVER capture; the 5xx class — the internal_error
 * fallthrough, unmasked PostgREST 503s, 5xx ApiErrors, 5xx passthroughs —
 * must capture exactly once with the envelope's real code and the request
 * context the caller supplied.
 */
jest.mock("@/lib/supabase", () => ({
  createSupabaseRequestClient: jest.fn(),
  createSupabaseServerClient: jest.fn(),
}));

jest.mock("@/server/sentry", () => ({
  captureServerError: jest.fn(),
  initSentry: jest.fn(() => false),
}));

// Must run before `@/server/api` pulls in `next/server`, which subclasses
// the Request/Response globals at import time.
import "@/test/web-globals";

import { z } from "zod";
import { ApiError, errorResponse } from "@/server/api";
import { captureServerError } from "@/server/sentry";

const captureMock = captureServerError as unknown as jest.Mock;
const CTX = { route: "/api/v1/appointments/abc/start", method: "POST" };

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore?.();
});

describe("errorResponse Sentry capture", () => {
  it("captures the internal_error fallthrough once, with context", async () => {
    const res = errorResponse(new Error("something deep broke"), CTX);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: { code: "internal_error", message: "An unexpected error occurred." },
    });
    expect(captureMock).toHaveBeenCalledTimes(1);
    expect(captureMock).toHaveBeenCalledWith(expect.any(Error), {
      ...CTX,
      code: "internal_error",
      status: 500,
    });
  });

  it("preserves an unmapped SQLSTATE as the capture code (the 42703 class)", () => {
    const res = errorResponse({ code: "42703", message: "column appointments.tax_amount does not exist" }, CTX);

    expect(res.status).toBe(500);
    expect(captureMock).toHaveBeenCalledTimes(1);
    expect(captureMock).toHaveBeenCalledWith(expect.anything(), { ...CTX, code: "42703", status: 500 });
  });

  it("captures unmasked PostgREST failures (PGRST -> 503) with their real code", () => {
    const res = errorResponse(
      { code: "PGRST202", message: "Could not find the function public.start_appointment_job_v1 in the schema cache" },
      CTX,
    );

    expect(res.status).toBe(503);
    expect(captureMock).toHaveBeenCalledTimes(1);
    expect(captureMock).toHaveBeenCalledWith(expect.anything(), { ...CTX, code: "PGRST202", status: 503 });
  });

  it("captures a 5xx ApiError but not a 4xx ApiError", () => {
    expect(errorResponse(new ApiError(503, "upstream down", "upstream_down"), CTX).status).toBe(503);
    expect(captureMock).toHaveBeenCalledTimes(1);
    expect(captureMock).toHaveBeenCalledWith(expect.any(Error), { ...CTX, code: "upstream_down", status: 503 });

    captureMock.mockClear();
    expect(errorResponse(new ApiError(404, "nope", "not_found"), CTX).status).toBe(404);
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("captures a 5xx status passthrough but not a 4xx one", () => {
    expect(errorResponse({ status: 502, message: "bad gateway" }, CTX).status).toBe(502);
    expect(captureMock).toHaveBeenCalledTimes(1);

    captureMock.mockClear();
    expect(errorResponse({ status: 422, message: "unprocessable" }, CTX).status).toBe(422);
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("never captures deliberately mapped 4xx outcomes", () => {
    const schema = z.object({ a: z.string() });
    const parsed = schema.safeParse({ a: 1 });
    if (parsed.success) throw new Error("expected parse failure");
    expect(errorResponse(parsed.error, CTX).status).toBe(400);

    expect(errorResponse({ code: "PGRST116", message: "no rows" }, CTX).status).toBe(404);
    expect(errorResponse({ code: "23505", message: "duplicate" }, CTX).status).toBe(409);
    expect(errorResponse({ code: "23503", message: "fk" }, CTX).status).toBe(409);
    expect(errorResponse({ code: "P0001", message: "INVALID_TRANSITION: no" }, CTX).status).toBe(409);
    expect(errorResponse({ code: "23P01", message: "overlap" }, CTX).status).toBe(409);
    expect(errorResponse({ code: "22P02", message: "bad uuid" }, CTX).status).toBe(400);

    expect(captureMock).not.toHaveBeenCalled();
  });

  it("behaves identically with no request context supplied", async () => {
    const res = errorResponse(new Error("bare"));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: { code: "internal_error", message: "An unexpected error occurred." },
    });
    expect(captureMock).toHaveBeenCalledWith(expect.any(Error), { code: "internal_error", status: 500 });
  });
});
