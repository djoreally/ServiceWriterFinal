/**
 * Sentry wiring unit tests (src/server/sentry.ts).
 *
 * The module reads `SENTRY_DSN` from the environment and keeps a
 * once-only init flag, so each case re-imports it with a fresh module
 * registry and a mocked `@sentry/node`.
 */
jest.mock("@sentry/node", () => {
  const scope = { setTag: jest.fn(), setContext: jest.fn() };
  return {
    init: jest.fn(),
    captureException: jest.fn(),
    withScope: jest.fn((cb: (s: typeof scope) => void) => cb(scope)),
    __scope: scope,
  };
});

interface SentryMock {
  init: jest.Mock;
  captureException: jest.Mock;
  withScope: jest.Mock;
  __scope: { setTag: jest.Mock; setContext: jest.Mock };
}

const FAKE_DSN = "https://fake-public-key@o0.ingest.us.sentry.io/0";

async function loadSentry(dsn: string | undefined) {
  jest.resetModules();
  if (dsn === undefined) delete process.env.SENTRY_DSN;
  else process.env.SENTRY_DSN = dsn;
  const mod = await import("@/server/sentry");
  const sentryMock = (await import("@sentry/node")) as unknown as SentryMock;
  return { mod, sentryMock };
}

const originalDsn = process.env.SENTRY_DSN;

afterEach(() => {
  if (originalDsn === undefined) delete process.env.SENTRY_DSN;
  else process.env.SENTRY_DSN = originalDsn;
});

describe("sentry wiring with SENTRY_DSN unset", () => {
  it("never initializes the SDK and capture is a strict no-op", async () => {
    const { mod, sentryMock } = await loadSentry(undefined);

    expect(mod.initSentry()).toBe(false);
    expect(sentryMock.init).not.toHaveBeenCalled();

    mod.captureServerError(new Error("boom"), { code: "internal_error", status: 500 });
    expect(sentryMock.captureException).not.toHaveBeenCalled();
    expect(sentryMock.withScope).not.toHaveBeenCalled();
  });
});

describe("sentry wiring with SENTRY_DSN set", () => {
  it("initializes once with conservative, errors-only options", async () => {
    const { mod, sentryMock } = await loadSentry(FAKE_DSN);

    expect(mod.initSentry()).toBe(true);
    expect(mod.initSentry()).toBe(true);
    expect(sentryMock.init).toHaveBeenCalledTimes(1);
    expect(sentryMock.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: FAKE_DSN,
        sendDefaultPii: false,
        tracesSampleRate: 0,
        sampleRate: 1.0,
      }),
    );
  });

  it("captures with the error code and request context as tags", async () => {
    const { mod, sentryMock } = await loadSentry(FAKE_DSN);
    const failure = new Error("column appointments.tax_amount does not exist");

    mod.captureServerError(failure, {
      code: "42703",
      status: 500,
      route: "/api/v1/appointments/abc/start",
      method: "POST",
      workspaceId: "22222222-2222-4222-8222-222222222222",
    });

    expect(sentryMock.captureException).toHaveBeenCalledTimes(1);
    expect(sentryMock.captureException).toHaveBeenCalledWith(failure);
    expect(sentryMock.__scope.setTag).toHaveBeenCalledWith("error_code", "42703");
    expect(sentryMock.__scope.setTag).toHaveBeenCalledWith("http_status", "500");
    expect(sentryMock.__scope.setTag).toHaveBeenCalledWith("route", "/api/v1/appointments/abc/start");
    expect(sentryMock.__scope.setTag).toHaveBeenCalledWith("method", "POST");
    expect(sentryMock.__scope.setContext).toHaveBeenCalledWith("workspace", {
      id: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("wraps non-Error values in an Error carrying their message", async () => {
    const { mod, sentryMock } = await loadSentry(FAKE_DSN);

    mod.captureServerError({ message: "gateway exploded" }, { code: "internal_error", status: 500 });

    expect(sentryMock.captureException).toHaveBeenCalledTimes(1);
    const captured = sentryMock.captureException.mock.calls[0][0] as Error;
    expect(captured).toBeInstanceOf(Error);
    expect(captured.message).toBe("gateway exploded");
  });
});
