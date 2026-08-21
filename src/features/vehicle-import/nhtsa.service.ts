/**
 * VIN decode for the vehicle-import pipeline.
 *
 * Decoding runs server-side through the `vin-decode` edge function, which owns
 * the provider calls, the `vin_decode_cache`, and the filter/oil spec lookups.
 * The browser must not call vpic.nhtsa.dot.gov directly: production CSP
 * (`connect-src`) only allows same-origin + Supabase, so a direct call is
 * blocked and every row silently comes back undecoded.
 */
import { decodeVinNumber } from "@/application/commands/vin.command";
import type { DecodeStatus, VehicleProfileInput } from "./types";

export type NhtsaDecodeResult = {
  status: DecodeStatus;
  profile?: Partial<VehicleProfileInput>;
  snapshot?: Record<string, unknown>;
  errorMessage?: string;
};

const cache = new Map<string, NhtsaDecodeResult>();

export const normalizeVin = (vin?: string) => (vin || "").trim().toUpperCase();

/**
 * Extract a VIN candidate from spreadsheet/browser input.
 *
 * Fleet exports often include spaces, hyphens, labels (`VIN:`), quotes, or
 * other cell artifacts. Keep this centralized so mapping, validation, manual
 * overrides, and decode all agree on the exact value being decoded.
 */
export const extractVinCandidate = (value?: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const cleaned = String(value)
    .toUpperCase()
    .replace(/\bVIN\b\s*[:#-]?/g, "")
    .replace(/[^A-HJ-NPR-Z0-9]/g, "");
  const match = cleaned.match(/[A-HJ-NPR-Z0-9]{17}/);
  return match?.[0] ?? null;
};

export const isValidVinFormat = (vin?: string) => {
  const normalized = extractVinCandidate(vin) || normalizeVin(vin);
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(normalized);
};

const clean = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const toInt = (value: unknown): number | undefined => {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/** Decode a VIN through the server-side decoder. Never throws. */
export async function decodeVin(vin: string, options?: { force?: boolean }): Promise<NhtsaDecodeResult> {
  const normalizedVin = extractVinCandidate(vin) || normalizeVin(vin);
  if (!isValidVinFormat(normalizedVin)) {
    return { status: "invalid_vin", errorMessage: "VIN format failed checksum rules" };
  }

  if (!options?.force) {
    const cached = cache.get(normalizedVin);
    if (cached) return cached;
  }

  try {
    const decoded = await decodeVinNumber(normalizedVin);

    const profile: Partial<VehicleProfileInput> = {
      vin: normalizedVin,
      year: toInt(decoded.year),
      make: clean(decoded.make),
      model: clean(decoded.model),
      trim: clean(decoded.trim),
      engine: clean(decoded.engine),
      fuelTypePrimary: clean(decoded.fuelType),
      drivetrain: clean(decoded.driveType),
      transmission: clean(decoded.transmission),
      bodyClass: clean(decoded.bodyClass),
      bodyStyle: clean(decoded.bodyClass),
    };

    const filled = Object.entries(profile).filter(
      ([key, value]) => key !== "vin" && value !== undefined && value !== null && value !== "",
    ).length;

    if (filled === 0) {
      const empty: NhtsaDecodeResult = {
        status: "failed",
        snapshot: decoded as unknown as Record<string, unknown>,
        errorMessage: "Decoder returned no vehicle details for this VIN",
      };
      cache.set(normalizedVin, empty);
      return empty;
    }

    const status: DecodeStatus = filled >= 5 ? "success" : "partial";
    const result: NhtsaDecodeResult = {
      status,
      profile,
      snapshot: decoded as unknown as Record<string, unknown>,
    };
    cache.set(normalizedVin, result);
    return result;
  } catch (error) {
    return {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "VIN decode request failed",
    };
  }
}

/** @deprecated Kept for existing call sites — decoding is server-side now. */
export const decodeVinFromNhtsa = (vin: string, _retries = 1) => decodeVin(vin);
