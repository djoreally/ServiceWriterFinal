import fs from "node:fs";
import path from "node:path";
const read=(p:string)=>fs.readFileSync(path.join(process.cwd(),p),"utf8");

describe("appointment management token storage",()=>{
  const sql=read("supabase/migrations/20260911160000_appointment_management_token_store.sql");
  it("stores only digests server-side",()=>{
    expect(sql).toContain("token_digest text not null");
    expect(sql).not.toContain("raw_token");
    expect(sql).toContain("revoke all on table public.appointment_management_tokens from public, anon, authenticated");
  });
});
