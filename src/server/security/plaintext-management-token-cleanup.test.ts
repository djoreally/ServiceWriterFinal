import fs from "node:fs";import path from "node:path";
const read=(p:string)=>fs.readFileSync(path.join(process.cwd(),p),"utf8");
describe("legacy plaintext management token cleanup",()=>{
 const sql=read("supabase/migrations/20260911230000_remove_plaintext_management_tokens.sql");
 it("removes metadata token material",()=>{
   expect(sql).toContain("metadata = coalesce(metadata,'{}'::jsonb) - 'management_token'");
 });
 it("removes legacy token generator",()=>{
   expect(sql).toContain("drop function if exists public.ensure_appointment_management_token_v1()");
 });
});
