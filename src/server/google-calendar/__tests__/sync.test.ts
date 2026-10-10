/**
 * Unit tests for the Google Calendar auto-sync hook
 * (src/server/google-calendar/sync.ts).
 *
 * The create/update/delete event mapping lives in the `google-calendar-sync`
 * edge function (Deno); these tests cover the hook's contract: it invokes the
 * edge function with the right payload, records an honest sync status in
 * appointment metadata, skips users who never connected, and — critically —
 * never throws, so a sync failure can never fail the appointment write.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("@/server/api", () => ({
  requireUser: jest.fn(),
}));

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/server/api";
import {
  syncAppointmentToGoogleCalendar,
  queueAppointmentCalendarSync,
  CALENDAR_SYNC_METADATA_KEY,
} from "@/server/google-calendar/sync";

/** The hand-rolled fake only implements the surface the hook uses. */
function asSupabaseClient(fake: ReturnType<typeof makeFakeClient>): SupabaseClient {
  return fake as unknown as SupabaseClient;
}

const mockedRequireUser = requireUser as unknown as jest.Mock;

const APPT_ID = "990e8400-e29b-41d4-a716-446655440001";
const USER_ID = "660e8400-e29b-41d4-a716-446655440001";

interface FakeClientOptions {
  tokenRow?: { sync_enabled: boolean } | null;
  tokenError?: Error | null;
  invokeData?: unknown;
  invokeError?: Error | null;
  initialMetadata?: Record<string, unknown> | null;
}

function makeFakeClient(options: FakeClientOptions = {}) {
  const {
    tokenRow = { sync_enabled: true },
    tokenError = null,
    invokeData = { synced: true, action: "created", google_event_id: "evt-1" },
    invokeError = null,
    initialMetadata = { title: "Existing metadata" },
  } = options;
  const metadataUpdates: Array<Record<string, unknown>> = [];
  let currentMetadata = initialMetadata;

  const invoke = jest.fn(async () => {
    if (invokeError) throw invokeError;
    return { data: invokeData, error: null };
  });

  const appointmentsBuilder: Record<string, unknown> = {};
  const chainable = () => appointmentsBuilder;
  Object.assign(appointmentsBuilder, {
    select: () => chainable(),
    eq: () => chainable(),
    maybeSingle: async () => ({ data: { metadata: currentMetadata }, error: null }),
    update: (patch: Record<string, unknown>) => {
      metadataUpdates.push(patch);
      const metadata = patch.metadata as Record<string, unknown>;
      currentMetadata = metadata ?? null;
      return { eq: () => Promise.resolve({ data: null, error: null }) };
    },
  });

  const from = jest.fn((table: string) => {
    if (table === "google_calendar_sync_tokens") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (tokenError) throw tokenError;
              return { data: tokenRow, error: null };
            },
          }),
        }),
      };
    }
    if (table === "appointments") return appointmentsBuilder;
    throw new Error(`unexpected table ${table}`);
  });

  return { from, functions: { invoke }, metadataUpdates };
}

function syncRecord(client: ReturnType<typeof makeFakeClient>) {
  const patch = client.metadataUpdates[0]?.metadata as Record<string, unknown> | undefined;
  return patch?.[CALENDAR_SYNC_METADATA_KEY] as Record<string, unknown> | undefined;
}

