import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

export const requiredFiles=["AGENTS.md","BUILDOS.md","buildos.config.json",".buildos/state.json",".buildos/product.json",".buildos/architecture.json"];
export function readJson(path){return JSON.parse(readFileSync(path,"utf8"))}
export function writeText(path,content){mkdirSync(dirname(path),{recursive:true});writeFileSync(path,content)}
export function git(args,options={}){return execFileSync("git",args,{encoding:"utf8",stdio:options.stdio??"pipe"}).trim()}
export function commandExists(command){try{execSync(`${command} --version`,{stdio:"ignore"});return true}catch{return false}}
export function getConfig(cwd){return readJson(join(cwd,"buildos.config.json"))}

export function validateState(cwd){
  const missing=requiredFiles.filter(f=>!existsSync(join(cwd,f)));
  if(missing.length)throw new Error(`Missing BuildOS files: ${missing.join(", ")}`);
  const state=readJson(join(cwd,".buildos/state.json"));
  const allowed=new Set(["not_started","in_progress","blocked","built","deployed","verified","green","red"]);
  if(!allowed.has(state.status))throw new Error(`Invalid BuildOS status: ${state.status}`);
  if(state.status==="green"){
    if(!state.lastCertifiedSha||!state.productionSha)throw new Error("GREEN requires lastCertifiedSha and productionSha evidence.");
    if(state.lastCertifiedSha!==state.productionSha)throw new Error("GREEN requires the certified SHA to equal the production SHA.");
  }
  return state;
}

function pkg(cwd){try{return readJson(join(cwd,"package.json"))}catch{return null}}
function collectFiles(root,dir,predicate,out=[]){
  const absolute=join(root,dir);
  if(!existsSync(absolute))return out;
  for(const name of readdirSync(absolute)){
    const full=join(absolute,name);const rel=relative(root,full).replaceAll("\\","/");
    const stat=statSync(full);
    if(stat.isDirectory())collectFiles(root,rel,predicate,out);else if(predicate(rel))out.push(rel);
  }
  return out;
}

