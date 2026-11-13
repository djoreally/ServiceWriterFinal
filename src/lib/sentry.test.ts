/**
 * Client Sentry wiring unit tests (src/lib/sentry.ts).
 *
 * The module resolves `VITE_SENTRY_DSN` through `@/lib/runtime-env`
 * (which canonicalizes it to `NEXT_PUBLIC_SENTRY_DSN` and reads
 * `process.env`) and keeps a once-only init flag, so each case
 * re-imports it with a fresh module registry and a mocked
 * `@sentry/react`.
 */
jest.mock("@sentry/react", () => {
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
const CANONICAL_KEY = "NEXT_PUBLIC_SENTRY_DSN";

async function loadSentry(dsn: string | undefined) {
  jest.resetModules();
  delete (globalThis as { __RUNTIME_ENV__?: unknown }).__RUNTIME_ENV__;
  if (dsn === undefined) delete process.env[CANONICAL_KEY];
  else process.env[CANONICAL_KEY] = dsn;
  const mod = await import("@/lib/sentry");
  const sentryMock = (await import("@sentry/react")) as unknown as SentryMock;
  return { mod, sentryMock };
}

const originalDsn = process.env[CANONICAL_KEY];

afterEach(() => {
  if (originalDsn === undefined) delete process.env[CANONICAL_KEY];
  else process.env[CANONICAL_KEY] = originalDsn;
});

describe("client sentry wiring with the DSN unset", () => {
  it("never initializes the SDK and capture is a strict no-op", async () => {
    const { mod, sentryMock } = await loadSentry(undefined);

    expect(mod.initSentry()).toBe(false);
    expect(sentryMock.init).not.toHaveBeenCalled();

    mod.captureClientError(new Error("boom"), { componentStack: "at App" });
    expect(sentryMock.captureException).not.toHaveBeenCalled();
    expect(sentryMock.withScope).not.toHaveBeenCalled();
  });
});

describe("client sentry wiring with the DSN set", () => {
  it("initializes once with conservative, errors-only options", async () => {
    const { mod, sentryMock } = await loadSentry(FAKE_DSN);

    expect(mod.initSentry()).toBe(true);
    expect(sentryMock.init).toHaveBeenCalledTimes(1);
    expect(sentryMock.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: FAKE_DSN,
        tracesSampleRate: 0,
        sendDefaultPii: false,
      }),
    );

    // Once-only: a second call must not re-init.
    expect(mod.initSentry()).toBe(true);
    expect(sentryMock.init).toHaveBeenCalledTimes(1);
  });

  it("forwards captured errors to the SDK with the component stack", async () => {
    const { mod, sentryMock } = await loadSentry(FAKE_DSN);

    const boom = new Error("render boom");
    mod.captureClientError(boom, { componentStack: "at Widget" });

    expect(sentryMock.captureException).toHaveBeenCalledTimes(1);
    expect(sentryMock.captureException).toHaveBeenCalledWith(boom);
    expect(sentryMock.__scope.setContext).toHaveBeenCalledWith("react", {
      componentStack: "at Widget",
    });
  });
});