beforeEach(() => {
  mockedRequireUser.mockReset();
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("syncAppointmentToGoogleCalendar", () => {
  it("invokes the edge function with the sync payload on appointment create/update", async () => {
    const client = makeFakeClient();
    await syncAppointmentToGoogleCalendar({ supabase: asSupabaseClient(client), userId: USER_ID, appointmentId: APPT_ID });

    expect(client.functions.invoke).toHaveBeenCalledWith("google-calendar-sync", {
      body: { mode: "sync_appointment", appointment: APPT_ID },
    });
  });

  it("records a synced status with the edge-function action and event id, preserving other metadata", async () => {
    const client = makeFakeClient();
    await syncAppointmentToGoogleCalendar({ supabase: asSupabaseClient(client), userId: USER_ID, appointmentId: APPT_ID });

    const record = syncRecord(client);
    expect(record?.status).toBe("synced");
    expect(record?.action).toBe("created");
    expect(record?.google_event_id).toBe("evt-1");
    expect(typeof record?.at).toBe("string");
    // Pre-existing metadata keys survive the merge.
    const merged = client.metadataUpdates[0]?.metadata as Record<string, unknown>;
    expect(merged.title).toBe("Existing metadata");
  });

  it("records a deleted action for cancellations (edge function deletes the event)", async () => {
    const client = makeFakeClient({
      invokeData: { synced: true, action: "deleted", google_event_id: "evt-1" },
    });
    await syncAppointmentToGoogleCalendar({ supabase: asSupabaseClient(client), userId: USER_ID, appointmentId: APPT_ID });

    const record = syncRecord(client);
    expect(record?.status).toBe("synced");
    expect(record?.action).toBe("deleted");
  });

  it("skips silently when the user never connected Google Calendar (no failure recorded)", async () => {
    const client = makeFakeClient({ tokenRow: null });
    await syncAppointmentToGoogleCalendar({ supabase: asSupabaseClient(client), userId: USER_ID, appointmentId: APPT_ID });

    expect(client.functions.invoke).not.toHaveBeenCalled();
    expect(client.metadataUpdates).toHaveLength(0);
  });

  it("skips silently when sync is disabled for the user", async () => {
    const client = makeFakeClient({ tokenRow: { sync_enabled: false } });
    await syncAppointmentToGoogleCalendar({ supabase: asSupabaseClient(client), userId: USER_ID, appointmentId: APPT_ID });

    expect(client.functions.invoke).not.toHaveBeenCalled();
    expect(client.metadataUpdates).toHaveLength(0);
  });

  it("records a failed status — and never throws — when the edge function errors", async () => {
    const client = makeFakeClient({ invokeError: new Error("Google Calendar API is down") });

    await expect(
      syncAppointmentToGoogleCalendar({ supabase: asSupabaseClient(client), userId: USER_ID, appointmentId: APPT_ID }),
    ).resolves.toBeUndefined();

    const record = syncRecord(client);
    expect(record?.status).toBe("failed");
    expect(record?.error).toBe("Google Calendar API is down");
    expect(typeof record?.at).toBe("string");
  });

  it("never throws when the token lookup itself fails", async () => {
    const client = makeFakeClient({ tokenError: new Error("database unavailable") });

    await expect(
      syncAppointmentToGoogleCalendar({ supabase: asSupabaseClient(client), userId: USER_ID, appointmentId: APPT_ID }),
    ).resolves.toBeUndefined();
    expect(client.functions.invoke).not.toHaveBeenCalled();
  });
});

describe("queueAppointmentCalendarSync", () => {
  it("syncs under the authenticated caller", async () => {
    const client = makeFakeClient();
    mockedRequireUser.mockResolvedValue({ supabase: asSupabaseClient(client), user: { id: USER_ID } });

    await queueAppointmentCalendarSync(({ headers: { get: () => null } } as unknown as Request), APPT_ID);

    expect(mockedRequireUser).toHaveBeenCalled();
    expect(client.functions.invoke).toHaveBeenCalledWith("google-calendar-sync", {
      body: { mode: "sync_appointment", appointment: APPT_ID },
    });
  });

  it("skips silently (never throws) for unauthenticated contexts like public booking", async () => {
    mockedRequireUser.mockRejectedValue(new Error("Authentication required"));

    await expect(
      queueAppointmentCalendarSync(({ headers: { get: () => null } } as unknown as Request), APPT_ID),
    ).resolves.toBeUndefined();
  });
});
