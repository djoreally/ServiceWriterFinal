import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const sha = process.env.GITHUB_SHA;
const token = process.env.VERCEL_TOKEN;
const projectId = process.env.VERCEL_PROJECT_ID || "prj_LwYh6HJuUsB2LZG9eoKs23hDoJuw";
const teamId = process.env.VERCEL_TEAM_ID || "team_TVsn1EJ6DUqcEbCqWTNsUhYD";
const productionUrl = (process.env.SERVICEWRITER_PRODUCTION_URL || "https://servicewriter.xyz").replace(/\/$/, "");

if (!sha || !token) {
  console.error("GITHUB_SHA and VERCEL_TOKEN are required for BuildOS production certification.");
  process.exit(2);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let deployment = null;

for (let attempt = 0; attempt < 60; attempt += 1) {
  const response = await fetch(
    `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectId)}&target=production&limit=20&teamId=${encodeURIComponent(teamId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    console.error(`Vercel deployment lookup failed: HTTP ${response.status}`);
    process.exit(1);
  }
  const body = await response.json();
  deployment = (body.deployments || []).find((item) => item?.meta?.githubCommitSha === sha) || null;
  if (deployment?.readyState === "READY" || deployment?.state === "READY") break;
  if (deployment && (deployment.readyState === "ERROR" || deployment.state === "ERROR")) {
    console.error(`Exact production deployment ${deployment.uid || deployment.id} failed.`);
    process.exit(1);
  }
  await sleep(10_000);
}

if (!deployment || (deployment.readyState !== "READY" && deployment.state !== "READY")) {
  console.error(`No READY production deployment found for exact SHA ${sha}.`);
  process.exit(1);
}

const probes = [
  { path: "/", accept: "text/html", json: false },
  { path: "/api/v1/health", accept: "application/json", json: true },
  { path: "/api/v1/public-booking/momsoilchange?section=profile", accept: "application/json", json: true },
  { path: "/api/v1/public-booking/momsoilchange?section=settings", accept: "application/json", json: true },
  { path: "/api/v1/public-booking/momsoilchange?section=catalog", accept: "application/json", json: true },
  { path: "/api/v1/public-booking/momsoilchange?section=blocked_dates", accept: "application/json", json: true },
];

for (const probe of probes) {
  const response = await fetch(new URL(probe.path, productionUrl), { headers: { Accept: probe.accept } });
  const text = await response.text();
  if (!response.ok) throw new Error(`${probe.path} returned HTTP ${response.status}`);
  if (probe.json) {
    try { JSON.parse(text); } catch { throw new Error(`${probe.path} returned non-JSON content`); }
  }
}

const repository = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}.git`
  : "https://github.com/djoreally/ServiceWriterFinal.git";
const release = {
  version: 1,
  status: "green",
  repository,
  branch: process.env.GITHUB_REF_NAME || "main",
  commitSha: sha,
  verifiedAt: new Date().toISOString(),
  productionVerification: "verified",
  deployment: {
    provider: "vercel",
    id: deployment.uid || deployment.id,
    url: productionUrl,
    state: "READY",
    sourceSha: sha,
    verifiedAt: new Date().toISOString(),
  },
  evidence: [
    { type: "buildos.verify", status: "passed", sourceSha: sha },
    { type: "servicewriter.production-smoke", status: "passed", url: productionUrl },
  ],
  findings: [],
};

mkdirSync(join(".buildos", "releases"), { recursive: true });
const path = join(".buildos", "releases", `${sha}.json`);
writeFileSync(path, JSON.stringify(release, null, 2) + "\n");
console.log(path);
