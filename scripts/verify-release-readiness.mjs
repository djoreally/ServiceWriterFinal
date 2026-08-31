import { execFileSync } from "node:child_process";
import fs from "node:fs";

const environment = process.env.ENVIRONMENT || process.env.VERCEL_ENV || process.env.NODE_ENV || "staging";
const deploymentURL = (process.env.VERCEL_DEPLOYMENT_URL || "").replace(/\/$/, "");
const failures = [];
const warnings = [];
const run = (command, args) => execFileSync(command, args, { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const sha = run("git", ["rev-parse", "HEAD"]);
const status = run("git", ["status", "--porcelain"]);
if (status && !(process.env.ALLOW_DIRTY_RELEASE === "true" && environment !== "production")) failures.push("Working tree is not clean; release artifacts must be committed before promotion.");
if (status && process.env.ALLOW_DIRTY_RELEASE === "true" && environment === "production") failures.push("ALLOW_DIRTY_RELEASE is forbidden in production.");
const migrationFiles = fs.readdirSync("supabase/migrations").filter((file) => file.endsWith(".sql"));
for (const file of migrationFiles) {
  if (!/^\d{14}_[a-z0-9][a-z0-9_-]*\.sql$/.test(file)) failures.push(`Invalid migration filename: ${file}`);
}
if (!process.env.VITE_ENABLE_DEMO_LOGIN || process.env.VITE_ENABLE_DEMO_LOGIN !== "false") warnings.push("Demo login is not explicitly disabled in the verifier environment; set VITE_ENABLE_DEMO_LOGIN=false for production.");
const requireProductionEvidence = (present, message) => {
  if (present) return;
  (environment === "production" ? failures : warnings).push(message);
};
requireProductionEvidence(process.env.BACKUP_VERIFIED_AT, "No BACKUP_VERIFIED_AT evidence was supplied; verify a restorable Supabase backup/PITR point before production migration.");
requireProductionEvidence(process.env.ROLLBACK_PLAN_ID, "No ROLLBACK_PLAN_ID was supplied; attach the approved migration rollback or restoration procedure.");
requireProductionEvidence(process.env.SENTRY_RELEASE, "SENTRY_RELEASE is not set; configure release and environment tags before promotion.");
requireProductionEvidence(process.env.RELEASE_APPROVAL_ID, "No RELEASE_APPROVAL_ID was supplied; attach the approved production change record.");
requireProductionEvidence(process.env.RELEASE_SHA, "RELEASE_SHA is not set; bind the release evidence to the checked-out commit.");
if (process.env.RELEASE_SHA && process.env.RELEASE_SHA !== sha) failures.push(`RELEASE_SHA does not match checked-out commit ${sha}.`);
if (process.env.BACKUP_VERIFIED_AT) {
  const backupVerifiedAt = Date.parse(process.env.BACKUP_VERIFIED_AT);
  if (!Number.isFinite(backupVerifiedAt)) failures.push("BACKUP_VERIFIED_AT must be a valid ISO-8601 timestamp.");
  else if (backupVerifiedAt > Date.now()) failures.push("BACKUP_VERIFIED_AT cannot be in the future.");
}
if (!deploymentURL) warnings.push("VERCEL_DEPLOYMENT_URL is not set; deployment probe was not run.");
if (deploymentURL && !/^https:\/\//i.test(deploymentURL)) failures.push("VERCEL_DEPLOYMENT_URL must use HTTPS.");

console.log(`release_sha\t${sha}`);
console.log(`environment\t${environment}`);
console.log(`migrations\t${migrationFiles.length} filenames checked`);
for (const warning of warnings) console.warn(`WARNING\t${warning}`);
if (failures.length) {
  console.error("Release-readiness verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Release-readiness structural checks passed for ${environment}.`);
