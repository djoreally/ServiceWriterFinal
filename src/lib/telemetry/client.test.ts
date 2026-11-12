/**
 * Client capture core tests (src/lib/telemetry/client.ts).
 *
 * The module keeps module-level state (init-once, current identity),
 * so each case re-imports it with a fresh module registry and a mocked
 * `@/lib/api-client` — the same pattern as src/lib/sentry.test.ts.
 */
jest.mock("@/lib/api-client", () => ({
  apiRequest: jest.fn(async () => ({})),
}));

interface ApiClientMock {
  apiRequest: jest.Mock;
}

async function loadClient() {
  jest.resetModules();
  localStorage.clear();
  sessionStorage.clear();
  const mod = await import("@/lib/telemetry/client");
  const apiClientMock = (await import("@/lib/api-client")) as unknown as ApiClientMock;
  return { mod, apiClientMock };
}

describe("telemetry client while signed out", () => {
  it("no-ops safely: init, pageview and events send nothing and never throw", async () => {
    const { mod, apiClientMock } = await loadClient();

    expect(mod.isTelemetryIdentified()).toBe(false);
    expect(() => mod.initTelemetry()).not.toThrow();
    expect(() => mod.trackTelemetryPageview()).not.toThrow();
    expect(() => mod.trackTelemetryEvent("click", { target: "button" })).not.toThrow();
    expect(() => mod.resetTelemetry()).not.toThrow();

    expect(apiClientMock.apiRequest).not.toHaveBeenCalled();
  });
});

describe("telemetry client once identified", () => {
  it("sends a pageview carrying identity, workspace, role and the route's entity", async () => {
    const { mod, apiClientMock } = await loadClient();
    window.history.pushState({}, "", "/customers/660e8400-e29b-41d4-a716-446655440001");

    mod.initTelemetry();
    mod.identifyTelemetry({
      userId: "660e8400-e29b-41d4-a716-446655440001",
      email: "kdavis3290@gmail.com",
      workspaceId: "550e8400-e29b-41d4-a716-446655440001",
      role: "viewer",
    });
    expect(mod.isTelemetryIdentified()).toBe(true);

    mod.trackTelemetryPageview();
    expect(apiClientMock.apiRequest).toHaveBeenCalledTimes(1);
    const [path, init] = apiClientMock.apiRequest.mock.calls[0] as [
      string,
      { method: string; body: Record<string, unknown> },
    ];
    expect(path).toBe("/v1/telemetry/events");
    expect(init.method).toBe("POST");
    expect(init.body.event_type).toBe("pageview");
    expect(init.body.workspace_id).toBe("550e8400-e29b-41d4-a716-446655440001");
    expect(typeof init.body.session_id).toBe("string");
    expect((init.body.session_id as string).length).toBeGreaterThan(0);
    expect(typeof init.body.visitor_id).toBe("string");
    expect(init.body.url).toContain("/customers/660e8400-e29b-41d4-a716-446655440001");
    // The record she opened rides along — not just the screen name.
    expect(init.body.metadata).toEqual({
      entity_type: "customer",
      entity_id: "660e8400-e29b-41d4-a716-446655440001",
    });
  });

  it("stops sending after reset (sign-out) and rotates the client session", async () => {
    const { mod, apiClientMock } = await loadClient();
    mod.identifyTelemetry({ userId: "u-1", email: "a@example.com", workspaceId: null, role: null });
    mod.trackTelemetryEvent("click", { target: "button#save", targetText: "Save" });
    expect(apiClientMock.apiRequest).toHaveBeenCalledTimes(1);
    const firstSession = (apiClientMock.apiRequest.mock.calls[0][1] as { body: { session_id: string } }).body.session_id;

    mod.resetTelemetry();
    expect(mod.isTelemetryIdentified()).toBe(false);
    mod.trackTelemetryPageview();
    expect(apiClientMock.apiRequest).toHaveBeenCalledTimes(1);

    // A new identity on the same browser starts a fresh client session.
    mod.identifyTelemetry({ userId: "u-2", email: "b@example.com", workspaceId: null, role: null });
    mod.trackTelemetryPageview();
    expect(apiClientMock.apiRequest).toHaveBeenCalledTimes(2);
    const secondSession = (apiClientMock.apiRequest.mock.calls[1][1] as { body: { session_id: string } }).body.session_id;
    expect(secondSession).not.toBe(firstSession);
  });
});
