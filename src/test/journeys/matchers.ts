import { getFakeBackend } from "./fakeBackend";

export function expectRpcCalled(rpcName: string, partialArgs?: Record<string, any>) {
  const backend = getFakeBackend();
  const rpcCalls = backend.recordedCalls.filter(
    (c) => c.type === "rpc" && c.target === rpcName
  );

  expect(rpcCalls.length).toBeGreaterThan(0);

  if (partialArgs) {
    const matched = rpcCalls.some((call) => {
      return Object.entries(partialArgs).every(([key, value]) => {
        return JSON.stringify(call.args?.[key]) === JSON.stringify(value);
      });
    });
    expect(matched).toBe(true);
  }
}

export function expectNoPlumbingError() {
  const backend = getFakeBackend();
  const failedCalls = backend.recordedCalls.filter((c) => {
    if (c.args?.error) {
      const msg = String(c.args.error?.message || c.args.error?.code || "");
      return msg.includes("PGRST") || msg.includes("42501") || msg.includes("permission denied");
    }
    return false;
  });
  expect(failedCalls).toEqual([]);
}

let capturedConsoleErrors: string[] = [];
let originalConsoleError: typeof console.error;

export function setupConsoleErrorGuard() {
  capturedConsoleErrors = [];
  originalConsoleError = console.error;
  console.error = (...args: any[]) => {
    const formatted = args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
    capturedConsoleErrors.push(formatted);
  };
}

export function restoreConsoleErrorGuard() {
  if (originalConsoleError) {
    console.error = originalConsoleError;
  }
}

export function expectNoConsoleErrors() {
  const severeErrors = capturedConsoleErrors.filter(
    (e) =>
      !e.includes("React Router Future Flag Warning") &&
      !e.includes("useAuth used outside AuthProvider") &&
      !e.includes("[offline] database init failed") &&
      !e.includes("LokiJSAdapter") &&
      !e.includes("not wrapped in act") &&
      !e.includes("Cockpit fetch error") &&
      !e.includes("RouteErrorBoundary") &&
      !e.includes("The above error occurred in") &&
      !e.includes("unhandled exception") &&
      !e.includes("Failed to fetch fleet map data") &&
      !e.includes("[FleetScheduler] load failed")
  );
  expect(severeErrors).toEqual([]);
}
