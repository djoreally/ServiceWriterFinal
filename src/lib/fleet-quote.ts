import type { Json } from "@/integrations/supabase/types";

export interface FleetVehicleLine {
  vin: string;
  year: string;
  make: string;
  model: string;
  quantity: string;
  engine: string | null;
  fuel_type: string | null;
  drive_type: string | null;
  body_class: string | null;
  transmission: string | null;
  decode_status: "idle" | "decoded" | "manual" | "failed";
}

export interface FleetQuoteMetadata {
  fleetVehicles: FleetVehicleLine[];
}

export interface FleetQuoteStorage {
  notes: string | null;
  fleet_metadata?: Json | null;
}

export const FLEET_META_START = "[FLEET_V1]";
export const FLEET_META_END = "[/FLEET_V1]";

export const emptyFleetLine = (): FleetVehicleLine => ({
  vin: "",
  year: "",
  make: "",
  model: "",
  quantity: "1",
  engine: null,
  fuel_type: null,
  drive_type: null,
  body_class: null,
  transmission: null,
  decode_status: "idle",
});

export function parseFleetNotes(notes: string | null): { userNotes: string; fleetVehicles: FleetVehicleLine[] } {
  if (!notes) return { userNotes: "", fleetVehicles: [emptyFleetLine()] };
  const start = notes.indexOf(FLEET_META_START);
  const end = notes.indexOf(FLEET_META_END);
  if (start === -1 || end === -1 || end <= start) {
    return { userNotes: notes, fleetVehicles: [emptyFleetLine()] };
  }
  const userNotes = notes.slice(0, start).trim();
  const payloadRaw = notes.slice(start + FLEET_META_START.length, end).trim();
  try {
    const payload = JSON.parse(payloadRaw) as { fleetVehicles?: FleetVehicleLine[] };
    const rows = (payload.fleetVehicles || []).filter((row) => row.year || row.make || row.model || row.vin);
    return { userNotes, fleetVehicles: rows.length ? rows : [emptyFleetLine()] };
  } catch {
    return { userNotes: notes, fleetVehicles: [emptyFleetLine()] };
  }
}

export function parseFleetMetadata(
  metadata: Json | null | undefined,
): { fleetVehicles: FleetVehicleLine[] } {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return { fleetVehicles: [emptyFleetLine()] };
  }

  const rowsCandidate = (metadata as { fleetVehicles?: FleetVehicleLine[] }).fleetVehicles;
  if (!Array.isArray(rowsCandidate)) {
    return { fleetVehicles: [emptyFleetLine()] };
  }

  const rows = rowsCandidate.filter((row) => row.year || row.make || row.model || row.vin);
  return { fleetVehicles: rows.length ? rows : [emptyFleetLine()] };
}

export function readFleetQuoteStorage(storage: FleetQuoteStorage): { userNotes: string; fleetVehicles: FleetVehicleLine[] } {
  const parsedMetadata = parseFleetMetadata(storage.fleet_metadata);
  const activeMetadataRows = getActiveFleetVehicles(parsedMetadata.fleetVehicles);
  if (activeMetadataRows.length > 0) {
    const parsedLegacyNotes = parseFleetNotes(storage.notes);
    return {
      userNotes: parsedLegacyNotes.userNotes,
      fleetVehicles: parsedMetadata.fleetVehicles,
    };
  }

  return parseFleetNotes(storage.notes);
}

export function buildFleetNotes(userNotes: string, fleetVehicles: FleetVehicleLine[]): string | null {
  const rows = fleetVehicles
    .map((row) => ({
      ...row,
      vin: row.vin.trim().toUpperCase(),
      year: row.year.trim(),
      make: row.make.trim(),
      model: row.model.trim(),
      quantity: row.quantity || "1",
    }))
    .filter((row) => row.year || row.make || row.model || row.vin);

  const cleanUserNotes = userNotes.trim();
  if (!rows.length) return cleanUserNotes || null;
  const payload = JSON.stringify({ fleetVehicles: rows });
  return `${cleanUserNotes ? `${cleanUserNotes}\n\n` : ""}${FLEET_META_START}${payload}${FLEET_META_END}`;
}

