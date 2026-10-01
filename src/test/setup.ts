import "@testing-library/jest-dom";
import { TextDecoder, TextEncoder } from "util";

if (!globalThis.TextDecoder) globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
if (!globalThis.TextEncoder) globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
}

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

// The typed API client (`@/lib/api-client`) uses `fetch`, which jsdom does
// not provide. Define a stub that resolves with an empty JSON body so suites
// that exercise the client without mocking `@/lib/api-client` fail on their
// assertions (instead of crashing the worker with `ReferenceError: fetch is
// not defined`). Suites should mock `@/lib/api-client` (or `global.fetch`)
// explicitly for deterministic results.
if (!globalThis.fetch) {
  globalThis.fetch = (async () =>
    ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ data: null }),
      text: async () => JSON.stringify({ data: null }),
    }) as unknown as Response) as typeof globalThis.fetch;
}
