/**
 * Shop Agent — ScreenMyCalls booking mirror intake.
 *
 * ScreenMyCalls (the AI receptionist bundled with ServiceWriter) books
 * appointments into the shop's live booking backend (Square or its own
 * calendar). On every completed booking it pushes a signed mirror copy
 * here so the shop can run the job from ServiceWriter. ServiceWriter is
 * NOT the system of record for these bookings — it holds the working
 * copy; the sender's calendar stays authoritative.
 *
 * MULTITENANCY (hard rule): the tenant workspace is resolved SOLELY from
 * the pairing credential the sender presents — the `x-smc-key-id` header
 * selects the `provider_connections` row (provider = "screenmycalls")
 * whose metadata carries the shared secret, and the HMAC signature is
 * verified against THAT row's secret. The workspace_id on the connection
 * row is the only workspace ever written to. The payload may carry
 * advisory identifiers, but they are never read for ownership: a sender
 * can only ever mirror into its own paired workspace.
 *
 * Signature scheme: the platform's outbound-webhook scheme —
 * `x-smc-signature: sha256=<HMAC-SHA256 hex of the raw body>` — with a
 * per-workspace secret minted by the ScreenMyCalls pairing flow. This is
 * deliberately independent of the AgentPhone webhook secret: different
 * provider, different credential, different env-free per-tenant store.
 *
 * Idempotency: the sender's key (call session id + booking reference)
 * arrives as `idempotency_key` and is stored on the appointment's
 * metadata as `external_reference`. A re-delivery finds the existing
 * appointment (scoped to the credential's workspace) and returns it
 * instead of creating a duplicate.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  bookMirroredAppointment,
  findOrCreateCustomerByPhone,
  findOrCreateVehicleForCustomer,
} from "../booking";
import type { ShopAgentSupabase } from "./db";

export const SMC_SIGNATURE_HEADER = "x-smc-signature";
export const SMC_KEY_ID_HEADER = "x-smc-key-id";
export const SMC_EVENT_HEADER = "x-smc-event";
export const SMC_MIRROR_EVENT = "booking.mirrored";
export const SMC_PROVIDER = "screenmycalls";

export interface ScreenMyCallsMirrorDeps {
  supabase: ShopAgentSupabase;
}

export interface ScreenMyCallsMirrorResult {
  status: number;
  body: Record<string, unknown>;
}

interface PairingRow {
  workspaceId: string;
  secret: string;
}

interface MirrorPayload {
  callerName: string;
  callerPhone: string;
  serviceName: string | null;
  startsAt: string;
  endsAt: string | null;
  durationMinutes: number | null;
  timezone: string | null;
  vehicle: { year?: number | null; make?: string | null; model?: string | null } | null;
  serviceAddress: string | null;
  notes: string | null;
  bookingReference: string;
  bookingBackend: string | null;
  callSessionId: string;
  idempotencyKey: string;
}

function fail(status: number, error: string): ScreenMyCallsMirrorResult {
  return { status, body: { ok: false, error } };
}

/**
 * Resolve the pairing (tenant + secret) for a presented key id. The
 * key id is not a secret — it only selects the row; the HMAC check that
 * follows is the authentication.
 */
async function resolvePairing(
  supabase: ShopAgentSupabase,
  keyId: string,
): Promise<PairingRow | null> {
  const { data, error } = await supabase
    .from("provider_connections")
    .select("workspace_id,metadata")
    .eq("provider", SMC_PROVIDER)
    .contains("metadata", { key_id: keyId })
    .limit(1);
  if (error) throw error;
  const row = (data ?? [])[0] as
    | { workspace_id?: unknown; metadata?: Record<string, unknown> | null }
    | undefined;
  if (!row || typeof row.workspace_id !== "string") return null;
  const secret = row.metadata?.secret;
  if (typeof secret !== "string" || !secret) return null;
  return { workspaceId: row.workspace_id, secret };
}

/** Verify `sha256=<hex>` HMAC-SHA256 over the raw body, timing-safe. */
export function verifyScreenMyCallsSignature(
  secret: string,
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader) return false;
  const presented = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : "";
  if (!/^[0-9a-f]{64}$/.test(presented)) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function parsePayload(raw: unknown): MirrorPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  const callerName = str(p.caller_name);
  const callerPhone = str(p.caller_phone);
  const startsAt = str(p.starts_at);
  const bookingReference = str(p.booking_reference);
  const callSessionId = str(p.call_session_id);
  const idempotencyKey = str(p.idempotency_key);
  if (!callerName || !callerPhone || !startsAt || !bookingReference || !callSessionId || !idempotencyKey) {
    return null;
  }
  if (Number.isNaN(Date.parse(startsAt))) return null;

  const endsAt = str(p.ends_at);
  if (endsAt !== null && Number.isNaN(Date.parse(endsAt))) return null;

  const durationRaw = p.duration_minutes;
  const durationMinutes =
    typeof durationRaw === "number" && Number.isFinite(durationRaw) && durationRaw > 0
      ? Math.round(durationRaw)
      : null;

  let vehicle: MirrorPayload["vehicle"] = null;
  if (p.vehicle && typeof p.vehicle === "object" && !Array.isArray(p.vehicle)) {
    const v = p.vehicle as Record<string, unknown>;
    const yearRaw = v.year;
    vehicle = {
      year:
        typeof yearRaw === "number" && Number.isFinite(yearRaw)
          ? Math.trunc(yearRaw)
          : null,
      make: str(v.make),
      model: str(v.model),
    };
    if (vehicle.year === null && !vehicle.make && !vehicle.model) vehicle = null;
  }

  return {
    callerName,
    callerPhone,
    serviceName: str(p.service_name),
    startsAt,
    endsAt,
    durationMinutes,
    timezone: str(p.timezone),
    vehicle,
    serviceAddress: str(p.service_address),
    notes: str(p.notes),
    bookingReference,
    bookingBackend: str(p.booking_backend),
    callSessionId,
    idempotencyKey,
  };
}

