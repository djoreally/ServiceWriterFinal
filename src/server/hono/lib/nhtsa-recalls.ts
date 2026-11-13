/**
 * NHTSA recall lookup for the public booking flow (SW-68, 2026-11-12).
 *
 * When a booking customer enters a VIN, the booking page asks this
 * module (via POST /v1/public-bookings/recall-lookup) what recalls
 * NHTSA has on file for that vehicle. The chain is the free, keyless
 * federal one — the same source the paid Vehicle Databases recall
 * product draws from:
 *
 *   VIN → NHTSA vPIC decode (year/make/model)
 *       → NHTSA recallsByVehicle (campaigns for that year/make/model)
 *
 * HONEST SCOPE: recallsByVehicle answers at the year/make/model
 * level. It can say "NHTSA has N recalls on file for a 2023 Ford
 * Transit" — it can NEVER say this specific car has an open recall
 * (only a dealer system knows what was already repaired). Callers
 * must word it that way; the booking popup does.
 *
 * FAIL-SOFT, house style (the vin-decode.ts / vehicle-databases.ts
 * pattern): pure mappers plus an injectable fetch, NOTHING here
 * throws. A bad VIN, a failed decode, an NHTSA outage, or a timeout
 * all answer { success: false } and the booking UI shows nothing —
 * a recall lookup must never block or break a booking.
 *
 * No API key, no credits, no env vars: NHTSA's public APIs are free.
 */

import { mapVpicDecodeResponse } from "./vin-decode";

export interface RecallCampaign {
  campaignNumber: string;
  component: string;
  summary: string;
  consequence: string;
  remedy: string;
  reportReceivedDate: string | null;
}

export interface RecallVehicle {
  year: number;
  make: string;
  model: string;
}

export type RecallLookupResult =
  | { success: true; vehicle: RecallVehicle; campaigns: RecallCampaign[] }
  | { success: false; error: string };

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

const VPIC_DECODE_URL = "https://vpic.nhtsa.dot.gov/api/vehicles/decodevin";
const NHTSA_RECALLS_URL = "https://api.nhtsa.gov/recalls/recallsByVehicle";

/**
 * Hard ceiling per outbound call. The booking client gives up at
 * 15s; the worst case here is one decode + three model candidates
 * (4 × 2.5s = 10s), and the common case is two calls (~1s).
 */
export const NHTSA_FETCH_TIMEOUT_MS = 2_500;

/** 17 chars, no I/O/Q — mirrors VIN_FORMAT_PATTERN in @/lib/booking-requirements. */
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Map an NHTSA recallsByVehicle body onto the campaign shape the
 * booking popup renders. Returns null for a malformed body (the
 * caller treats that as "no usable answer", distinct from a
 * well-formed zero — an empty results array is a real answer:
 * no recalls on file).
 */
export function mapNhtsaRecallsResponse(payload: unknown): RecallCampaign[] | null {
  const root = asRecord(payload);
  if (!root || !Array.isArray(root.results)) return null;
  const campaigns: RecallCampaign[] = [];
  for (const entry of root.results) {
    const row = asRecord(entry);
    if (!row) continue;
    const campaignNumber = asString(row.NHTSACampaignNumber);
    const component = asString(row.Component);
    if (!campaignNumber && !component) continue;
    campaigns.push({
      campaignNumber,
      component,
      summary: asString(row.Summary),
      consequence: asString(row.Consequence),
      remedy: asString(row.Remedy),
      reportReceivedDate: asString(row.ReportReceivedDate) || null,
    });
  }
  return campaigns;
}

/**
 * Model-name candidates for recallsByVehicle, most specific first.
 *
 * vPIC model strings often carry suffixes the recalls index does
 * not file under — "Transit Cargo Van" is filed as "Transit";
 * "Silverado 1500 LTD" as "Silverado 1500" / "Silverado". Try the
 * full string, then the first two words, then the first word. The
 * recalls endpoint itself is case-insensitive (verified live:
 * make=FORD / model=TRANSIT answer the same as Ford / Transit), so
 * casing is not normalized here.
 */
