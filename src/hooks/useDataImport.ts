import { useCallback } from "react";
import type { ParsedRow } from "@/lib/importParser";
import { parseNumber } from "@/lib/importParser";
import { createCustomerAndReturn } from "@/application/commands/customers.command";
import { createVehicle } from "@/application/commands/vehicles.command";

/**
 * Customer CSV import.
 *
 * Uses the same authenticated workspace-scoped command boundaries as normal
 * customer and vehicle CRUD. No legacy user_id writes or retired schema fields.
 */
export function useCustomerImport() {
  const importCustomers = useCallback(async (
    rows: ParsedRow[],
    mapping: Record<string, string>,
  ): Promise<{ success: number; failed: number; errors: string[] }> => {
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      try {
        const name = String(row[mapping.name] || "").trim();
        if (!name) {
          errors.push(`Row ${i + 2}: Name is required`);
          failed++;
          continue;
        }

        const customer = await createCustomerAndReturn({
          name,
          email: mapping.email ? String(row[mapping.email] || "").trim() || null : null,
          phone: mapping.phone ? String(row[mapping.phone] || "").trim() || null : null,
          address: mapping.address ? String(row[mapping.address] || "").trim() || null : null,
          notes: mapping.notes ? String(row[mapping.notes] || "").trim() || null : null,
        });

        const vehicleMake = mapping.make ? String(row[mapping.make] || "").trim() : "";
        const vehicleModel = mapping.model ? String(row[mapping.model] || "").trim() : "";

        if (vehicleMake && vehicleModel) {
          const parsedYear = mapping.year ? parseNumber(row[mapping.year]) : null;
          const parsedMileage = mapping.mileage ? parseNumber(row[mapping.mileage]) : null;

          try {
            await createVehicle({
              customer_id: customer.id,
              make: vehicleMake,
              model: vehicleModel,
              year: parsedYear && parsedYear >= 1886 && parsedYear <= 2200
                ? Math.trunc(parsedYear)
                : new Date().getFullYear(),
              vin: mapping.vin ? String(row[mapping.vin] || "").trim() || null : null,
              license_plate: mapping.license_plate ? String(row[mapping.license_plate] || "").trim() || null : null,
              plate_state: mapping.plate_state ? String(row[mapping.plate_state] || "").trim() || null : null,
              color: mapping.color ? String(row[mapping.color] || "").trim() || null : null,
              mileage: parsedMileage == null ? null : Math.max(0, Math.trunc(parsedMileage)),
              odometer_measure: null,
              notes: null,
              oil_type: null,
              oil_capacity: null,
            });
          } catch (vehicleError) {
            errors.push(
              `Row ${i + 2}: Customer created but vehicle failed - ${vehicleError instanceof Error ? vehicleError.message : "Unknown error"}`,
            );
          }
        }

        success++;
      } catch (error) {
        errors.push(`Row ${i + 2}: ${error instanceof Error ? error.message : "Unknown error"}`);
        failed++;
      }
    }

    return { success, failed, errors };
  }, []);

  return { importCustomers };
}
