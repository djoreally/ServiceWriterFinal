import fs from "node:fs";
import path from "node:path";
const read=(p:string)=>fs.readFileSync(path.join(process.cwd(),p),"utf8");
describe("cancel-by-token digest verification",()=>{
 const sql=read("supabase/migrations/20260911180000_cancel_by_digest.sql");
 it("does not compare plaintext appointment metadata",()=>{
   expect(sql).toContain("appointment_management_tokens");
   expect(sql).toContain("extensions.digest(trim(p_management_token), 'sha256')");
   expect(sql).not.toContain("metadata ->> 'management_token' = p_management_token");
   expect(sql).toContain("revoked_at=v_now");
 });
});
