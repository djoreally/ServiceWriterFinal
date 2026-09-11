import fs from "node:fs";
import path from "node:path";
const read=(p:string)=>fs.readFileSync(path.join(process.cwd(),p),"utf8");

describe("legacy appointment token compatibility",()=>{
  const sql=read("supabase/migrations/20260911170000_backfill_appointment_management_tokens.sql");
  it("hashes existing links without rewriting them",()=>{
    expect(sql).toContain("extensions.digest(a.metadata ->> 'management_token', 'sha256')");
    expect(sql).toContain("'legacy_metadata_backfill'");
    expect(sql).not.toContain("jsonb_set");
    expect(sql).not.toContain("metadata =");
  });
});
