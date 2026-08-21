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
