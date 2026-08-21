/**
 * Spec enrichment — after VIN decode, resolve the filter fitment and oil-reset
 * procedure for each row so imported vehicles land service-ready.
 *
 * Backed by the same resolution path as booking (`resolve_vehicle_filters_v1`
 * and `resolve_oil_reset_procedure_v1`). Never throws: a lookup miss downgrades
 * the row's spec status instead of failing the import.
 */
import {
  resolveVehicleFilters,
  resolveOilResetProcedure,
  filterCategoryLabel,
} from "@/application/queries/vehicle-filters.query";
import type { RowSpecResolution, VehicleImportRow, VehicleProfileInput } from "../types";

const REQUIRED_CATEGORIES = ["oil_filter", "air_filter"];

function mergedPayload(row: VehicleImportRow): Partial<VehicleProfileInput> {
  return { ...row.mappedPayload, ...row.decodedPayload, ...row.resolutionPayload };
}

export async function resolveRowSpecs(row: VehicleImportRow): Promise<VehicleImportRow> {
  const payload = mergedPayload(row);
  const year = Number(payload.year);
  const make = String(payload.make || "").trim();
  const model = String(payload.model || "").trim();

  if (!year || !make || !model) {
    const skipped: RowSpecResolution = {
      status: "skipped",
      filters: [],
      missingCategories: REQUIRED_CATEGORIES,
      note: null,
    };
    return { ...row, specPayload: skipped };
  }

  try {
    const [filters, reset] = await Promise.all([
      resolveVehicleFilters({
        year,
        make,
        model,
        engine: payload.engine ?? null,
        vehicleKind: "fleet",
      }),
      resolveOilResetProcedure({ year, make, model }),
    ]);

    const mappedFilters = filters.map((filter) => ({
      partCategory: filter.part_category,
      partNumber: filter.part_number,
      brand: filter.brand,
      quantity: filter.quantity,
      source: filter.source,
    }));

    const present = new Set(mappedFilters.map((filter) => filter.partCategory));
    const missingCategories = REQUIRED_CATEGORIES.filter((category) => !present.has(category));

    const status: RowSpecResolution["status"] = mappedFilters.length === 0
      ? "no_match"
      : missingCategories.length > 0
        ? "partial"
        : "resolved";

    const note = mappedFilters.length
      ? `[filter_match] ${mappedFilters
          .map((filter) => `${filterCategoryLabel(filter.partCategory)}: ${filter.brand} ${filter.partNumber} x${filter.quantity}`)
          .join("; ")}`
      : null;

    const specs: RowSpecResolution = {
      status,
      filters: mappedFilters,
      missingCategories,
      oilResetMethod: reset?.method ?? null,
      note,
    };

    const messages = [...row.validationMessages];
    if (status === "no_match") {
      messages.push({
        code: "SPECS_UNRESOLVED",
        severity: "info",
        field: "oilFilterPartNumber",
        message: "No filter fitment found for this vehicle. Technician will need a lookup.",
      });
    }

    const oilFilter = mappedFilters.find((filter) => filter.partCategory === "oil_filter");

    return {
      ...row,
      specPayload: specs,
      validationMessages: messages,
      resolutionPayload: {
        ...(row.resolutionPayload || {}),
        ...(oilFilter ? { oilFilterPartNumber: `${oilFilter.brand} ${oilFilter.partNumber}`.trim() } : {}),
      },
    };
  } catch {
    return {
      ...row,
      specPayload: { status: "no_match", filters: [], missingCategories: REQUIRED_CATEGORIES, note: null },
    };
  }
}

export async function resolveSpecsForRows(rows: VehicleImportRow[], concurrency = 4): Promise<VehicleImportRow[]> {
  const output: VehicleImportRow[] = [];
  for (let index = 0; index < rows.length; index += concurrency) {
    const chunk = rows.slice(index, index + concurrency);
    output.push(...(await Promise.all(chunk.map(resolveRowSpecs))));
  }
  return output;
}
