import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),"utf8");
const fail=(m)=>{throw new Error(`Notification reliability contract failed: ${m}`)};
const requireText=(text,needle,label)=>{if(!text.includes(needle))fail(`${label}: missing ${needle}`)};

const lifecycle=read("src/server/messaging/lifecycle-sender.ts");
const push=read("src/server/notifications/push-outbox.ts");
const runtime=read("supabase/migrations/20260912040000_runtime_control_plane_foundation.sql");
const pushRuntime=read("supabase/migrations/20260912043000_push_queue_control_plane.sql");
const lifecycleWorker=read("supabase/functions/lifecycle-worker/index.ts");
const pushWorker=read("supabase/functions/push-worker/index.ts");
const resendWorker=read("supabase/functions/resend-reconcile/index.ts");

if(/reconcileCrmProjection|reconcileResendDeliveryStatuses/.test(lifecycle)) {
  fail("lifecycle delivery is still coupled to CRM or Resend reconciliation");
}
requireText(runtime,"pgmq","native queue foundation");
requireText(runtime,"pg_cron","native scheduler foundation");
requireText(runtime,"lifecycle_events","lifecycle queue");
requireText(pushRuntime,"push_notifications","push queue");
requireText(pushRuntime,"enqueue_push_pgmq_bridge","push queue bridge");
requireText(pushRuntime,"read_push_queue_v1","bounded push queue reader");
requireText(pushRuntime,"defer_push_queue_v1","durable push retry deferral");

for(const [name,text] of [["lifecycle",lifecycleWorker],["push",pushWorker]]) {
  if(!/p_limit|limit/.test(text)) fail(`${name} worker has no bounded batch limit`);
  if(!/Math\.min|least\(/.test(text)) fail(`${name} worker batch/retry work is not bounded`);
  if(!/defer_|retry|set_vt/.test(text)) fail(`${name} worker has no durable retry path`);
}

requireText(lifecycleWorker,"Idempotency-Key","email provider idempotency");
requireText(lifecycleWorker,"messaging_has_active_suppression","email suppression check");
requireText(lifecycleWorker,"messaging_consents","marketing consent check");
requireText(resendWorker,"message_delivery_events","delivery reconciliation audit");
requireText(pushWorker,"subscription_gone","stale push subscription handling");
requireText(pushWorker,"disabled_at","stale subscription disablement");
requireText(pushWorker,"VAPID_PRIVATE_KEY","push provider secret contract");

console.log("notification-reliability-contract: PASS");
