/**
 * startAppointmentJob — the canonical-RPC-unavailable fallback.
 *
 * Production regression (2026-11-10): the server masked PostgREST's
 * PGRST202 ("start_appointment_job_v1 not in the schema cache") as a
 * generic internal_error, and this command's detector read only the
 * error message — which no longer contained any RPC-unavailable
 * signal — so the designed PATCH fallback never engaged and Start Job
 * was a dead button. The server now preserves the PostgREST code on
 * its error envelope, ApiClientError carries it as `code`, and the
 * detector inspects the code as well as the message.
 *
 * The fallback must stay specific to the RPC-unavailable condition: a
 * genuine internal_error must NOT engage it — silently routing around
 * the canonical transition would bypass its authorization and audit
 * semantics for real server faults.
 */
import { apiClient, ApiClientError } from "@/lib/api-client";
import { nextApi } from "@/lib/nextApiClient";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { startAppointmentJob } from "../appointment-detail.command";

jest.mock("@/lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
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
jest.mock("@/lib/nextApiClient", () => ({
  nextApi: {
    appointments: {
      update: jest.fn(),
      complete: jest.fn(),
      cancel: jest.fn(),
    },
  },
}));
jest.mock("@/application/queries/settings.query", () => ({
  resolveCurrentWorkspace: jest.fn(),
}));
jest.mock("@/lib/posthog/analytics", () => ({
  trackAppointmentStatusChanged: jest.fn(),
}));

const WS_ID = "250c258f-fad6-46e1-86de-3de41a7d4e1a";
const APPT_ID = "c38fef02-5e3a-4853-8303-3f0bceddf1c2";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const patchUpdate = nextApi.appointments.update as jest.Mock;
const resolveWorkspace = resolveCurrentWorkspace as jest.Mock;

function statusRead(status: string) {
  return { data: { status } };
}

describe("startAppointmentJob RPC-unavailable fallback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolveWorkspace.mockResolvedValue({ workspaceId: WS_ID });
    patchUpdate.mockResolvedValue({ data: { id: APPT_ID, status: "in_progress" } });
  });

  it("engages the PATCH fallback on a preserved PGRST202 code, even with an opaque message", async () => {
    // The code alone must be sufficient: the message carries none of
    // the legacy detector's substrings.
    get
      .mockResolvedValueOnce(statusRead("confirmed"))
      .mockResolvedValue(statusRead("in_progress"));
    post.mockRejectedValue(new ApiClientError(503, "PGRST202", "Service temporarily unavailable."));

    const result = await startAppointmentJob(APPT_ID);

    expect(result).toEqual({ success: true, alreadyStarted: false });
    expect(patchUpdate).toHaveBeenCalledWith(APPT_ID, {
      workspace_id: WS_ID,
      status: "in_progress",
    });
  });

  it("still engages the fallback on the legacy message signal", async () => {
    get
      .mockResolvedValueOnce(statusRead("confirmed"))
      .mockResolvedValue(statusRead("in_progress"));
    post.mockRejectedValue(
      new Error("Could not find the function public.start_appointment_job_v1 in the schema cache"),
    );

    const result = await startAppointmentJob(APPT_ID);

    expect(result.success).toBe(true);
    expect(patchUpdate).toHaveBeenCalledTimes(1);
  });

  it("does NOT engage the fallback on a genuine internal_error", async () => {
    get.mockResolvedValue(statusRead("confirmed"));
    post.mockRejectedValue(new ApiClientError(500, "internal_error", "An unexpected error occurred."));

    const result = await startAppointmentJob(APPT_ID);

    expect(result).toEqual({ success: false, error: "An unexpected error occurred." });
    expect(patchUpdate).not.toHaveBeenCalled();
  });

  it("does NOT engage the fallback on other preserved PostgREST codes", async () => {
    get.mockResolvedValue(statusRead("confirmed"));
    post.mockRejectedValue(new ApiClientError(503, "PGRST003", "Timed out acquiring connection from pool"));

    const result = await startAppointmentJob(APPT_ID);

    expect(result.success).toBe(false);
    expect(patchUpdate).not.toHaveBeenCalled();
  });
});
