import type { SupabaseClient } from "@supabase/supabase-js";
import {
  recordOperationalAudit,
  requestCorrelationId,
  sanitizeOperationalAuditMetadata,
} from "./audit";

describe("operational audit logging", () => {
  const requestWithId = (requestId: string): Request => ({
    headers: { get: (name: string) => name === "x-request-id" ? requestId : null },
  }) as unknown as Request;

  it("accepts safe request IDs and replaces unsafe IDs", () => {
    expect(requestCorrelationId(requestWithId("req_123:abc"))).toBe("req_123:abc");

    expect(requestCorrelationId(requestWithId("Bearer secret value"))).not.toBe("Bearer secret value");
  });

  it("drops sensitive and malformed metadata and bounds retained strings", () => {
    const metadata = sanitizeOperationalAuditMetadata({
      invited_role: "technician",
      email: "customer@example.test",
      access_token: "secret",
      "bad key": "not-safe",
      note: "x".repeat(600),
      count: 3,
    });

    expect(metadata).toEqual({ invited_role: "technician", note: "x".repeat(512), count: 3 });
  });

  it("writes only sanitized audit fields and reports persistence", async () => {
    const insert = jest.fn().mockResolvedValue({ error: null });
    const from = jest.fn().mockReturnValue({ insert });
    const request = requestWithId("unsafe request id");

    await expect(recordOperationalAudit({
      supabase: { from } as unknown as SupabaseClient,
      request,
      workspaceId: "workspace-1",
      actorUserId: "user-1",
      action: "invitation.created",
      entityType: "invitation",
      entityId: "invitation-1",
      metadata: { invited_role: "technician", email: "private@example.test" },
    })).resolves.toMatchObject({ persisted: true });

    expect(from).toHaveBeenCalledWith("audit_events");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      action: "invitation.created",
      entity_type: "invitation",
      request_id: null,
      metadata: { invited_role: "technician" },
    }));
  });

  it("rejects malformed event names before a database write", async () => {
    const from = jest.fn();
    await expect(recordOperationalAudit({
      supabase: { from } as unknown as SupabaseClient,
      action: "Invitation Created",
      entityType: "invitation",
    })).rejects.toThrow("Invalid operational audit action");
    expect(from).not.toHaveBeenCalled();
  });
});
