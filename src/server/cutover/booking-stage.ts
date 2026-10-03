import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { ApiError } from "@/server/api";

const COOKIE = "sw_cutover_booking_stage";
const MAX_AGE_SECONDS = 30 * 60;

type StagedVehicle = {
  tempId: string;
  year: number;
  make: string;
  model: string;
  licensePlate?: string | null;
  vin?: string | null;
  mileage?: number | null;
  oilType?: string | null;
  oilCapacity?: string | null;
  imageUrl?: string | null;
  engine?: string | null;
  tireSize?: string | null;
};

export type BookingStage = {
  slug: string;
  customer?: {
    tempId: string;
    email: string;
    name: string;
    phone?: string | null;
    address?: string | null;
  };
  vehicles: StagedVehicle[];
  appointmentId?: string;
  canonicalVehicleByTempId?: Record<string, string>;
  createdAt: number;
};

function key() {
  const secret = process.env.CUTOVER_BOOKING_STAGE_SECRET;
  if (!secret || secret.length < 32) throw new ApiError(503, "Cutover booking staging is not configured", "cutover_booking_stage_unconfigured");
  return crypto.createHash("sha256").update(secret).digest();
}

function encode(stage: BookingStage) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(stage), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

function decode(value: string): BookingStage | null {
  try {
    const raw = Buffer.from(value, "base64url");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    const stage = JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")) as BookingStage;
    if (!stage.createdAt || Date.now() - stage.createdAt > MAX_AGE_SECONDS * 1000) return null;
    return stage;
  } catch {
    return null;
  }
}

export async function readBookingStage(slug: string): Promise<BookingStage> {
  const store = await cookies();
  const current = store.get(COOKIE)?.value;
  const decoded = current ? decode(current) : null;
  if (!decoded || decoded.slug !== slug) return { slug, vehicles: [], createdAt: Date.now() };
  return decoded;
}

export async function writeBookingStage(stage: BookingStage) {
  const encoded = encode(stage);
  if (encoded.length > 3800) throw new ApiError(413, "Booking contains too much staged vehicle data", "cutover_booking_stage_too_large");
  const store = await cookies();
  store.set(COOKIE, encoded, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE_SECONDS });
}

export async function clearBookingStage() {
  const store = await cookies();
  store.set(COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}
