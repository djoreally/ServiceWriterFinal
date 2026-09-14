import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const exists=p=>fs.existsSync(path.join(root,p));
const fail=m=>{throw new Error(`Daily-use simulation contract failed: ${m}`)};

const requiredJourneys=[
  "src/__journeys__/booking/public-booking.journey.test.tsx",
  "src/__journeys__/dispatch/dispatch-tech.journey.test.tsx",
  "src/application/commands/__tests__/coverage-critical-paths.test.ts",
  "src/application/commands/__tests__/booking-submit.command.test.ts",
  "src/application/queries/__tests__/appointments.query.test.ts",
];
for(const file of requiredJourneys) if(!exists(file)) fail(`missing journey/test ${file}`);

const pkg=JSON.parse(read("package.json"));
const simulation=pkg.scripts?.["test:daily-use-simulation"]||"";
for(const file of requiredJourneys) if(!simulation.includes(file)) fail(`simulation command does not include ${file}`);

const requiredContracts=[
  "verify:booking-reliability",
  "verify:appointment-operations",
  "verify:notification-reliability",
  "verify:payment-closeout",
  "verify:customer-vehicle-integrity",
  "verify:technician-workflow",
  "verify:service-pricing-integrity",
  "verify:data-recovery",
  "verify:performance-mobile",
  "verify:buildos-production-guardrail",
];
for(const name of requiredContracts) if(!pkg.scripts?.[name]) fail(`missing operational gate ${name}`);

const closeout=read("app/api/v1/appointments/[id]/complete/route.ts");
for(const needle of ["complete_appointment_closeout_v1","service_record_id","invoice_id","payment_id","serviceCompleted"]){
  if(!closeout.includes(needle)) fail(`closeout chain missing ${needle}`);
}
console.log("daily-use-simulation-contract: PASS");
