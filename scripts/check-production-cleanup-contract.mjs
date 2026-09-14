import fs from "node:fs";
import path from "node:path";
const root=process.cwd(),read=p=>fs.readFileSync(path.join(root,p),"utf8");
const fail=m=>{throw new Error(`Production cleanup contract failed: ${m}`)};

const appointments=read("src/legacy-pages/Appointments.tsx");
const form=read("src/components/appointments/AppointmentForm.tsx");
const workflow=read(".github/workflows/buildos.yml");
const pkg=JSON.parse(read("package.json"));
const vercel=JSON.parse(read("vercel.json"));
const runtime=read("supabase/migrations/20260912040000_runtime_control_plane_foundation.sql");

if(appointments.includes("Implementation to be added")) fail("Appointments still contains placeholder creation callbacks");
if(/onCreateCustomer|onCreateVehicle/.test(appointments)) fail("Appointments still passes retired customer/vehicle callbacks");
if(/onCreateCustomer|onCreateVehicle|businessUserId/.test(form)) fail("AppointmentForm still exposes retired props");
if(workflow.includes("npx buildos")) fail("BuildOS workflow still depends on unpublished npm package");
if(!workflow.includes("e5627fa85c995f59f446b0fc7127081601e7d604")) fail("BuildOS workflow is not pinned to the reviewed source SHA");
if(!pkg.scripts?.["buildos:verify"]?.includes("run-buildos-from-source")) fail("BuildOS verify script is not source-backed");

const criticalCrons=(vercel.crons||[]).filter(c=>/outbox/.test(c.path||""));
if(criticalCrons.length){
  if(!runtime.includes("pgmq")||!runtime.includes("pg_cron")) fail("temporary host cron remains without backend-native replacement evidence");
}
console.log(`production-cleanup-contract: PASS (temporary host crons=${criticalCrons.length})`);
