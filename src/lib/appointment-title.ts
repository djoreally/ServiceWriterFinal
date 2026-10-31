/**
 * Canonical job title composition (Total Redesign B2 — truth row T-1).
 *
 * ONE composition for every job response, built here and nowhere else:
 *
 *   display_title        "Laurie Buckman — Fri, Oct 30 · 10:00 AM"
 *   primary_service_name the job's primary service (the subtitle)
 *   confirmation_code    the small human reference (e.g. "78361AF6")
 *
 * It retires the three private title variants — the detail header's
 * "Appointment {UUID prefix}", the appointments list's client-side
 * synthesis, and the cockpit's private `CockpitAppointment.title` — and
 * the stored `appointments.title` column / `metadata.title` as display
 * sources: stored titles are never read here. The title is composed from
 * the customer, the schedule, and the service, every time, so list,
 * detail, cockpit, dispatch, and tech can never disagree about what a
 * job is called.
 *
 * Name segment fallback order: joined customer name (first/last, then
 * company) → guest name from metadata → vehicle label → primary service
 * name → "Appointment". A row with a name but no parseable `starts_at`
 * gets the name alone; a row with a time but no name gets the time
 * segment alone. Nothing is invented: with neither, the title is
 * "Appointment".
 *
 * This module is pure (no I/O, no framework imports) so the server, and
 * later the clients, all read the same composition.
 */

export interface AppointmentTitleFields {
  display_title: string;
  primary_service_name: string | null;
  confirmation_code: string | null;
}

export interface AppointmentTitleOptions {
  /** Workspace timezone the schedule segment is rendered in. Defaults to UTC. */
  timezone?: string | null;
  /**
   * The primary service name resolved by the caller (e.g. the first
   * service line's description). Wins over the metadata fallbacks.
   */
  primaryServiceName?: string | null;
}

interface AppointmentTitleCarrier {
  starts_at?: unknown;
  confirmation_code?: unknown;
  customers?: unknown;
  vehicles?: unknown;
  metadata?: unknown;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function customerName(row: AppointmentTitleCarrier): string | null {
  const customer = one(row.customers as Record<string, unknown> | Record<string, unknown>[] | null);
  if (customer) {
    const joined = [text(customer.first_name), text(customer.last_name)]
      .filter(Boolean)
      .join(" ");
    if (joined) return joined;
    const company = text(customer.company_name);
    if (company) return company;
  }
  const metadata = record(row.metadata);
  return text(metadata.guest_name) ?? text(metadata.customer_name);
}

function vehicleLabel(row: AppointmentTitleCarrier): string | null {
  const vehicle = one(row.vehicles as Record<string, unknown> | Record<string, unknown>[] | null);
  if (!vehicle) return null;
  const make = text(vehicle.make);
  const model = text(vehicle.model);
  if (!make && !model) return null;
  const year =
    typeof vehicle.year === "number" && Number.isFinite(vehicle.year)
      ? String(vehicle.year)
      : text(vehicle.year);
  return [year, make, model].filter(Boolean).join(" ");
}

function resolvePrimaryServiceName(
  row: AppointmentTitleCarrier,
  override?: string | null,
): string | null {
  const fromCaller = text(override);
  if (fromCaller) return fromCaller;
  const metadata = record(row.metadata);
  return text(metadata.service_name) ?? text(metadata.service_type);
}

/** "Fri, Oct 30 · 10:00 AM" for an ISO instant in a timezone, or null. */
function formatWhen(startsAt: unknown, timezone: string): string | null {
  if (typeof startsAt !== "string" || !startsAt) return null;
  const date = new Date(startsAt);
  if (!Number.isFinite(date.getTime())) return null;
  const render = (timeZone: string) => {
    const day = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(date);
    const time = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);
    return `${day} · ${time}`;
  };
  try {
    return render(timezone);
  } catch {
    // An unrecognized stored timezone must not take the title down with it.
    return render("UTC");
  }
}

export function composeAppointmentTitleFields(
  row: AppointmentTitleCarrier,
  options?: AppointmentTitleOptions,
): AppointmentTitleFields {
  const primary_service_name = resolvePrimaryServiceName(row, options?.primaryServiceName);
  const name =
    customerName(row) ?? vehicleLabel(row) ?? primary_service_name;
  const when = formatWhen(row.starts_at, options?.timezone || "UTC");
  const display_title =
    name && when ? `${name} — ${when}` : name ?? when ?? "Appointment";
  const metadata = record(row.metadata);
  const confirmation_code =
    text(row.confirmation_code) ?? text(metadata.confirmation_code);
  return { display_title, primary_service_name, confirmation_code };
}

/**
 * Compose the canonical title fields onto an outgoing appointment row.
 * Apply alongside `withAppointmentStatusView` at the API boundary.
 * Rows are heterogeneous projections, so the wrapper accepts any object
 * and reads the carrier fields defensively (see the compose function).
 */
export function withAppointmentTitleFields<T extends object>(
  row: T,
  options?: AppointmentTitleOptions,
): T & AppointmentTitleFields {
  return { ...row, ...composeAppointmentTitleFields(row as AppointmentTitleCarrier, options) };
}
