import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const config = JSON.parse(readFileSync("buildos.config.json","utf8"));
const phase = process.argv[2] || "check";
const checks = config[phase];
if (!Array.isArray(checks)) {
  console.error(`Unknown BuildOS phase: ${phase}`);
  process.exit(2);
}
for (const check of checks) {
  if (check === "state") continue;
  const command = config.commands?.[check];
  if (!command) {
    console.error(`Missing BuildOS command for ${check}`);
    process.exit(1);
  }
  console.log(`BuildOS ${phase}: ${check} → ${command}`);
  execSync(command,{stdio:"inherit",env:{...process.env,BUILDOS_RUNNING:"1"}});
}
console.log(`BuildOS ${phase}: GREEN`);
