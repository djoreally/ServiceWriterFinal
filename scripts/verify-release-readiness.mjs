import { execFileSync } from "node:child_process";
import fs from "node:fs";

const environment = process.env.ENVIRONMENT || "staging";
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
if (!process.env.BACKUP_VERIFIED_AT) warnings.push("No BACKUP_VERIFIED_AT evidence was supplied; verify a restorable Supabase backup/PITR point before production migration.");
if (!process.env.ROLLBACK_PLAN_ID) warnings.push("No ROLLBACK_PLAN_ID was supplied; attach the approved migration rollback or restoration procedure.");
if (!process.env.SENTRY_RELEASE) warnings.push("SENTRY_RELEASE is not set; configure release and environment tags before promotion.");
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
