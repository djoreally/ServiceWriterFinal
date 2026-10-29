/**
 * Server-to-server client for the MOMS website backend's internal
 * website-bookings endpoints (see apps/api in momsfinalwebbackend:
 * routes/internal-website-bookings.ts).
 *
 * Configuration (server env only, never exposed to the browser):
 * - MOMS_WEBSITE_API_URL: base URL of the website backend API.
 * - SW_PUSH_SECRET: shared secret sent as the `x-sw-push-secret` header.
 *
 * When unconfigured, callers surface a 503 with an honest message instead of
 * failing obscurely.
 */
import type { WebsiteBooking, WebsiteBookingListStatus } from "@/lib/website-bookings";

export class WebsiteBackendError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "WebsiteBackendError";
    this.status = status;
  }
}

export interface WebsiteBookingsConfig {
  baseUrl: string;
  secret: string;
}

export function getWebsiteBookingsConfig(): WebsiteBookingsConfig | null {
  const baseUrl = (process.env.MOMS_WEBSITE_API_URL || "").trim().replace(/\/+$/, "");
  const secret = (process.env.SW_PUSH_SECRET || "").trim();
  if (!baseUrl || !secret) return null;
  return { baseUrl, secret };
}

export function websiteIntegrationNotConfigured(): WebsiteBackendError {
  return new WebsiteBackendError(
    503,
    "Website bookings integration is not configured on the server (MOMS_WEBSITE_API_URL and SW_PUSH_SECRET must be set).",
  );
}

async function callWebsiteBackend<T>(
  config: WebsiteBookingsConfig,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        "content-type": "application/json",
        "x-sw-push-secret": config.secret,
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch (error) {
    throw new WebsiteBackendError(
      502,
      `Could not reach the website backend: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | { data?: T; error?: string | { message?: string } }
    | null;

  if (!response.ok) {
    const message =
      typeof payload?.error === "string"
        ? payload.error
        : payload?.error?.message ?? `Website backend returned HTTP ${response.status}`;
    throw new WebsiteBackendError(response.status, message);
  }
  return (payload?.data ?? payload) as T;
}

export async function fetchWebsiteBookings(
  config: WebsiteBookingsConfig,
  status: WebsiteBookingListStatus,
): Promise<WebsiteBooking[]> {
  const data = await callWebsiteBackend<WebsiteBooking[]>(
    config,
    `/internal/website-bookings?status=${encodeURIComponent(status)}`,
  );
  return Array.isArray(data) ? data : [];
}

export async function stampWebsiteBookingPushed(
  config: WebsiteBookingsConfig,
  bookingId: string,
  swAppointmentId: string,
): Promise<{ id: string; pushed_sw_appointment_id: string; pushed_at: string }> {
  return callWebsiteBackend(config, `/internal/website-bookings/${encodeURIComponent(bookingId)}/push-stamp`, {
    method: "POST",
    body: { sw_appointment_id: swAppointmentId },
  });
}

export async function setWebsiteBookingNeverPush(
  config: WebsiteBookingsConfig,
  bookingId: string,
  neverPush: boolean,
): Promise<{ id: string; never_push: boolean }> {
  return callWebsiteBackend(config, `/internal/website-bookings/${encodeURIComponent(bookingId)}/never-push`, {
    method: "POST",
    body: { never_push: neverPush },
  });
}
