import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const fail = (message) => { throw new Error(`Booking reliability contract failed: ${message}`); };
const requireText = (text, needle, label) => { if (!text.includes(needle)) fail(`${label}: missing ${needle}`); };

const route = read("app/api/v1/public-booking/[slug]/route.ts");
const writeMigration = read("supabase/migrations/20260831030526_secure_public_booking_rpc_context.sql");
const managementMigration = read("supabase/migrations/20260907154500_restore_customer_appointment_management_rpcs.sql");
const command = read("src/application/commands/booking-submit.command.ts");

for (const section of ["profile","settings","catalog","slots","blocked_dates"]) {
  requireText(route, `"${section}"`, "canonical booking section");
}
if (/["']config["']/.test(route)) fail("non-canonical config section is present");
if (/["']availability["']/.test(route)) fail("non-canonical availability section is present");
requireText(route, 'date: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional()', "slot date schema");
requireText(route, 'if (!query.date)', "slot date requirement");
requireText(route, '"date is required for slots"', "slot date error");
requireText(route, 'return json({ data: profile }', "JSON profile response");
if (/NextResponse\.redirect|redirect\(/.test(route)) fail("booking API must return JSON, not redirects");

requireText(command, 'supabase.rpc("public_booking_book_appointment"', "booking write RPC");
if (!/insert into public\.appointments[\s\S]*?returning id into v_appointment_id;/i.test(writeMigration)) {
  fail("booking write must return the inserted appointment id deterministically");
}
for (const rpc of [
  "public_booking_upsert_customer",
  "public_booking_upsert_vehicle",
  "public_booking_book_appointment",
  "public_booking_save_configuration",
  "public_booking_insert_services",
  "public_booking_record_payment_intent_v2",
]) requireText(writeMigration, rpc, "secure booking migration");

requireText(managementMigration, "cancel_appointment_by_token", "customer cancellation contract");
requireText(managementMigration, "reschedule_appointment_by_token", "customer reschedule contract");
if (!/That time is no longer available/i.test(managementMigration)) fail("reschedule conflict protection missing");

console.log("booking-reliability-contract: PASS");
