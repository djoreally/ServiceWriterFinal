import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),"utf8");
const fail=(m)=>{throw new Error(`Performance/mobile contract failed: ${m}`)};
const requireText=(text,needle,label)=>{if(!text.includes(needle))fail(`${label}: missing ${needle}`)};

const appointments=read("src/legacy-pages/Appointments.tsx");
const query=read("src/application/queries/appointments.query.ts");
const api=read("app/api/v1/appointments/route.ts");
const client=read("src/lib/nextApiClient.ts");
const table=read("src/components/ui/table.tsx");
const mobile=read("src/components/appointments/MobileAppointmentView.tsx");

requireText(appointments,'useState<"all" | "upcoming">("upcoming")',"appointments default window");
requireText(appointments,'fetchAppointmentsPageData({ initialOnly: true, fullHistory: false })',"appointments fast first paint");
requireText(appointments,'fetchAppointmentsPageData({ fullHistory: sourceFilter === "all" })',"explicit full history");
requireText(query,"sevenDaysOut","bounded seven-day operational window");
requireText(query,"nextApi.appointments.listWindow","bounded appointments API client");
requireText(api,'url.searchParams.get("from")',"appointment lower-bound query");
requireText(api,'url.searchParams.get("to")',"appointment upper-bound query");
requireText(client,"for (;;)","bounded-window pagination");
requireText(client,"response.data.length < pageSize","pagination termination");

requireText(table,"overflow-x-auto","table narrow-container overflow");
requireText(table,"overscroll-x-contain","table overscroll containment");
requireText(table,"tabular-nums","numeric alignment");

for(const mode of ["'list'","'calendar'","'month'"]) requireText(mobile,mode,"mobile appointment view modes");
requireText(mobile,"overflow-x-auto","mobile horizontal control containment");
requireText(mobile,"MobileAppointmentCard","mobile ranked appointment cards");
requireText(mobile,"ScrollArea","mobile scroll containment");

if(/fetchAppointmentsPageData\(\)\s*;/.test(appointments)) fail("appointments page must not use an unbounded default page-data fetch");
console.log("performance-mobile-contract: PASS");
