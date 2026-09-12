import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),"utf8");
const fail=(m)=>{throw new Error(`Service/pricing integrity contract failed: ${m}`)};
const requireText=(text,needle,label)=>{if(!text.includes(needle))fail(`${label}: missing ${needle}`)};

const pricing=read("supabase/migrations/20260912050000_public_booking_server_price_snapshot.sql");
const closeout=read("supabase/migrations/20260907133500_fix_appointment_closeout_invoice_identity.sql");
const invoices=read("app/api/v1/invoices/route.ts");

requireText(pricing,"service_catalog_snapshot","catalog price snapshot");
requireText(pricing,"sc.labor_price","server-side catalog price authority");
requireText(pricing,"custom_booking_adjustment","custom adjustment classification");
requireText(pricing,"INVALID_SERVICE_QUANTITY","quantity validation");
requireText(pricing,"public_booking_insert_services","slug-scoped public write wrapper");

requireText(closeout,"sum(quantity * unit_price)","appointment item financial source");
requireText(closeout,"from public.appointment_items","appointment item closeout");
requireText(closeout,"insert into public.invoice_lines","invoice line creation");
requireText(closeout,"ai.quantity, ai.unit_price","invoice preserves booked price snapshot");

requireText(invoices,"quantity: z.number().positive()","invoice quantity validation");
requireText(invoices,"unit_price: z.number().nonnegative()","invoice price validation");
requireText(invoices,"create_invoice_v1","canonical invoice creation");

console.log("service-pricing-integrity-contract: PASS");
