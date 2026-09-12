import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),"utf8");
const fail=(m)=>{throw new Error(`Appointment operations contract failed: ${m}`)};
const requireText=(text,needle,label)=>{if(!text.includes(needle))fail(`${label}: missing ${needle}`)};

const page=read("src/legacy-pages/Appointments.tsx");
const query=read("src/application/queries/appointments.query.ts");
const listRoute=read("app/api/v1/appointments/route.ts");
const detailRoute=read("app/api/v1/appointments/[id]/route.ts");
const dashboard=read("src/application/queries/dashboard-cockpit.query.ts");
const provider=read("src/application/queries/provider-snapshot.query.ts");

requireText(page,'useState<"all" | "upcoming">("upcoming")',"default upcoming view");
requireText(page,'fetchAppointmentsPageData({ initialOnly: true, fullHistory: false })',"fast first load");
requireText(page,'fetchAppointmentsPageData({ fullHistory: sourceFilter === "all" })',"explicit full history load");
requireText(query,"nextApi.appointments.listWindow","bounded query client");
requireText(listRoute,'url.searchParams.get("from")',"from filter");
requireText(listRoute,'url.searchParams.get("to")',"to filter");
requireText(listRoute,'.gte("starts_at"',"bounded starts_at lower bound");
requireText(listRoute,'.lte("starts_at"',"bounded starts_at upper bound");

requireText(detailRoute,'"invalid_assignment"',"assignment validation");
requireText(detailRoute,'"schedule_conflict"',"reschedule conflict protection");
requireText(detailRoute,'status:"cancelled"',"soft cancellation");
requireText(detailRoute,'dispatchAppointmentLifecycle',"lifecycle notification dispatch");

for(const text of [dashboard,provider]){
  if(!/\.eq\(['"]workspace_id['"],\s*workspaceId\)/.test(text)) fail("workspace-scoped appointment/dashboard reads");
  if(!/limit\(\d+\)/.test(text))fail("dashboard appointment lists must stay bounded");
}

console.log("appointment-operations-contract: PASS");