export function buildFleetMetadata(fleetVehicles: FleetVehicleLine[]): Json | null {
  const rows = fleetVehicles
    .map((row) => ({
      ...row,
      vin: row.vin.trim().toUpperCase(),
      year: row.year.trim(),
      make: row.make.trim(),
      model: row.model.trim(),
      quantity: row.quantity || "1",
    }))
    .filter((row) => row.year || row.make || row.model || row.vin);

  return rows.length ? ({ fleetVehicles: rows } as Json) : null;
}

export function getActiveFleetVehicles(rows: FleetVehicleLine[]): FleetVehicleLine[] {
  return rows.filter((row) => row.year || row.make || row.model || row.vin);
}

export function getFleetQuantityMultiplier(rows: FleetVehicleLine[]): number {
  const activeRows = getActiveFleetVehicles(rows);
  if (!activeRows.length) return 1;
  return activeRows.reduce((sum, row) => sum + Math.max(1, Number(row.quantity) || 1), 0);
}

export const FLEET_OS_SERVICE_WRITER_TEMPLATE = `SERVICE WRITER TEMPLATE: FLEET MAINTENANCE QUOTE
[SECTION: FLEET OVERVIEW]
Company Name: {{company_name}}
Total Vehicles: {{total_vehicles}}
Vehicle Breakdown
{{vehicle_type_1_count}} × {{vehicle_type_1_name}} ({{vehicle_type_1_years}})
{{vehicle_type_2_count}} × {{vehicle_type_2_name}} ({{vehicle_type_2_years}})
Service Details
Service Type: On-site mobile fleet maintenance
Service Window: {{service_window}} (e.g. Weekend / Weekdays / Custom)
[SECTION: CORE SERVICE PACKAGES]
Service Package A — {{vehicle_type_1_name}}

Includes:

Full synthetic oil (OEM equivalent spec)
Oil filter replacement
Fluid top-off
Tire pressure check
Basic visual inspection

Price: {{price_vehicle_type_1}} per vehicle

Service Package B — {{vehicle_type_2_name}} (OEM REQUIRED)

Includes:

OEM spec oil (e.g. MB 229.52 / 229.51 or applicable)
OEM filter
Service interval reset
Full inspection

Price: {{price_vehicle_type_2}} per vehicle

Note: OEM-compliant parts and fluids will be used where required.

[SECTION: ADD-ON SERVICES]
Wiper Blade Replacement
Front pair installed
Price: {{wiper_price}} per vehicle
Engine Air Filter

Price: {{engine_filter_price}} per vehicle

Cabin Air Filter

Price: {{cabin_filter_price}} per vehicle

Battery Replacement
Tested and installed onsite
Price: {{battery_price_range}} per vehicle
[SECTION: SERVICE STRUCTURE]
Fleet Service Blocks

Service is performed in structured batches to ensure efficiency and minimal disruption.

Batch Size: {{batch_size}} vehicles per service block

Scheduling Options

Option A — Rolling Cycle

{{vehicles_per_weekend}} vehicles per service window
Full fleet completed in {{cycle_duration}}

Option B — Accelerated Service

Full fleet completed in {{accelerated_duration}}
Execution Model
On-site service
Coordinated scheduling
Minimal downtime workflow
[SECTION: PRICING STRUCTURE NOTE]

Pricing is based on:

Fleet size
Vehicle type requirements
Scheduling structure
Service frequency

Final pricing may be adjusted based on confirmed vehicle details.

[SECTION: NEXT STEPS / CLIENT ACTION]
Review quote
Confirm service structure
Add or verify vehicle details
Approve to schedule service
[SYSTEM NOTES – INTERNAL USE ONLY]
Tag: Fleet
Route grouping: Enabled
Weekend premium: {{yes/no}}
OEM enforcement: {{vehicles_flagged}}
Recurring eligibility: {{yes/no}}`;
