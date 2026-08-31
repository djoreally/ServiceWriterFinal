const createSupabaseAdminClient = jest.fn();
const sendBookingConfirmation = jest.fn();

class TestResponse {
  status: number;
  private readonly payload: unknown;

  constructor(payload: unknown, init?: { status?: number }) {
    this.payload = payload;
    this.status = init?.status ?? 200;
  }

  async json() {
    return this.payload;
  }
}

jest.mock("@/server/api", () => ({
  json: (payload: unknown, init?: { status?: number }) => new TestResponse(payload, init),
  errorResponse: (error: unknown) => new TestResponse({ error: { message: String(error) } }, { status: 500 }),
}));

jest.mock("@/lib/supabase", () => ({
  createSupabaseAdminClient: (...args: unknown[]) => createSupabaseAdminClient(...args),
}));

jest.mock("@/server/messaging/booking-confirmation", () => ({
  sendBookingConfirmation: (...args: unknown[]) => sendBookingConfirmation(...args),
}));

import { POST } from "../../../app/api/v1/public-booking/[slug]/confirmation/route";

function request(body: unknown) {
  return {
    url: "https://preview.example/api/v1/public-booking/moms/confirmation",
    json: async () => body,
  } as Request;
}

function queryResult(result: unknown) {
  const builder = {
    select: jest.fn(),
    eq: jest.fn(),
    order: jest.fn(),
    limit: jest.fn(),
    single: jest.fn().mockResolvedValue(result),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    insert: jest.fn().mockResolvedValue({ error: null }),
    update: jest.fn(),
    contains: jest.fn(),
  };
  for (const method of ["select", "eq", "order", "limit", "update", "contains"] as const) {
    builder[method].mockReturnValue(builder);
  }
  return builder;
}

describe("public booking confirmation route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sendBookingConfirmation.mockResolvedValue({ status: "accepted", providerMessageId: "em-1" });
  });

  it("binds confirmation delivery to the appointment workspace and guest email", async () => {
    const workspace = queryResult({
      data: { id: "00000000-0000-4000-8000-000000000001", name: "MOMS", timezone: "America/New_York" },
      error: null,
    });
    const bookingSettings = queryResult({
      data: { workspace_id: "00000000-0000-4000-8000-000000000001" },
      error: null,
    });
    const appointment = {
      id: "00000000-0000-4000-8000-000000000002",
      workspace_id: "00000000-0000-4000-8000-000000000001",
      customer_id: null,
      starts_at: "2026-09-01T14:00:00.000Z",
      ends_at: "2026-09-01T15:00:00.000Z",
      status: "confirmed",
      notes: null,
      metadata: { guest_email: "momspublic@gmail.com" },
      created_at: "2026-08-31T00:00:00.000Z",
    };
    const appointments = queryResult({ data: appointment, error: null });
    const consents = queryResult({ data: null, error: null });
    createSupabaseAdminClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === "workspace_settings") return bookingSettings;
        if (table === "workspaces") return workspace;
        if (table === "appointments") return appointments;
        if (table === "messaging_consents") return consents;
        throw new Error(`Unexpected table ${table}`);
      }),
    });

    const response = await POST(request({
        appointment_id: appointment.id,
        email: "MomsPublic@gmail.com",
    }), { params: Promise.resolve({ slug: "moms" }) });

    expect(response.status).toBe(200);
    expect(sendBookingConfirmation).toHaveBeenCalledWith(expect.objectContaining({
      appointment,
      workspaceName: "MOMS",
      workspaceTimezone: "America/New_York",
      recipientEmail: "momspublic@gmail.com",
    }));
    await expect(response.json()).resolves.toEqual({
      data: { status: "accepted", provider_message_id: "em-1" },
    });
  });

  it("does not send when the submitted email is not bound to the appointment", async () => {
    const workspace = queryResult({
      data: { id: "00000000-0000-4000-8000-000000000001", name: "MOMS", timezone: "America/New_York" },
      error: null,
    });
    const bookingSettings = queryResult({
      data: { workspace_id: "00000000-0000-4000-8000-000000000001" },
      error: null,
    });
    const appointments = queryResult({
      data: {
        id: "00000000-0000-4000-8000-000000000002",
        workspace_id: "00000000-0000-4000-8000-000000000001",
        metadata: { guest_email: "right@example.com" },
      },
      error: null,
    });
    createSupabaseAdminClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === "workspace_settings") return bookingSettings;
        if (table === "workspaces") return workspace;
        return appointments;
      }),
    });

    const response = await POST(request({
        appointment_id: "00000000-0000-4000-8000-000000000002",
        email: "wrong@example.com",
    }), { params: Promise.resolve({ slug: "moms" }) });

    expect(response.status).toBe(404);
    expect(sendBookingConfirmation).not.toHaveBeenCalled();
  });

  it("uses the workspace bound to the booking slug instead of the owner's first workspace", async () => {
    const bookingSettings = queryResult({
      data: { workspace_id: "00000000-0000-4000-8000-000000000009" },
      error: null,
    });
    const workspace = queryResult({
      data: { id: "00000000-0000-4000-8000-000000000009", name: "Slug Workspace", timezone: "America/New_York" },
      error: null,
    });
    const appointment = {
      id: "00000000-0000-4000-8000-000000000002",
      workspace_id: "00000000-0000-4000-8000-000000000009",
      customer_id: null,
      starts_at: "2026-09-01T14:00:00.000Z",
      ends_at: "2026-09-01T15:00:00.000Z",
      status: "confirmed",
      notes: null,
      metadata: { guest_email: "customer@example.com" },
      created_at: "2026-08-31T00:00:00.000Z",
    };
    const appointments = queryResult({ data: appointment, error: null });
    const consents = queryResult({ data: null, error: null });
    const from = jest.fn((table: string) => {
      if (table === "workspace_settings") return bookingSettings;
      if (table === "workspaces") return workspace;
      if (table === "appointments") return appointments;
      if (table === "messaging_consents") return consents;
      throw new Error(`Unexpected table ${table}`);
    });
    createSupabaseAdminClient.mockReturnValue({ from });

    const response = await POST(request({
      appointment_id: appointment.id,
      email: "customer@example.com",
    }), { params: Promise.resolve({ slug: "moms" }) });

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledWith("workspace_settings");
    expect(sendBookingConfirmation).toHaveBeenCalledWith(expect.objectContaining({
      appointment,
      workspaceName: "Slug Workspace",
    }));
  });
});
