/**
 * Vehicle Specifications Query
 *
 * Compatibility adapter for consumers that still request exact YMM specs.
 * Public booking no longer reads the removed vehicle_specifications table.
 */

import { fetchVehicleSpecEngines } from "@/application/queries/vehicle-specs.query";

export interface VehicleSpec {
  id: string;
  year: number;
  make: string;
  model: string;
  engine: string | null;
  oil_type: string | null;
  oil_capacity: string | null;
  air_filter: string | null;
  oil_filter: string | null;
  cabin_filter: string | null;
  fuel_filter: string | null;
  wiper_blade_driver: string | null;
  wiper_blade_passenger: string | null;
  transmission_fluid: string | null;
  coolant_type: string | null;
  tire_size: string | null;
}

export async function fetchVehicleSpecifications(year: number, make: string, model: string): Promise<VehicleSpec[]> {
  const { data } = await fetchVehicleSpecEngines(year, make, model);
  return (data ?? []).map((row) => ({
    id: row.id ?? `${year}-${make}-${model}-${row.engine ?? "generic"}`,
    year,
    make,
    model,
    engine: row.engine ?? null,
    oil_type: row.oil_type ?? null,
    oil_capacity: row.oil_capacity ?? null,
    air_filter: null,
    oil_filter: row.oil_filter ?? null,
    cabin_filter: null,
    fuel_filter: null,
    wiper_blade_driver: null,
    wiper_blade_passenger: null,
    transmission_fluid: row.transmission_fluid ?? null,
    coolant_type: null,
    tire_size: row.tire_size ?? null,
  }));
}

export async function fetchExactVehicleSpecifications(
  year: number,
  make: string,
  model: string,
  columns: string = "engine,oil_type,oil_capacity,tire_size,additional_specs",
): Promise<Array<Record<string, unknown>>> {
  const { data } = await fetchVehicleSpecEngines(year, make, model);
  const requested = new Set(columns.split(",").map((column) => column.trim()).filter(Boolean));
  return (data ?? []).map((row) => {
    const source: Record<string, unknown> = {
      engine: row.engine,
      oil_type: row.oil_type,
      oil_capacity: row.oil_capacity,
      oil_filter: row.oil_filter ?? null,
      tire_size: row.tire_size ?? null,
      rear_tire_size: row.rear_tire_size ?? null,
      transmission_fluid: row.transmission_fluid,
      additional_specs: row.additional_specs,
    };
    if (requested.size === 0 || columns === "*") return source;
    return Object.fromEntries(Object.entries(source).filter(([key]) => requested.has(key)));
  });
}
