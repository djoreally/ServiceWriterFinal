import type { SupabaseClient } from "@supabase/supabase-js";
import { recordOperationalAudit, requestCorrelationId } from "@/server/audit";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function requestWith(headers: Record<string, string> = {}): Request {
  return { headers: new Headers(headers) } as unknown as Request;
}

describe("requestCorrelationId", () => {
  it("prefers the x-request-id header when it is safe", () => {
    expect(requestCorrelationId(requestWith({ "x-request-id": "req_abc-123.XYZ" }))).toBe("req_abc-123.XYZ");
  });

  it("falls back to the x-correlation-id header", () => {
    expect(requestCorrelationId(requestWith({ "x-correlation-id": "corr:456" }))).toBe("corr:456");
  });

  it("prefers x-request-id over x-correlation-id", () => {
    const id = requestCorrelationId(requestWith({ "x-request-id": "first", "x-correlation-id": "second" }));
    expect(id).toBe("first");
  });

  it("generates a UUID when no headers are present", () => {
    const id = requestCorrelationId(requestWith());
    expect(id).toMatch(UUID_PATTERN);
  });

  it("generates a UUID when no request is given", () => {
    expect(requestCorrelationId()).toMatch(UUID_PATTERN);
  });

  it("generates a fresh UUID when the header value is unsafe", () => {
    const id = requestCorrelationId(requestWith({ "x-request-id": "not safe at all!" }));
    expect(id).not.toBe("not safe at all!");
    expect(id).toMatch(UUID_PATTERN);
  });

  it("generates a fresh UUID when the header value is too long", () => {
    const long = "a".repeat(129);
    const id = requestCorrelationId(requestWith({ "x-request-id": long }));
    expect(id).not.toBe(long);
    expect(id).toMatch(UUID_PATTERN);
  });
});

describe("recordOperationalAudit", () => {
  function auditSupabase(insertResult: { error: unknown } = { error: null }) {
    const insert = jest.fn().mockResolvedValue(insertResult);
    const from = jest.fn(() => ({ insert }));
    const supabase = { from } as unknown as SupabaseClient;
    return { supabase, from, insert };
  }

  it("inserts the audit row with the expected shape", async () => {
    const { supabase, from, insert } = auditSupabase();
    const request = requestWith({ "x-request-id": "req-1" });

    await recordOperationalAudit({
      supabase,
      request,
      workspaceId: "ws-1",
      actorUserId: "user-1",
      action: "invoice.issued",
      entityType: "invoice",
      entityId: "inv-1",
      metadata: { amount: 129.99, paid: false },
    });

    expect(from).toHaveBeenCalledWith("audit_events");
    expect(insert).toHaveBeenCalledTimes(1);
    const row = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(row).toMatchObject({
      workspace_id: "ws-1",
      actor_user_id: "user-1",
      action: "invoice.issued",
      entity_type: "invoice",
      entity_id: "inv-1",
      correlation_id: "req-1",
      request_id: "req-1",
      metadata: { amount: 129.99, paid: false },
    });
  });

  it("derives the correlation id from x-correlation-id and leaves request_id null", async () => {
    const { insert } = auditSupabase();
    await recordOperationalAudit({
      supabase: { from: jest.fn(() => ({ insert })) } as unknown as SupabaseClient,
      request: requestWith({ "x-correlation-id": "corr-9" }),
      action: "sync",
      entityType: "job",
    });
    const row = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.correlation_id).toBe("corr-9");
    expect(row.request_id).toBeNull();
  });

  it("defaults optional fields to null and metadata to an empty object", async () => {
    const { insert } = auditSupabase();
    await recordOperationalAudit({
      supabase: { from: jest.fn(() => ({ insert })) } as unknown as SupabaseClient,
      action: "sync",
      entityType: "job",
    });
    const row = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(row).toMatchObject({
      workspace_id: null,
      actor_user_id: null,
      entity_id: null,
      metadata: {},
    });
    expect(String(row.correlation_id)).toMatch(UUID_PATTERN);
  });

  it("filters metadata keys to the safe pattern and drops nullish values", async () => {
    const { insert } = auditSupabase();
    await recordOperationalAudit({
      supabase: { from: jest.fn(() => ({ insert })) } as unknown as SupabaseClient,
      action: "sync",
      entityType: "job",
      metadata: {
        ok_key: "kept",
        "unsafe key!": "dropped",
        "another-unsafe;": "dropped",
        nullish: null,
      },
    });
    const row = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.metadata).toEqual({ ok_key: "kept" });
  });

  it("logs and swallows insert errors instead of throwing", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { supabase } = auditSupabase({ error: { message: "db down" } });
      await expect(
        recordOperationalAudit({ supabase, action: "sync", entityType: "job" }),
      ).resolves.toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith("operational_audit_write_failed", "db down");
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