/**
 * Handle one signed mirror delivery. Never throws for sender-caused
 * problems: unauthenticated or malformed requests fail closed with a
 * status and create nothing.
 */
export async function handleScreenMyCallsMirror(
  deps: ScreenMyCallsMirrorDeps,
  rawBody: string,
  headers: { signature: string | null; keyId: string | null; event: string | null },
): Promise<ScreenMyCallsMirrorResult> {
  const { supabase } = deps;

  if (!headers.keyId) return fail(401, "missing_key_id");
  if (headers.event && headers.event !== SMC_MIRROR_EVENT) {
    return fail(400, "unsupported_event");
  }

  const pairing = await resolvePairing(supabase, headers.keyId);
  if (!pairing) return fail(401, "unknown_key_id");
  if (!verifyScreenMyCallsSignature(pairing.secret, rawBody, headers.signature)) {
    return fail(401, "invalid_signature");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody) as unknown;
  } catch {
    return fail(400, "invalid_json");
  }
  const payload = parsePayload(parsedJson);
  if (!payload) return fail(400, "invalid_payload");

  // THE tenant for everything below — from the credential, never the body.
  const workspaceId = pairing.workspaceId;

  // Dedupe, scoped to this tenant: the same idempotency key delivered to
  // a different workspace is a different, legitimate mirror.
  const { data: existingRows, error: dedupeError } = await supabase
    .from("appointments")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("source", SMC_PROVIDER)
    .contains("metadata", { external_reference: payload.idempotencyKey })
    .limit(1);
  if (dedupeError) throw dedupeError;
  const existing = (existingRows ?? [])[0] as { id?: unknown } | undefined;
  if (existing && typeof existing.id === "string") {
    return {
      status: 200,
      body: { ok: true, duplicate: true, appointmentId: existing.id },
    };
  }

  const customer = await findOrCreateCustomerByPhone(
    supabase,
    workspaceId,
    payload.callerPhone,
    payload.callerName,
    SMC_PROVIDER,
  );

  let vehicleId: string | null = null;
  if (payload.vehicle) {
    const vehicle = await findOrCreateVehicleForCustomer(
      supabase,
      workspaceId,
      customer.id,
      payload.vehicle,
      SMC_PROVIDER,
    );
    vehicleId = vehicle.id;
  }

  const startsMs = Date.parse(payload.startsAt);
  const endsAt =
    payload.endsAt ??
    new Date(startsMs + (payload.durationMinutes ?? 60) * 60000).toISOString();

  const noteLines = [
    "Booked by phone via ScreenMyCalls — mirrored copy; the booking of record lives in the sender's calendar.",
    payload.serviceName ? `Service: ${payload.serviceName}` : null,
    payload.vehicle
      ? `Vehicle: ${[payload.vehicle.year, payload.vehicle.make, payload.vehicle.model]
          .filter(Boolean)
          .join(" ")}`
      : null,
    payload.serviceAddress ? `Service address: ${payload.serviceAddress}` : null,
    payload.notes ? `Caller notes: ${payload.notes}` : null,
    `Booking reference: ${payload.bookingReference}`,
    `Call session: ${payload.callSessionId}`,
  ].filter((line): line is string => Boolean(line));

  const result = await bookMirroredAppointment(supabase, workspaceId, {
    customerId: customer.id,
    vehicleId,
    startsAt: new Date(startsMs).toISOString(),
    endsAt,
    serviceName: payload.serviceName,
    notes: noteLines.join("\n"),
    locationAddress: payload.serviceAddress,
    externalReference: payload.idempotencyKey,
  });

  if ("error" in result) {
    let code = "booking_rejected";
    try {
      const parsed = (await result.error.clone().json()) as {
        error?: { code?: unknown };
      };
      if (typeof parsed?.error?.code === "string") code = parsed.error.code;
    } catch {
      // Keep the generic code; the core's Response body is best-effort.
    }
    return fail(422, code);
  }

  const appointment = result.data as { id?: unknown } | null;
  return {
    status: 201,
    body: {
      ok: true,
      duplicate: false,
      appointmentId: typeof appointment?.id === "string" ? appointment.id : null,
      customerId: customer.id,
      vehicleId,
    },
  };
}
