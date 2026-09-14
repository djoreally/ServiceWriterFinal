import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),"utf8");
const fail=(m)=>{throw new Error(`Payment closeout contract failed: ${m}`)};
const requireText=(text,needle,label)=>{if(!text.includes(needle))fail(`${label}: missing ${needle}`)};

const payments=read("app/api/v1/payments/route.ts");
const actions=read("app/api/v1/payments/actions/route.ts");
const webhook=read("app/api/webhooks/stripe/route.ts");
const directWebhook=read("app/api/webhooks/stripe/direct/[workspaceId]/route.ts");
const closeout=read("supabase/migrations/20260907133500_fix_appointment_closeout_invoice_identity.sql");

requireText(payments,"payment_provenance_required","payment provenance");
requireText(payments,"customer_mismatch","invoice/customer consistency");
requireText(payments,'status === "pending"',"pending duplicate guard");
requireText(payments,'metadata->>appointment_id',"appointment closeout identity");

requireText(actions,"already_paid","paid-state replay protection");
requireText(actions,"amount_mismatch","manual closeout exact amount");
requireText(actions,"stripe_account_mismatch","Stripe account isolation");
requireText(actions,"refund_exceeds_remaining","refund balance guard");
requireText(actions,"sw-refund-","refund idempotency key");
requireText(actions,"syncCanonicalInvoiceToStripe","canonical invoice sync");

for(const text of [webhook,directWebhook]){
  requireText(text,"stripe_event_id","webhook event provenance");
  if(!/constructEvent|constructEventAsync|webhooks\.constructEvent/.test(text)) fail("Stripe webhook signature verification missing");
  requireText(text,"provider_payment_id","provider payment reconciliation");
}

requireText(closeout,"payments_workspace_closeout_appointment_pending_uidx","single pending closeout per appointment");
requireText(closeout,"invoice_id","appointment closeout invoice identity");

console.log("payment-closeout-contract: PASS");
