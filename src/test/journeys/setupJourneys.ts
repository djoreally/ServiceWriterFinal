import React, { type ReactNode } from "react";
import { configure } from "@testing-library/react";
import { getFakeBackend, resetFakeBackend } from "./fakeBackend";
import { setupConsoleErrorGuard, restoreConsoleErrorGuard } from "./matchers";
import { resetCurrentAuthUserCache } from "@/lib/auth/current-user";

// Journey suites mount whole route trees; the 1s default is too tight for the
// first render of a suite when workers run in parallel.
configure({ asyncUtilTimeout: 8000 });

// Mock Supabase client module to route through Proxy pointing to active FakeBackend
jest.mock("@/integrations/supabase/client", () => {
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      const backend = getFakeBackend();
      const value: unknown = Reflect.get(backend, prop);
      if (typeof value === "function") {
        return value.bind(backend);
      }
      return value;
    },
  };
  const proxy = new Proxy({}, handler);
  return {
    supabase: proxy,
    productionSupabase: proxy,
    authSupabase: proxy,
    SUPABASE_URL_RESOLVED: "http://localhost:54321",
    SUPABASE_PUBLISHABLE_KEY_RESOLVED: "test-anon-key",
    SUPABASE_PROJECT_ID_RESOLVED: "test-project",
    AUTH_SUPABASE_URL_RESOLVED: "http://localhost:54321",
    AUTH_SUPABASE_PUBLISHABLE_KEY_RESOLVED: "test-anon-key",
    AUTH_SUPABASE_PROJECT_ID_RESOLVED: "test-project",
  };
});

// Mock Mapbox
jest.mock("mapbox-gl", () => ({
  Map: jest.fn(() => ({
    on: jest.fn(),
    off: jest.fn(),
    remove: jest.fn(),
    addControl: jest.fn(),
  })),
  NavigationControl: jest.fn(),
}), { virtual: true });

jest.mock("@mapbox/search-js-react", () => ({
  AddressAutofill: ({ children }: { children: ReactNode }) => children,
}), { virtual: true });

jest.mock("react-map-gl", () => {
  return {
    Map: ({ children }: { children: ReactNode }) => React.createElement("div", null, "Map Mock", children),
    Marker: ({ children }: { children: ReactNode }) => React.createElement("div", null, "Marker", children),
    Popup: ({ children }: { children: ReactNode }) => React.createElement("div", null, "Popup", children),
  };
}, { virtual: true });

// Mock PostHog
jest.mock("posthog-js", () => ({
  init: jest.fn(),
  capture: jest.fn(),
  identify: jest.fn(),
  reset: jest.fn(),
}), { virtual: true });

jest.mock("@posthog/react", () => ({
  usePostHog: () => ({
    capture: jest.fn(),
    identify: jest.fn(),
  }),
  PostHogProvider: ({ children }: { children: ReactNode }) => children,
}), { virtual: true });

// Mock Stripe
jest.mock("@stripe/stripe-js", () => ({
  loadStripe: jest.fn().mockResolvedValue({
    elements: jest.fn(() => ({
      create: jest.fn(() => ({
        mount: jest.fn(),
        unmount: jest.fn(),
        on: jest.fn(),
      })),
    })),
    confirmCardPayment: jest.fn().mockResolvedValue({ paymentIntent: { status: "succeeded" } }),
  }),
}), { virtual: true });

beforeEach(() => {
  resetCurrentAuthUserCache();
  resetFakeBackend();
  setupConsoleErrorGuard();

  // Global fetch guard: no network allowed during journey tests!
  global.fetch = jest.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    throw new Error(`Unhandled network fetch to ${url}. Journey tests must not make network calls.`);
  }) as jest.Mock;
});

afterEach(() => {
  restoreConsoleErrorGuard();
});
