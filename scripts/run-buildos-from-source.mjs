import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const command=process.argv[2]||"verify";
const configured=process.env.BUILDOS_CLI_PATH?.trim();
const candidates=[
  configured,
  path.resolve(".buildos-tool/packages/cli/bin/buildos.js"),
  path.resolve("../buildos-app-forge/packages/cli/bin/buildos.js"),
].filter(Boolean);

const cli=candidates.find(p=>fs.existsSync(p));
if(!cli){
  console.error("BuildOS source CLI not found. Set BUILDOS_CLI_PATH or checkout buildos-app-forge at the pinned revision.");
  process.exit(1);
}
const result=spawnSync(process.execPath,[cli,command],{stdio:"inherit",cwd:process.cwd(),env:process.env});
process.exit(result.status??1);
