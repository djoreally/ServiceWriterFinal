/**
 * Test-only helper: installs real WHATWG `Request`/`Response` globals.
 *
 * The jsdom test environment does not provide them, but `next/server`
 * subclasses them at import time (`class NextResponse extends Response`),
 * so any suite importing `@/server/api` (directly or transitively) crashes
 * with `ReferenceError: Request is not defined`.
 *
 * Import this module FIRST in such suites — module evaluation is depth-first
 * in import order, so the globals are installed before `next/server` loads.
 * The implementations come from the undici bundle Next itself ships for the
 * edge runtime (which needs the web-stream globals installed by
 * `./web-streams` first); only globals that are missing are installed.
 */
import "./web-streams";

// @ts-expect-error - bundled Next edge-runtime ponyfill ships no type declarations
import { Request as EdgeRequest, Response as EdgeResponse } from "../../node_modules/next/dist/compiled/@edge-runtime/primitives/fetch.js";

if (typeof globalThis.Request === "undefined") {
  globalThis.Request = EdgeRequest as typeof globalThis.Request;
}
if (typeof globalThis.Response === "undefined") {
  globalThis.Response = EdgeResponse as typeof globalThis.Response;
}
