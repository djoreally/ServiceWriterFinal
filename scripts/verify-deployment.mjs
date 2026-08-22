const baseURL = (process.env.VERCEL_DEPLOYMENT_URL || process.argv[2] || "").replace(/\/$/, "");
const paths = (process.env.DEPLOYMENT_PATHS || "/").split(",").map((path) => path.trim()).filter(Boolean);
const apiHealthURL = process.env.NEXT_API_HEALTH_URL || "";

if (!baseURL || !/^https:\/\//i.test(baseURL)) {
  console.error("Usage: VERCEL_DEPLOYMENT_URL=https://... npm run verify:deployment");
  console.error("Refusing to verify a missing or non-HTTPS deployment URL.");
  process.exit(2);
}

const failures = [];
async function checkPage(path) {
  const target = new URL(path, `${baseURL}/`).toString();
  try {
    const response = await fetch(target, { redirect: "manual", headers: { Accept: "text/html" } });
    const body = await response.text();
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")?.includes("vercel.com")) {
      failures.push(`${path}: Vercel Protection redirect; use an authorized smoke-test storage state.`);
    } else if (response.status >= 400) {
      failures.push(`${path}: HTTP ${response.status}`);
    } else if (!body.includes("id=\"root\"") && !body.includes("id='root'")) {
      failures.push(`${path}: React root marker was not found in the deployment HTML.`);
    } else {
      console.log(`${path}\tHTTP ${response.status}\tPASS`);
    }
  } catch (error) {
    failures.push(`${path}: ${error instanceof Error ? error.message : "request failed"}`);
  }
}

for (const path of paths) await checkPage(path);
if (apiHealthURL) {
  try {
    const response = await fetch(apiHealthURL, { headers: { Accept: "application/json" } });
    if (!response.ok) failures.push(`API health: HTTP ${response.status}`);
    else console.log(`API health\tHTTP ${response.status}\tPASS`);
  } catch (error) {
    failures.push(`API health: ${error instanceof Error ? error.message : "request failed"}`);
  }
}
if (failures.length) {
  console.error("Deployment verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Deployment verification passed for ${paths.length} public path(s).`);
