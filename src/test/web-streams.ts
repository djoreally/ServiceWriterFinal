/**
 * Test-only helper (part 1 of 2, see `./web-globals`).
 *
 * Installs Node's web-stream globals. This module must be imported (and its
 * body evaluated) BEFORE the undici bundle imported by `./web-globals`,
 * because ES imports are all evaluated before any module body runs.
 */
import {
  ReadableStream as NodeReadableStream,
  TransformStream as NodeTransformStream,
  WritableStream as NodeWritableStream,
} from "node:stream/web";

if (typeof globalThis.ReadableStream === "undefined") {
  globalThis.ReadableStream = NodeReadableStream as unknown as typeof globalThis.ReadableStream;
}
if (typeof globalThis.WritableStream === "undefined") {
  globalThis.WritableStream = NodeWritableStream as unknown as typeof globalThis.WritableStream;
}
if (typeof globalThis.TransformStream === "undefined") {
  globalThis.TransformStream = NodeTransformStream as unknown as typeof globalThis.TransformStream;
}
