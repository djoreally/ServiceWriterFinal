import { Constants } from "@/integrations/supabase/types";
import type { Database } from "@/integrations/supabase/types";

type PublicTables = keyof Database["public"]["Tables"];
type PublicFunctions = keyof Database["public"]["Functions"];

/**
 * Compile-time guards: if any table or RPC below disappears from the generated
 * Database types, this file fails to typecheck and CI blocks the change. That
 * turns a silent runtime failure (empty list, permission error) into a build error.
 */
const REQUIRED_TABLES = [
  "appointments",
  "business_profiles",
  "business_subscriptions",
  "customers",
  "vehicles",
  "service_catalog",
  "service_categories",
  "payment_records",
  "recurring_services",
  "fleet_work_orders",
  "fleet_clients",
  "fleet_vehicles",
  "fleet_jobs",
  "inventory_items",
  "technicians",
] as const satisfies readonly PublicTables[];

const REQUIRED_RPCS = [
  "book_appointment_safe",
  "auto_dispatch_public_booking_v1",
  "record_public_booking_payment_intent_v1",
  "assign_dispatch_job_v1",
  "transfer_inventory_to_van",
  "decrement_inventory_quantity",
] as const satisfies readonly PublicFunctions[];

describe("Schema Contract Verification", () => {
  it("verifies key enum constants exist in Database types", () => {
    expect(Constants.public.Enums.app_role).toContain("admin");
    expect(Constants.public.Enums.data_origin_type).toContain("system_created");
  });

  it("keeps every critical table present in the generated schema types", () => {
    expect(REQUIRED_TABLES.length).toBeGreaterThan(0);
    REQUIRED_TABLES.forEach((table) => expect(typeof table).toBe("string"));
  });

  it("keeps every critical RPC present in the generated schema types", () => {
    expect(REQUIRED_RPCS.length).toBeGreaterThan(0);
    REQUIRED_RPCS.forEach((rpc) => expect(typeof rpc).toBe("string"));
  });
});
