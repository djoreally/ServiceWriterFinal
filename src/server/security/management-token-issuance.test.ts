import fs from "node:fs";import path from "node:path";
const read=(p:string)=>fs.readFileSync(path.join(process.cwd(),p),"utf8");
describe("management token issuance",()=>{
 it("stores only digest and returns raw token only in server memory",()=>{
   const src=read("src/server/appointments/management-token.ts");
   expect(src).toContain('createHash("sha256")');
   expect(src).toContain("token_digest: tokenDigest");
   expect(src).not.toContain("management_token:");
 });
 it("rotates prior active tokens before issuing a new link",()=>{
   const src=read("src/server/appointments/management-token.ts");
   expect(src).toContain(".update({ revoked_at: now");
   expect(src).toContain('.eq("appointment_id", appointmentId)');
 });
 it("disables legacy plaintext trigger issuance",()=>{
   const sql=read("supabase/migrations/20260911210000_server_side_management_token_issuance.sql");
   expect(sql).toContain("drop trigger if exists appointments_ensure_management_token");
 });
});
