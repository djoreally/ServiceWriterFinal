import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),"utf8");
const fail=(m)=>{throw new Error(`Technician workflow contract failed: ${m}`)};
const requireText=(text,needle,label)=>{if(!text.includes(needle))fail(`${label}: missing ${needle}`)};

const workOrders=read("app/api/v1/work-orders/route.ts");
const workOrder=read("app/api/v1/work-orders/[id]/route.ts");
const dispatch=read("app/api/v1/dispatch/assign/route.ts");
const complete=read("app/api/v1/appointments/[id]/complete/route.ts");

for(const text of [workOrders,workOrder,dispatch,complete]) requireText(text,"requireWorkspaceMember","workspace authorization");

requireText(workOrders,"create_work_order_v1","canonical work-order creation RPC");
requireText(workOrder,"TECHNICIAN_FIELDS","technician field allowlist");
requireText(workOrder,"TECHNICIAN_STATUSES","technician status allowlist");
requireText(workOrder,"technician_assignment_required","active assignment enforcement");
requireText(workOrder,"patch_work_order_v1","canonical work-order mutation RPC");

requireText(dispatch,"assign_dispatch_job_v1","canonical dispatch assignment");
requireText(dispatch,"technicianAssigned","customer assignment lifecycle");
requireText(dispatch,"jobAssigned","technician assignment lifecycle");
requireText(dispatch,"assignmentChanged","previous technician notification");

requireText(complete,"complete_appointment_closeout_v1","atomic appointment closeout");
requireText(complete,"This appointment is not assigned to you.","technician appointment ownership");
requireText(complete,"service_record_id","service history creation");
requireText(complete,"invoice_id","invoice closeout");
requireText(complete,"payment_id","payment closeout");
requireText(complete,"serviceCompleted","completion lifecycle notification");

console.log("technician-workflow-contract: PASS");
