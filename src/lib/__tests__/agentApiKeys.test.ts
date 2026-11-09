import { AGENT_SCOPES } from "@/server/agent-api/scopes";
import {
  AGENT_SCOPE_OPTIONS,
  ALL_AGENT_SCOPES,
  READ_ONLY_AGENT_SCOPES,
  deriveKeyStatus,
  displayKeyPrefix,
  scopeLabel,
  validateAgentKeyForm,
} from "@/lib/agentApiKeys";

describe("agent scope options", () => {
  it("covers exactly the server's canonical scope list, in order", () => {
    expect(AGENT_SCOPE_OPTIONS.map((option) => option.value)).toEqual([...AGENT_SCOPES]);
    expect(ALL_AGENT_SCOPES).toEqual([...AGENT_SCOPES]);
  });

  it("gives every scope a plain-English label and hint", () => {
    for (const option of AGENT_SCOPE_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
      expect(option.hint.length).toBeGreaterThan(0);
      expect(scopeLabel(option.value)).toBe(option.label);
    }
    expect(scopeLabel("unknown:scope")).toBe("unknown:scope");
  });

  it("read-only preset is exactly the *:read scopes", () => {
    expect(READ_ONLY_AGENT_SCOPES).toEqual(AGENT_SCOPES.filter((scope) => scope.endsWith(":read")));
    expect(READ_ONLY_AGENT_SCOPES).not.toContain("bookings:create");
    expect(READ_ONLY_AGENT_SCOPES).not.toContain("customers:create");
    expect(READ_ONLY_AGENT_SCOPES.length).toBe(9);
  });
});

describe("deriveKeyStatus", () => {
  const now = Date.parse("2026-11-09T12:00:00.000Z");

  it("is active when never revoked and not expired", () => {
    expect(deriveKeyStatus({ revoked_at: null, expires_at: null }, now)).toBe("active");
    expect(deriveKeyStatus({ revoked_at: null, expires_at: "2026-12-01T00:00:00.000Z" }, now)).toBe("active");
  });

  it("is revoked when revoked_at is set, even if it also expired", () => {
    expect(deriveKeyStatus({ revoked_at: "2026-11-01T00:00:00.000Z", expires_at: null }, now)).toBe("revoked");
    expect(deriveKeyStatus({ revoked_at: "2026-11-01T00:00:00.000Z", expires_at: "2026-10-01T00:00:00.000Z" }, now)).toBe("revoked");
  });

  it("is expired once the expiry instant is reached", () => {
    expect(deriveKeyStatus({ revoked_at: null, expires_at: "2026-11-09T12:00:00.000Z" }, now)).toBe("expired");
    expect(deriveKeyStatus({ revoked_at: null, expires_at: "2026-11-09T11:59:59.000Z" }, now)).toBe("expired");
    expect(deriveKeyStatus({ revoked_at: null, expires_at: "2026-11-09T12:00:01.000Z" }, now)).toBe("active");
  });
});

describe("displayKeyPrefix", () => {
  it("marks the stored prefix as partial", () => {
    expect(displayKeyPrefix("sw_live_ab12cd34")).toBe("sw_live_ab12cd34…");
  });
});

describe("validateAgentKeyForm", () => {
  const valid = { name: "Front-desk agent", integrator: "Astro", scopes: ["catalog:read"] };

  it("accepts a complete form", () => {
    expect(validateAgentKeyForm(valid)).toBeNull();
    expect(validateAgentKeyForm({ ...valid, name: "  padded  ", integrator: "  x  " })).toBeNull();
  });

  it("requires a name within the server limit", () => {
    expect(validateAgentKeyForm({ ...valid, name: "   " })).toMatch(/name/i);
    expect(validateAgentKeyForm({ ...valid, name: "n".repeat(121) })).toMatch(/120/);
    expect(validateAgentKeyForm({ ...valid, name: "n".repeat(120) })).toBeNull();
  });

  it("requires an integrator within the server limit", () => {
    expect(validateAgentKeyForm({ ...valid, integrator: "" })).toMatch(/who or what/i);
    expect(validateAgentKeyForm({ ...valid, integrator: "i".repeat(121) })).toMatch(/120/);
  });

  it("requires at least one scope", () => {
    expect(validateAgentKeyForm({ ...valid, scopes: [] })).toMatch(/scope/i);
  });
});
