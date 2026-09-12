import fs from "node:fs";

const environment=process.env.ENVIRONMENT||"staging";
if(environment!=="production"){
  console.log("production-operations: SKIP outside production certification");
  process.exit(0);
}

const evidencePath=process.env.BUILDOS_PRODUCTION_EVIDENCE||".buildos/runtime/production-evidence.json";
if(!fs.existsSync(evidencePath)){
  console.error(`production-operations: missing evidence file ${evidencePath}`);
  process.exit(1);
}

const evidence=JSON.parse(fs.readFileSync(evidencePath,"utf8"));
const failures=[];
const requiredSections=["profile","settings","catalog","slots","blocked_dates"];

if(evidence.site?.status!==200) failures.push("production site is not reachable with HTTP 200");
if(evidence.health?.status!==200) failures.push("/api/v1/health is not HTTP 200");

for(const section of requiredSections){
  const row=evidence.booking?.sections?.[section];
  if(!row||row.status<200||row.status>=300||row.json!==true) failures.push(`booking section ${section} is not successful JSON`);
}
if(!evidence.booking?.slots?.date||evidence.booking?.slots?.works!==true) failures.push("near-future slot lookup is not verified");

const repeated5xx=Number(evidence.runtime?.repeated5xx??0);
const errorClusters=Number(evidence.runtime?.errorClusters??0);
if(repeated5xx>0) failures.push(`repeated production 5xx failures detected: ${repeated5xx}`);
if(errorClusters>0) failures.push(`production runtime error clusters detected: ${errorClusters}`);

for(const queueName of ["lifecycle","push"]){
  const q=evidence.queues?.[queueName];
  if(!q) { failures.push(`missing ${queueName} queue evidence`); continue; }
  if(Number(q.oldestPendingSeconds??0)>Number(q.maxAgeSeconds??900)) failures.push(`${queueName} queue oldest message exceeds threshold`);
  if(Number(q.failed??0)>0) failures.push(`${queueName} queue has failed items`);
}

if(Number(evidence.notifications?.unreconciledRequired??0)>0) failures.push("required notifications remain unreconciled");
if(Number(evidence.payments?.duplicateProviderPayments??0)>0) failures.push("duplicate provider payment IDs detected");
if(Number(evidence.payments?.invoiceCustomerMismatches??0)>0) failures.push("invoice/customer payment mismatches detected");
if(Number(evidence.payments?.successfulProviderUnreconciled??0)>0) failures.push("successful provider payments remain unreconciled");

if(!evidence.identity?.deploymentSha||evidence.identity.deploymentSha!==process.env.EXPECTED_RELEASE_SHA){
  failures.push("runtime deployment identity does not match EXPECTED_RELEASE_SHA");
}

if(failures.length){
  console.error("production-operations: RED");
  for(const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("production-operations: PASS");
