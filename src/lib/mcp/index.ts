/**
 * Service Writer MCP server definition.
 *
 * Import-safe: no env reads, I/O, or throws at module top level — this module is
 * evaluated both at build time (tool extraction) and on Edge Function cold start.
 */
import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listAppointments from "./tools/list-appointments";
import getAppointment from "./tools/get-appointment";
import listCustomers from "./tools/list-customers";
import getCustomerHistory from "./tools/get-customer-history";
import listServiceCatalog from "./tools/list-service-catalog";
import createCustomer from "./tools/create-customer";
import listVehicles from "./tools/list-vehicles";
import listLocations from "./tools/list-locations";
import getCapacity from "./tools/get-capacity";
import getRevenueSummary from "./tools/get-revenue-summary";
import getBookingPerformance from "./tools/get-booking-performance";
import listPromotions from "./tools/list-promotions";

// The OAuth issuer must be the direct Supabase host, derived from the project ref
// that Vite inlines at build time (never from SUPABASE_URL, which may be a proxy).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

const mcp: ReturnType<typeof defineMcp> = defineMcp({
  name: "servicewriter",
  title: "ServiceWriter",
  version: "0.2.0",
  instructions:
    "Tools for ServiceWriter, a mobile-service shop management app and the system of record for this shop's customers, vehicles, appointments, services and revenue. Read appointments and their geography (list_appointments, get_appointment), customers and vehicles (list_customers, get_customer_history, list_vehicles), the service catalog (list_services), the shop's service areas (list_locations), real scheduling capacity (get_capacity), real revenue (get_revenue_summary), window-over-window booking comparisons (get_booking_performance) and existing promotions (list_promotions); create_customer is the only write. ServiceWriter is mobile-service software: there are no fixed branch locations, so 'location' means a service zone, ZIP code or customer city recorded on an appointment. Every tool acts as the signed-in ServiceWriter user and is scoped to that account's workspace by row-level security. Metrics are computed only from stored data: where ServiceWriter cannot support a metric (for example a demand baseline, seasonality model, or per-coupon attributed revenue) the tool returns an explicit limitation instead of an estimate.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listAppointments,
    getAppointment,
    listCustomers,
    getCustomerHistory,
    listServiceCatalog,
    createCustomer,
    listVehicles,
    listLocations,
    getCapacity,
    getRevenueSummary,
    getBookingPerformance,
    listPromotions,
  ],
});

export default mcp;
