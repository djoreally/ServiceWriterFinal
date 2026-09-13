import fs from "node:fs";import path from "node:path";
const read=(p:string)=>fs.readFileSync(path.join(process.cwd(),p),"utf8");
describe("shot 24 release contract",()=>{
 it("keeps legacy MyBookings on the token-free portal contract",()=>{
   const q=read("src/application/queries/customer-booking.query.ts");
   const page=read("src/legacy-pages/MyBookings.tsx");
   expect(q).toContain("get_customer_portal_appointments_v2");
   expect(q).not.toContain("management_token,");
   expect(page).toContain("can_manage: boolean");
   expect(page).not.toContain("booking.management_token");
 });
 it("uses composite row assignment in bearer RPC migrations",()=>{
   for(const p of ["supabase/migrations/20260911180000_cancel_by_digest.sql","supabase/migrations/20260911190000_reschedule_by_digest.sql"]){
     const sql=read(p);
     expect(sql).toContain("select a, t.id");
     expect(sql).not.toContain("select a.*, t.id");
   }
 });
});
