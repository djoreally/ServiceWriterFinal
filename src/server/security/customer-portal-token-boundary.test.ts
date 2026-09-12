import fs from "node:fs";import path from "node:path";
const read=(p:string)=>fs.readFileSync(path.join(process.cwd(),p),"utf8");
describe("customer portal management secret boundary",()=>{
 it("does not return bearer tokens to the portal",()=>{
   const sql=read("supabase/migrations/20260911200000_customer_portal_without_tokens.sql");
   expect(sql).toContain("get_customer_portal_appointments_v2");
   expect(sql).not.toContain("management_token text");
 });
 it("uses authenticated appointment-id actions",()=>{
   const cmd=read("src/application/commands/customer-portal.command.ts");
   expect(cmd).toContain("cancel_customer_portal_appointment_v1");
   expect(cmd).toContain("reschedule_customer_portal_appointment_v1");
   expect(cmd).not.toContain('p_management_token: managementToken');
 });
});
