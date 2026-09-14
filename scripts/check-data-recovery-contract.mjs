import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),"utf8");
const fail=(m)=>{throw new Error(`Data recovery contract failed: ${m}`)};
const requireText=(text,needle,label)=>{if(!text.includes(needle))fail(`${label}: missing ${needle}`)};

const release=read("scripts/verify-release-readiness.mjs");
const lifecycle=read("supabase/migrations/20260912040000_runtime_control_plane_foundation.sql");
const push=read("supabase/migrations/20260912043000_push_queue_control_plane.sql");
const lifecycleWorker=read("supabase/functions/lifecycle-worker/index.ts");
const pushWorker=read("supabase/functions/push-worker/index.ts");
const runbook=read("docs/OPERATIONS_RECOVERY_RUNBOOK.md");

requireText(release,'environment === "production"',"production-specific release gate");
requireText(release,"BACKUP_VERIFIED_AT","backup evidence");
requireText(release,"ROLLBACK_PLAN_ID","rollback evidence");
requireText(lifecycle,"defer_lifecycle_queue_v1","lifecycle durable retry");
requireText(push,"defer_push_queue_v1","push durable retry");
requireText(lifecycleWorker,"Idempotency-Key","email retry idempotency");
requireText(pushWorker,"subscription_gone","push stale-subscription recovery");
requireText(runbook,"Queue backlog","queue backlog recovery procedure");
requireText(runbook,"Provider outage","provider outage recovery procedure");
requireText(runbook,"Database restore","database restore procedure");

console.log("data-recovery-contract: PASS");
