import fs from "node:fs";import path from "node:path";
const read=(p:string)=>fs.readFileSync(path.join(process.cwd(),p),"utf8");
describe("appointment bearer abuse controls",()=>{
 const sql=read("supabase/migrations/20260911220000_management_token_abuse_controls.sql");
 it("requires canonical digests",()=>expect(sql).toContain("^[0-9a-f]{64}$"));
 it("caps successful replay uses",()=>expect(sql).toContain("use_count between 0 and 10"));
 it("requires sane expiry ordering",()=>expect(sql).toContain("expires_at > issued_at"));
});
