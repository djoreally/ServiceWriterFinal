import fs from "node:fs";

const required = [
  "src/server/service-writer-api.ts",
  "src/server/cutover/appointments.ts",
  "src/server/cutover/communications.ts",
  "src/server/cutover/invoices.ts",
  "src/server/cutover/services.ts",
  "src/server/cutover/work-orders.ts",
  "src/server/cutover/booking-stage.ts",
  "app/api/v1/workspaces/route.ts",
  "app/api/v1/customers/route.ts",
  "app/api/v1/customers/[id]/route.ts",
  "app/api/v1/vehicles/route.ts",
  "app/api/v1/vehicles/[id]/route.ts",
  "app/api/v1/service-catalog/route.ts",
  "app/api/v1/catalog/items/route.ts",
  "app/api/v1/catalog/items/[id]/route.ts",
  "app/api/v1/appointments/route.ts",
  "app/api/v1/appointments/[id]/route.ts",
  "app/api/v1/appointments/[id]/start/route.ts",
  "app/api/v1/appointments/[id]/complete/route.ts",
  "app/api/v1/appointments/booking-rpc/route.ts",
  "app/api/v1/work-orders/route.ts",
  "app/api/v1/work-orders/[id]/route.ts",
  "app/api/v1/invoices/route.ts",
  "app/api/v1/invoices/[id]/route.ts",
  "app/api/v1/payments/route.ts",
  "app/api/v1/public-booking/[slug]/route.ts",
  "app/api/v1/public-booking/[slug]/book/route.ts",
  "app/api/v1/public-booking/[slug]/confirmation/route.ts",
  "app/api/v1/public-booking/[slug]/appointments/[appointmentId]/services/route.ts",
  "docs/cutover/STAGE22_CUTOVER_PLAN.md",
  "docs/cutover/LEGACY_SHUTDOWN.md",
  "docs/cutover/DATA_RECONCILIATION.md",
  "docs/cutover/ACCEPTANCE_MATRIX.md",
  "docs/cutover/ROLLBACK.md",
  "proxy.ts",
  ".env.example",
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing Stage 22 cutover artifact: ${file}`);

const migratedRouteFiles = required.filter((file) => file.startsWith("app/api/v1/"));
const forbiddenBusinessAccess = [".from(\"", ".from('", ".rpc(\"", ".rpc('", ".functions.invoke(", "createSupabaseAdminClient", "requireWorkspaceMember"];
for (const file of migratedRouteFiles) {
  const source = fs.readFileSync(file, "utf8");
  for (const token of forbiddenBusinessAccess) {
    if (source.includes(token)) throw new Error(`Migrated core route still contains direct legacy business access (${token}): ${file}`);
  }
}

const bridge = fs.readFileSync("src/server/service-writer-api.ts", "utf8");
for (const token of ["SERVICE_WRITER_API_URL", "authorization", "cookie", "idempotency-key", "cache: \"no-store\""]) if (!bridge.includes(token)) throw new Error(`Backend bridge missing ${token}`);

const stage = fs.readFileSync("src/server/cutover/booking-stage.ts", "utf8");
for (const token of ["aes-256-gcm", "httpOnly: true", "CUTOVER_BOOKING_STAGE_SECRET", "MAX_AGE_SECONDS = 30 * 60"]) if (!stage.includes(token)) throw new Error(`Booking stage security missing ${token}`);

const bookingRpc = fs.readFileSync("app/api/v1/appointments/booking-rpc/route.ts", "utf8");
for (const token of ["public_booking_upsert_customer", "public_booking_upsert_vehicle", "public_booking_book_appointment_v2", "public_booking_insert_services_v7", "/api/v1/public/booking/"]) if (!bookingRpc.includes(token)) throw new Error(`Booking RPC compatibility facade missing ${token}`);
if (bookingRpc.includes("supabase.rpc") || bookingRpc.includes(".rpc(")) throw new Error("Booking RPC compatibility route must not call legacy Supabase RPCs");

const slotHook = fs.readFileSync("src/hooks/useBookingSlots.ts", "utf8");
for (const token of ["fetchCanonicalAvailability", "Fail closed", "bookingSlug ? [] : generateTimeSlots()"] ) if (!slotHook.includes(token)) throw new Error(`Canonical availability fail-closed rule missing ${token}`);

const proxy = fs.readFileSync("proxy.ts", "utf8");
for (const token of ["CUTOVER_DISABLED_API_PREFIXES", "legacy_api_cutover_disabled", "/api/webhooks/stripe", "Supabase remains an identity/session provider"]) if (!proxy.includes(token)) throw new Error(`Legacy shutdown edge guard missing ${token}`);

const env = fs.readFileSync(".env.example", "utf8");
for (const token of ["SERVICE_WRITER_API_URL=", "CUTOVER_BOOKING_STAGE_SECRET="]) if (!env.includes(token)) throw new Error(`Stage 22 environment contract missing ${token}`);

const invoice = fs.readFileSync("app/api/v1/invoices/[id]/route.ts", "utf8");
for (const token of ["invoice_financial_version_required", "payment_state_is_derived", "invoice_locked"]) if (!invoice.includes(token)) throw new Error(`Invoice cutover invariant missing ${token}`);
const payments = fs.readFileSync("app/api/v1/payments/route.ts", "utf8");
for (const token of ["stripe_status_provider_owned", "manual_payment_must_settle", "/payments/stripe-intent"]) if (!payments.includes(token)) throw new Error(`Payment cutover invariant missing ${token}`);

for (const doc of ["STAGE22_CUTOVER_PLAN.md", "DATA_RECONCILIATION.md", "ACCEPTANCE_MATRIX.md", "ROLLBACK.md"]) {
  const source = fs.readFileSync(`docs/cutover/${doc}`, "utf8");
  if (!source.includes("Stage 22") && !source.includes("cutover")) throw new Error(`Cutover document appears incomplete: ${doc}`);
}

console.log("Stage 22 ServiceWriterFinal structural cutover verification passed. Production activation still requires runtime/data/environment acceptance evidence.");
