// Polyfill for Next.js API route tests. The jest jsdom environment does not
// define the Web Fetch API globals (Request/Response/Headers), but every
// app/api route module imports next/server, whose classes extend those
// globals at module load time. Import this module FIRST (before any route
// module import) so the globals exist. ES imports execute in order, so a
// leading side-effect import runs before the route modules below it.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodeFetch = require("node-fetch") as {
  Request: typeof Request;
  Response: typeof Response;
  Headers: typeof Headers;
};

const g = globalThis as unknown as Record<string, unknown>;
if (typeof g.Request === "undefined") {
  g.Request = nodeFetch.Request;
  g.Response = nodeFetch.Response;
  g.Headers = nodeFetch.Headers;
}

// node-fetch v2 lacks the static Response.json() that NextResponse.json()
// delegates to. Install a spec-shaped equivalent.
const InstalledResponse = g.Response as unknown as {
  json?: (body: unknown, init?: Record<string, unknown>) => unknown;
  new (body?: unknown, init?: Record<string, unknown>): unknown;
};
if (typeof InstalledResponse.json !== "function") {
  InstalledResponse.json = (body: unknown, init?: Record<string, unknown>) => {
    const HeadersCtor = g.Headers as unknown as new (
      init?: unknown,
    ) => { get(name: string): string | null; set(name: string, value: string): void };
    const headers = new HeadersCtor((init ?? {}).headers);
    if (!headers.get("content-type")) headers.set("content-type", "application/json");
    return new InstalledResponse(JSON.stringify(body), { ...(init ?? {}), headers });
  };
}

export {};
