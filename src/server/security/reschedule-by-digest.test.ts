import fs from "node:fs";
import path from "node:path";
const read=(p:string)=>fs.readFileSync(path.join(process.cwd(),p),"utf8");
describe("reschedule-by-token digest verification",()=>{
 const sql=read("supabase/migrations/20260911190000_reschedule_by_digest.sql");
 it("verifies digest and preserves scheduling guards",()=>{
   expect(sql).toContain("appointment_management_tokens");
   expect(sql).toContain("extensions.digest(trim(p_management_token), 'sha256')");
   expect(sql).not.toContain("metadata->>'management_token'=p_management_token");
   expect(sql).toContain("tstzrange");
   expect(sql).toContain("reschedule_window_hours");
 });
});
