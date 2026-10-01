/**
 * Installs web-standard globals (Request, Response, Headers) that the
 * `next/server` module requires at import time but the jsdom test
 * environment does not provide.
 *
 * Uses the Web API implementations Next.js itself ships for the edge
 * runtime (`next/dist/compiled/@edge-runtime/ponyfill`) — no new
 * dependencies, no network. Idempotent.
 *
 * Must run before `next/server` is first required, so call it from inside
 * a `jest.mock("next/server", ...)` factory:
 *
 *   jest.mock("next/server", () => {
 *     require("../test-support/webGlobals").installWebGlobals();
 *     return jest.requireActual("next/server");
 *   });
 */
const NEEDED = ["Headers", "Request", "Response"] as const;

export function installWebGlobals(): void {
  const g = globalThis as Record<string, unknown>;
  // The edge-runtime ponyfill bundle itself requires web streams at load.
  if (typeof g.TextEncoderStream === "undefined") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const web = require("stream/web") as Record<string, unknown>;
    g.TextEncoderStream = web.TextEncoderStream;
    g.TextDecoderStream = web.TextDecoderStream;
  }
  if (typeof g.structuredClone === "undefined") {
    // The ponyfill loader references the bare `structuredClone` identifier
    // at require time; back it with node's v8 serializer.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const v8 = require("v8") as {
      serialize: (v: unknown) => unknown;
      deserialize: (v: unknown) => unknown;
    };
    g.structuredClone = (value: unknown) => v8.deserialize(v8.serialize(value));
  }
  // The ponyfill bundles its own undici, which needs web streams, Blob and
  // File at require time. Source them from node builtins (available in the
  // sandbox via require even though they are absent from the jsdom global).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const webStreams = require("stream/web") as Record<string, unknown>;
  for (const key of [
    "ReadableStream",
    "ReadableStreamDefaultReader",
    "ReadableStreamBYOBReader",
    "ReadableStreamDefaultController",
    "WritableStream",
    "WritableStreamDefaultWriter",
    "WritableStreamDefaultController",
    "TransformStream",
    "TransformStreamDefaultController",
    "ByteLengthQueuingStrategy",
    "CountQueuingStrategy",
  ]) {
    if (typeof g[key] === "undefined" && webStreams[key]) g[key] = webStreams[key];
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeBuffer = require("buffer") as Record<string, unknown>;
  for (const key of ["Blob", "File"]) {
    if (typeof g[key] === "undefined" && nodeBuffer[key]) g[key] = nodeBuffer[key];
  }
  if (NEEDED.every((k) => typeof g[k] !== "undefined")) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ponyfill = require("next/dist/compiled/@edge-runtime/ponyfill") as Record<
    string,
    unknown
  >;
  // Install every ponyfill global the jsdom environment lacks (never
  // overriding what already exists, e.g. jsdom's URL or the fetch stub).
  for (const key of Object.keys(ponyfill)) {
    if (typeof g[key] === "undefined" && typeof ponyfill[key] !== "undefined") {
      g[key] = ponyfill[key];
    }
  }
}
