import fs from "node:fs";
import path from "node:path";

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("Google Calendar token boundary", () => {
  const migration = read("supabase/migrations/20260911070000_google_calendar_token_boundary.sql");

  it("removes direct browser access to OAuth token rows", () => {
    expect(migration).toContain(
      "revoke all on table public.google_calendar_sync_tokens from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant select, insert, update, delete on table public.google_calendar_sync_tokens to service_role",
    );
  });

  it("removes owner policies that exposed encrypted tokens to browser sessions", () => {
    expect(migration).toContain(
      "drop policy if exists google_calendar_sync_tokens_owner_select on public.google_calendar_sync_tokens",
    );
    expect(migration).toContain(
      "drop policy if exists google_calendar_sync_tokens_owner_write on public.google_calendar_sync_tokens",
    );
  });

  it("keeps Google Calendar token reads and writes behind the service-role integration", () => {
    const edge = read("supabase/functions/google-calendar-sync/index.ts");
    expect(edge).toContain('admin.from("google_calendar_sync_tokens")');
    expect(edge).toContain("authenticatedUser(request)");
    expect(edge).toContain("GOOGLE_CLIENT_SECRET");
  });
});