export function modelCandidates(model: string): string[] {
  const clean = model.trim().replace(/\s+/g, " ");
  if (!clean) return [];
  const words = clean.split(" ");
  const candidates = [clean];
  if (words.length > 2) candidates.push(words.slice(0, 2).join(" "));
  if (words.length > 1) candidates.push(words[0]);
  return [...new Set(candidates)];
}

// ---------------------------------------------------------------------------
// Campaign cache (per server instance, best-effort).
//
// Recalls for a year/make/model change on the order of months, and
// a popular fleet vehicle would otherwise re-hit NHTSA on every
// booking. Keyed by the DECODED year/make/model (raw vPIC model
// string), storing the winning campaign list — including a
// well-formed empty list, which is a real answer. Failures are
// never cached: an NHTSA outage must not pin "no data" for hours.
// ---------------------------------------------------------------------------

interface CacheEntry {
  expiresAt: number;
  campaigns: RecallCampaign[];
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const campaignsCache = new Map<string, CacheEntry>();

function cacheKey(vehicle: RecallVehicle): string {
  return `${vehicle.year}|${vehicle.make.toUpperCase()}|${vehicle.model.toUpperCase()}`;
}

function readCache(key: string): RecallCampaign[] | null {
  const entry = campaignsCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    campaignsCache.delete(key);
    return null;
  }
  return entry.campaigns;
}

function writeCache(key: string, campaigns: RecallCampaign[]): void {
  if (campaignsCache.size >= CACHE_MAX_ENTRIES) {
    // Map preserves insertion order — evict the oldest entry.
    const oldest = campaignsCache.keys().next().value;
    if (oldest) campaignsCache.delete(oldest);
  }
  campaignsCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, campaigns });
}

/** Test hook: the module cache is shared across a suite otherwise. */
export function clearNhtsaRecallCache(): void {
  campaignsCache.clear();
}

async function fetchJson(url: string, fetchFn: FetchFn): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NHTSA_FETCH_TIMEOUT_MS);
  try {
    const response = await fetchFn(url, { signal: controller.signal });
    if (!response.ok) return null;
    return await response.json().catch(() => null);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Full chain: VIN → vPIC decode → recallsByVehicle with model
 * fallbacks. Never throws; every failure is { success: false }.
 */
export async function lookupRecallsByVin(
  vin: string,
  fetchFn: FetchFn = fetch,
): Promise<RecallLookupResult> {
  const clean = (vin || "").trim().toUpperCase();
  if (!VIN_PATTERN.test(clean)) {
    return { success: false, error: "Invalid VIN" };
  }

  const decodePayload = await fetchJson(
    `${VPIC_DECODE_URL}/${encodeURIComponent(clean)}?format=json`,
    fetchFn,
  );
  const decoded = mapVpicDecodeResponse(clean, decodePayload);
  if (!decoded.success) {
    return { success: false, error: "Vehicle not found" };
  }
  const vehicle: RecallVehicle = {
    year: decoded.vehicle.year,
    make: decoded.vehicle.make,
    model: decoded.vehicle.model,
  };

  const key = cacheKey(vehicle);
  const cached = readCache(key);
  if (cached) return { success: true, vehicle, campaigns: cached };

  let sawEmptyAnswer = false;
  for (const candidate of modelCandidates(vehicle.model)) {
    const url =
      `${NHTSA_RECALLS_URL}?make=${encodeURIComponent(vehicle.make)}` +
      `&model=${encodeURIComponent(candidate)}&modelYear=${vehicle.year}`;
    const campaigns = mapNhtsaRecallsResponse(await fetchJson(url, fetchFn));
    if (campaigns === null) continue; // malformed — try the next name
    if (campaigns.length > 0) {
      writeCache(key, campaigns);
      return { success: true, vehicle, campaigns };
    }
    sawEmptyAnswer = true;
  }

  if (sawEmptyAnswer) {
    // Every name NHTSA could file this model under answered, and
    // all were well-formed empties: no recalls on file is the answer.
    writeCache(key, []);
    return { success: true, vehicle, campaigns: [] };
  }
  return { success: false, error: "Recalls unavailable" };
}
