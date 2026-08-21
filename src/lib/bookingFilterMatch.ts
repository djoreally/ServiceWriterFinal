/**
 * Booking filter match — resolves the FRAM/cross-reference filter fitment for the
 * vehicles selected during booking and turns it into job context the technician
 * can act on without looking anything up.
 *
 * Used by the public booking submit flow: the resolved match is attached to the
 * appointment (description block + dispatch notes) and to the booking context.
 */
import {
  resolveVehicleFilters,
  filterCategoryLabel,
  FILTER_SOURCE_LABELS,
  type ResolvedVehicleFilter,
} from "@/application/queries/vehicle-filters.query";
import { getRequiredFilterTypes } from "@/application/queries/vehicle-parts.query";

export interface FilterMatchVehicleInput {
  id?: string;
  year: string;
  make: string;
  model: string;
  engine?: string;
  licensePlate?: string;
  vin?: string;
}

export interface VehicleFilterMatch {
  vehicleId: string | null;
  vehicleLabel: string;
  year: number;
  make: string;
  model: string;
  engine: string | null;
  filters: ResolvedVehicleFilter[];
  missingCategories: string[];
  status: "resolved" | "no_match";
}

/** `oil` → `oil_filter`, matching filter_applications.part_category. */
function toPartCategory(filterType: string): string {
  return filterType.endsWith("_filter") ? filterType : `${filterType}_filter`;
}

/**
 * Which part categories the booked services actually need. Falls back to the oil
 * filter, because every mobile oil change consumes one.
 */
export function requiredPartCategories(serviceNames: string[]): string[] {
  const inferred = getRequiredFilterTypes(serviceNames).map(toPartCategory);
  return inferred.length > 0 ? inferred : ["oil_filter"];
}

/** Resolve fitment for every complete vehicle in the booking. Never throws. */
export async function resolveBookingFilterMatch(params: {
  vehicles: FilterMatchVehicleInput[];
  serviceNames: string[];
}): Promise<VehicleFilterMatch[]> {
  const categories = requiredPartCategories(params.serviceNames);
  const complete = params.vehicles.filter((v) => v.year && v.make && v.model);
  if (complete.length === 0) return [];

  const results = await Promise.all(
    complete.map(async (vehicle): Promise<VehicleFilterMatch | null> => {
      const year = parseInt(vehicle.year, 10);
      if (Number.isNaN(year)) return null;
      try {
        const rows = await resolveVehicleFilters({
          year,
          make: vehicle.make,
          model: vehicle.model,
          engine: vehicle.engine || null,
        });
        const filters = rows.filter((row) => categories.includes(row.part_category));
        const found = new Set(filters.map((row) => row.part_category));
        return {
          vehicleId: vehicle.id || null,
          vehicleLabel: `${vehicle.year} ${vehicle.make} ${vehicle.model}${
            vehicle.licensePlate ? ` (${vehicle.licensePlate})` : ""
          }`,
          year,
          make: vehicle.make,
          model: vehicle.model,
          engine: vehicle.engine || null,
          filters,
          missingCategories: categories.filter((c) => !found.has(c)),
          status: filters.length > 0 ? "resolved" : "no_match",
        };
      } catch {
        return {
          vehicleId: vehicle.id || null,
          vehicleLabel: `${vehicle.year} ${vehicle.make} ${vehicle.model}${
            vehicle.licensePlate ? ` (${vehicle.licensePlate})` : ""
          }`,
          year,
          make: vehicle.make,
          model: vehicle.model,
          engine: vehicle.engine || null,
          filters: [],
          missingCategories: categories,
          status: "no_match",
        };
      }
    }),
  );

  return results.filter((row): row is VehicleFilterMatch => row !== null);
}

/**
 * Human-readable block appended to the appointment description / dispatch notes.
 * Every selected vehicle gets its own clearly labelled section, even when nothing
 * could be resolved, so the technician always knows what to verify on site.
 */
export function formatFilterMatchNote(matches: VehicleFilterMatch[]): string {
  if (matches.length === 0) return "";

  const total = matches.length;
  const blocks = matches.map((match, index) => {
    const lines = match.filters.map((row) => {
      const subs = row.substitutes
        .slice(0, 3)
        .map((s) => `${s.brand} ${s.part_number}`)
        .join(", ");
      const qty = row.quantity > 1 ? ` ×${row.quantity}` : "";
      return `  • ${filterCategoryLabel(row.part_category)}: ${row.brand} ${row.part_number}${qty}` +
        `${row.oem_number ? ` (OEM ${row.oem_number})` : ""}` +
        ` [${FILTER_SOURCE_LABELS[row.source] ?? row.source}]` +
        `${subs ? ` — alt: ${subs}` : ""}`;
    });

    for (const missing of match.missingCategories) {
      lines.push(`  • ${filterCategoryLabel(missing)}: no match on file — verify before the visit`);
    }

    if (lines.length === 0) {
      lines.push("  • No fitment resolved — verify filters before the visit");
    }

    const label = total > 1
      ? `Vehicle ${index + 1} of ${total}: ${match.vehicleLabel}`
      : match.vehicleLabel;

    return `${label}\n${lines.join("\n")}`;
  });

  return `Filter match (auto-resolved)\n${blocks.join("\n")}`;
}

/**
 * Single source of truth for how the resolved filter match lands on the job:
 * appended to the appointment description and mirrored into dispatch notes.
 */
export function buildFilterMatchJobContext(params: {
  baseDescription: string;
  matches: VehicleFilterMatch[];
}): { description: string; dispatchNotes: string | null } {
  const note = formatFilterMatchNote(params.matches);
  return {
    description: note ? `${params.baseDescription}\n\n${note}` : params.baseDescription,
    dispatchNotes: note || null,
  };
}


/** Structured payload stored on the booking context for downstream systems. */
export function filterMatchContextPayload(matches: VehicleFilterMatch[]) {
  return matches.map((match) => ({
    vehicle_id: match.vehicleId,
    vehicle: match.vehicleLabel,
    year: match.year,
    make: match.make,
    model: match.model,
    engine: match.engine,
    status: match.status,
    filters: match.filters.map((row) => ({
      part_category: row.part_category,
      part_number: row.part_number,
      brand: row.brand,
      oem_number: row.oem_number,
      quantity: row.quantity,
      source: row.source,
      confidence: row.confidence,
      substitutes: row.substitutes,
    })),
    missing: match.missingCategories,
  }));
}
