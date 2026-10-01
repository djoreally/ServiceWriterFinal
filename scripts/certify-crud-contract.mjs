import fs from "node:fs";

const resources = [
  ["customers", "app/api/v1/customers/route.ts", "app/api/v1/customers/[id]/route.ts", ["GET","POST"], ["GET","PATCH","DELETE"]],
  ["vehicles", "app/api/v1/vehicles/route.ts", "app/api/v1/vehicles/[id]/route.ts", ["GET","POST"], ["GET","PATCH","DELETE"]],
  ["appointments", "app/api/v1/appointments/route.ts", "app/api/v1/appointments/[id]/route.ts", ["GET","POST"], ["GET","PATCH","DELETE"]],
  ["service-records", "app/api/v1/service-records/route.ts", "app/api/v1/service-records/[id]/route.ts", ["GET","POST"], ["GET","PATCH","DELETE"]],
  ["invoices", "app/api/v1/invoices/route.ts", "app/api/v1/invoices/[id]/route.ts", ["GET","POST"], ["GET","PATCH","DELETE"]],
  ["payments", "app/api/v1/payments/route.ts", "app/api/v1/payments/[id]/route.ts", ["GET","POST"], ["GET","PATCH","DELETE"]],
  ["work-orders", "app/api/v1/work-orders/route.ts", "app/api/v1/work-orders/[id]/route.ts", ["GET","POST"], ["GET","PATCH"]],
  ["crm-profiles", "app/api/v1/crm/profiles/route.ts", "app/api/v1/crm/profiles/route.ts", ["GET","POST"], ["GET","PATCH"]],
  ["crm-campaigns", "app/api/v1/crm/campaigns/route.ts", "app/api/v1/crm/campaigns/route.ts", ["GET","POST"], ["GET"]],
  ["crm-activities", "app/api/v1/crm/activities/route.ts", "app/api/v1/crm/activities/route.ts", ["GET","POST"], ["GET"]],
  ["invitations", "app/api/v1/invitations/route.ts", "app/api/v1/invitations/[id]/route.ts", ["GET","POST"], ["DELETE"]],
];

const failures = [];
function methods(file) {
  if (!fs.existsSync(file)) { failures.push(`missing route: ${file}`); return new Set(); }
  const source = fs.readFileSync(file, "utf8");
  if (file.startsWith("app/api/v1/") && !source.includes("requireWorkspaceMember(") && !source.includes("requireCrmAccess(") && !file.includes("invitations")) failures.push(`${file}: mutable workspace route must enforce canonical workspace authorization`);
  if (file.startsWith("app/api/v1/") && !source.includes("workspace_id") && !source.includes("workspaceId") && !file.includes("invitations")) failures.push(`${file}: mutable workspace route must bind workspace identity`);
  return new Set([...source.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]));
}
for (const [name, collection, member, collectionRequired, memberRequired] of resources) {
  const c = methods(collection), m = methods(member);
  for (const verb of collectionRequired) if (!c.has(verb)) failures.push(`${name}: ${collection} missing ${verb}`);
  for (const verb of memberRequired) if (!m.has(verb)) failures.push(`${name}: ${member} missing ${verb}`);
  console.log(`${name}\tcollection=[${[...c].join(",")}]\tmember=[${[...m].join(",")}]`);
}

const terminalActions = [
  ["appointment complete", "app/api/v1/appointments/[id]/complete/route.ts", "POST"],
  ["quote status", "app/api/v1/quotes/[id]/status/route.ts", "POST"],
  ["quote convert", "app/api/v1/quotes/[id]/convert/route.ts", "POST"],
  ["invoice send", "app/api/v1/invoices/[id]/send/route.ts", "POST"],
  ["work-order checklist advance", "app/api/v1/work-orders/checklist/advance/route.ts", "POST"],
  ["dispatch assign", "app/api/v1/dispatch/assign/route.ts", "POST"],
];
for (const [name,file,verb] of terminalActions) if (!methods(file).has(verb)) failures.push(`${name}: missing ${verb} at ${file}`);

if (failures.length) {
  console.error("CRUD contract certification FAILED");
  failures.forEach((f) => console.error("- " + f));
  process.exit(1);
}
console.log("CRUD contract certification PASS: canonical mutable resources expose their required lifecycle operations.");
