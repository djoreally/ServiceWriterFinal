import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),"utf8");
const fail=(m)=>{throw new Error(`Customer/vehicle integrity contract failed: ${m}`)};
const requireText=(text,needle,label)=>{if(!text.includes(needle))fail(`${label}: missing ${needle}`)};

const customers=read("app/api/v1/customers/route.ts");
const vehicles=read("app/api/v1/vehicles/route.ts");
const vehicle=read("app/api/v1/vehicles/[id]/route.ts");

for(const text of [customers,vehicles,vehicle]) requireText(text,"requireWorkspaceMember","workspace authorization");
for(const text of [customers,vehicles,vehicle]) requireText(text,'.eq("workspace_id"',"workspace-scoped data access");

requireText(vehicles,"assertCustomerInWorkspace","vehicle/customer tenant integrity");
requireText(vehicle,"Customer does not belong to this workspace.","vehicle reassignment tenant integrity");
requireText(vehicle,'supabase.functions.invoke("vin-decode"',"server-side VIN change decode");
requireText(vehicle,"vinChanged","VIN-change detection");
requireText(vehicle,"vin_changed_pending_decode","stale-fitment invalidation state");
requireText(vehicle,"vehicle_service_specs","dependent service-spec reconciliation");
requireText(vehicle,"archived_at","non-destructive vehicle removal");

console.log("customer-vehicle-integrity-contract: PASS");