export function discoverAgentInstructions(cwd){
  const known=[
    ["AGENTS.md","buildos"],["CLAUDE.md","claude"],["GEMINI.md","gemini"],[".cursorrules","cursor"],[".windsurfrules","windsurf"],
    [".github/copilot-instructions.md","github-copilot"]
  ];
  const dynamic=[
    ...collectFiles(cwd,".cursor/rules",p=>/\.(md|mdc)$/i.test(p)).map(p=>[p,"cursor"]),
    ...collectFiles(cwd,".windsurf/rules",p=>/\.md$/i.test(p)).map(p=>[p,"windsurf"]),
    ...collectFiles(cwd,".github/instructions",p=>/\.instructions\.md$/i.test(p)).map(p=>[p,"github-copilot"])
  ];
  const sources=[...known,...dynamic].filter(([path])=>existsSync(join(cwd,path))).map(([path,agent])=>{
    const content=readFileSync(join(cwd,path),"utf8");
    const rules=content.split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&(/^(?:[-*]|\d+\.)\s+/.test(s)||/\b(must|never|always|do not|don't|required|before|after)\b/i.test(s))).slice(0,200);
    return {agent,path,format:path.endsWith(".md")||path.endsWith(".mdc")?"markdown":"text",rules,contentHash:Buffer.from(content).toString("base64url").slice(0,24)};
  });
  return {
    version:1,
    generatedAt:new Date().toISOString(),
    canonicalSource:"BuildOS",
    sources,
    normalizedRules:sources.flatMap(source=>source.rules.map((instruction,index)=>({id:`${source.agent}:${source.path}:${index+1}`,sourceAgent:source.agent,sourcePath:source.path,instruction,scope:"repository",enforcementLevel:source.agent==="buildos"?"canonical":"imported",canonicalRule:null,conflicts:[],provenance:{sourcePath:source.path}})))
  };
}

export function writeAgentPolicy(cwd,policy){writeText(join(cwd,".buildos/agent-policy.json"),`${JSON.stringify(policy,null,2)}\n`)}

export function discover(cwd){
  const p=pkg(cwd),deps={...(p?.dependencies||{}),...(p?.devDependencies||{})},has=n=>Boolean(deps[n]);
  let framework=null;if(has("next"))framework="Next.js";else if(has("@remix-run/react"))framework="Remix";else if(has("@tanstack/react-start"))framework="TanStack Start";else if(has("vite"))framework="Vite";else if(has("react"))framework="React";
  const packageManager=existsSync(join(cwd,"pnpm-lock.yaml"))?"pnpm":existsSync(join(cwd,"yarn.lock"))?"yarn":existsSync(join(cwd,"bun.lock"))||existsSync(join(cwd,"bun.lockb"))?"bun":existsSync(join(cwd,"package-lock.json"))?"npm":p?.packageManager?.split("@")[0]||null;
  const database=has("@supabase/supabase-js")?"Supabase":has("drizzle-orm")?"Drizzle ORM":has("prisma")||has("@prisma/client")?"Prisma":has("pg")?"PostgreSQL":null;
  const auth=has("next-auth")||has("@auth/core")?"Auth.js":has("@clerk/nextjs")?"Clerk":has("@supabase/ssr")||has("@supabase/supabase-js")?"Supabase Auth":null;
  const deployment=existsSync(join(cwd,"vercel.json"))||has("next")?"Vercel-compatible":null,ci=existsSync(join(cwd,".github/workflows"))?"GitHub Actions":null,scripts=p?.scripts||{};
  const agentPolicy=discoverAgentInstructions(cwd);
  return {version:1,detectedAt:new Date().toISOString(),name:p?.name||null,runtime:framework,packageManager,database,auth,deployment,ci,agents:[...new Set(agentPolicy.sources.map(s=>s.agent))],commands:{typecheck:scripts.typecheck||null,lint:scripts.lint||null,test:scripts.test||null,build:scripts.build||null},evidence:{packageJson:Boolean(p),git:existsSync(join(cwd,".git")),migrations:["supabase/migrations","drizzle","prisma/migrations","migrations"].filter(x=>existsSync(join(cwd,x))),agentInstructionSources:agentPolicy.sources.map(s=>s.path)}};
}

export function packageScriptCommand(packageManager,script){
  if(!packageManager)return null;
  if(packageManager==="npm")return `npm run ${script}`;
  if(packageManager==="pnpm")return `pnpm run ${script}`;
  if(packageManager==="yarn")return `yarn ${script}`;
  if(packageManager==="bun")return `bun run ${script}`;
  return null;
}

export function configFromDiscovery(d){
  const commands={};
  for(const name of ["typecheck","lint","test","build"])if(d.commands?.[name])commands[name]=packageScriptCommand(d.packageManager,name);
  const check=["state",...["typecheck","lint","test"].filter(name=>commands[name])];
  const verify=[...check,...(commands.build?["build"]:[])];
  const missingChecks=["typecheck","lint","test","build"].filter(name=>!commands[name]);
  return {version:1,stateDirectory:".buildos",agentContract:"AGENTS.md",specification:"BUILDOS.md",commands,check,verify,missingChecks,requireChangeRecord:true,release:{requireCleanTree:true,requireExactSha:true}};
}

export function workflowFromDiscovery(d){
  const pm=d.packageManager;
  const install=pm==="npm"?"npm install":pm==="pnpm"?"pnpm install --frozen-lockfile":pm==="yarn"?"yarn install --immutable":pm==="bun"?"bun install --frozen-lockfile":null;
  if(!pm||!install)return null;
  const prep=pm==="pnpm"||pm==="yarn"?"      - run: corepack enable\n":pm==="bun"?"      - uses: oven-sh/setup-bun@v2\n":"";
  const cache=pm==="npm"?`\n          cache: npm`:"";
  return `name: BuildOS\n\non:\n  pull_request:\n  push:\n    branches: [main]\n\npermissions:\n  contents: read\n\njobs:\n  verify:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 24${cache}\n${prep}      - run: ${install}\n      - name: Verify with BuildOS\n        run: npx buildos verify\n      - name: Expose BuildOS repair context\n        if: failure()\n        run: if [ -f .buildos/repair/latest.json ]; then cat .buildos/repair/latest.json; fi\n`;
}

export function writeDiscovery(cwd,d){
  writeText(join(cwd,".buildos/discovery.json"),`${JSON.stringify(d,null,2)}\n`);
  writeAgentPolicy(cwd,discoverAgentInstructions(cwd));
  const product=readJson(join(cwd,".buildos/product.json"));if(!product.name&&d.name)product.name=d.name;writeText(join(cwd,".buildos/product.json"),`${JSON.stringify(product,null,2)}\n`);
  const arch=readJson(join(cwd,".buildos/architecture.json"));arch.web=d.runtime||arch.web;arch.database=d.database||arch.database||null;arch.auth=d.auth||arch.auth||null;arch.deployment=d.deployment||arch.deployment;arch.ci={provider:d.ci||arch.ci?.provider||null};arch.packageManager=d.packageManager;arch.aiAgents=d.agents||[];writeText(join(cwd,".buildos/architecture.json"),`${JSON.stringify(arch,null,2)}\n`);
}

export function requireChangeRecord(cwd){const cfg=getConfig(cwd);if(!cfg.requireChangeRecord)return;const dir=join(cwd,".buildos/changes");if(!existsSync(dir)||!readdirSync(dir).some(f=>f.endsWith(".json")))throw new Error("BuildOS requires a change record before verification.")}

function classifyFailure(check,output){
  const gate=String(check||"").toLowerCase();
  if(["state","lint","typecheck","test","build"].includes(gate))return gate;
  if(gate.includes("migration")||gate.includes("schema"))return"schema";
  if(gate.includes("auth")||gate.includes("permission"))return"authorization";
  const text=String(output||"").toLowerCase();
  if(text.includes("migration")||text.includes("schema"))return"schema";
  if(text.includes("auth")||text.includes("permission"))return"authorization";
  return"gate";
}
export function writeRepairContext(cwd,{phase,check,command,error,output}){
  const record={version:1,status:"red",createdAt:new Date().toISOString(),phase,failedCheck:check,command,classification:classifyFailure(check,output),error:String(error?.message||error),output:String(output||"").slice(-12000),instructions:["Identify the root cause from this evidence.","Repair the smallest complete cause; do not bypass or weaken the gate.",`Rerun the exact failed check: ${command||check}.`,"Continue to later BuildOS gates only after this check passes.","If deployment previously failed, redeploy the repaired exact SHA and verify production.","Preserve this RED event in BuildOS evidence."],humanGate:false};
  const json=`${JSON.stringify(record,null,2)}\n`;
  writeText(join(cwd,".buildos/repair/latest.json"),json);
  const stamp=record.createdAt.replace(/[:.]/g,"-");
  writeText(join(cwd,".buildos/repair/history",`${stamp}-${String(check||"gate").replace(/[^a-z0-9_-]/gi,"_")}.json`),json);
  return record;
}
export function getRepairContext(cwd){const path=join(cwd,".buildos/repair/latest.json");return existsSync(path)?readJson(path):null}

export function runConfigured(cwd,phase){
  const config=getConfig(cwd);if(phase==="verify")requireChangeRecord(cwd);
  for(const check of config[phase]??[]){
    if(check==="state"){
      try{validateState(cwd);console.log("✓ state")}catch(error){const repair=writeRepairContext(cwd,{phase,check:"state",command:`buildos ${phase}`,error,output:error?.message||""});console.error(`✗ state failed. Repair context written to .buildos/repair/latest.json (${repair.classification}).`);throw error}
      continue;
    }
    const command=config.commands?.[check];
    if(!command){const error=new Error(`No command configured for check: ${check}`);writeRepairContext(cwd,{phase,check,command:check,error,output:error.message});throw error}
    console.log(`→ ${check}: ${command}`);
    try{const output=execSync(command,{cwd,encoding:"utf8",env:{...process.env,BUILDOS_RUNNING:"1"}});if(output)process.stdout.write(output);console.log(`✓ ${check}`)}catch(error){const output=`${error?.stdout||""}${error?.stderr||""}`;if(error?.stdout)process.stdout.write(String(error.stdout));if(error?.stderr)process.stderr.write(String(error.stderr));const repair=writeRepairContext(cwd,{phase,check,command,error,output});console.error(`✗ ${check} failed. Repair context written to .buildos/repair/latest.json (${repair.classification}).`);throw error}
  }
}
export function installHooks(cwd){if(!existsSync(join(cwd,".git")))throw new Error("Not a Git repository.");git(["config","core.hooksPath",".githooks"])}
