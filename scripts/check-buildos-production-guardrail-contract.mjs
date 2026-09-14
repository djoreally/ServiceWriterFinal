import fs from "node:fs";
import path from "node:path";
const root=process.cwd(),read=p=>fs.readFileSync(path.join(root,p),"utf8");
const fail=m=>{throw new Error(`BuildOS production guardrail failed: ${m}`)};
const rel=read("scripts/verify-release-readiness.mjs");
const ops=read("scripts/verify-production-operations.mjs");
const cfg=JSON.parse(read("buildos.config.json"));

for(const needle of ["EXPECTED_RELEASE_SHA","BACKUP_VERIFIED_AT","ROLLBACK_PLAN_ID"]) if(!rel.includes(needle)) fail(`release verifier missing ${needle}`);
for(const needle of ["profile","settings","catalog","slots","blocked_dates","repeated5xx","errorClusters","unreconciledRequired","duplicateProviderPayments","deploymentSha"]) if(!ops.includes(needle)) fail(`production operations verifier missing ${needle}`);
if(cfg.release?.requireExactSha!==true) fail("BuildOS config does not require exact SHA");
if(!cfg.verify.includes("release")) fail("BuildOS verify sequence does not include release");
console.log("buildos-production-guardrail-contract: PASS");
