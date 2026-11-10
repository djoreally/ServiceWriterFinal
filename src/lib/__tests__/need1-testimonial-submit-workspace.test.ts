import { readFileSync } from "node:fs";
import { join } from "node:path";

// Pins the NEED-1 mechanism (chair's ruling, option (b)): the public
// testimonial submit body carries the booking slug the public page
// already renders under, and the server resolves slug -> workspace_id
// itself (workspace_settings.booking_slug, the same join
// get_public_booking_profile_v2 uses) and stamps the insert with the
// resolved id. A client-supplied workspace_id is never read. Also pins
// the NEED-4 follow-up migration: a platform-admin SELECT policy on
// audit_logs (PR #214 ships audit_logs with INSERT policies only, and
// requirePlatformAdmin returns an RLS-bound client).

const CRM = readFileSync(
  join(__dirname, "../../../src/server/hono/routes/crm.ts"),
  "utf8",
);
const COMMAND = readFileSync(
  join(__dirname, "../../../src/application/commands/testimonial-submit.command.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(__dirname, "../../../src/legacy-pages/TestimonialSubmit.tsx"),
  "utf8",
);
const MIGRATION = readFileSync(
  join(
    __dirname,
    "../../../supabase/migrations/20261110201000_audit_logs_platform_admin_select.sql",
  ),
  "utf8",
);

function block(src: string, route: string, router: string): string {
  const start = src.indexOf(route);
  if (start < 0) throw new Error(`route not found: ${route}`);
  const next = src.indexOf(router, start + route.length);
  return src.slice(start, next < 0 ? undefined : next);
}

describe("need1 — public testimonial submit resolves the workspace by slug", () => {
  const submit = () =>
    block(CRM, 'crmRouter.post("/v1/crm/testimonials/submit"', "crmRouter.");

  it("the submit body gains the booking slug", () => {
    expect(submit()).toContain("slug: z.string().trim().min(1).max(200),");
  });

  it("the handler resolves the workspace from workspace_settings by slug", () => {
    const b = submit();
    expect(b).toContain('.from("workspace_settings")');
    expect(b).toContain('.ilike("booking_slug", body.slug)');
    expect(b).toContain("workspaces!inner(created_by, is_active)");
  });

  it("the insert stamps the server-resolved workspace_id and keeps the owner key", () => {
    const b = submit();
    expect(b).toContain('.from("testimonials").insert({');
    expect(b).toContain("workspace_id: settings.workspace_id,");
    expect(b).toContain("user_id: body.user_id,");
    expect(b).toContain('status: "pending",');
  });

  it("an unresolvable or owner-mismatched slug fails closed (no fallback)", () => {
    const b = submit();
    expect(b).toContain("workspace.created_by !== body.user_id");
    expect(b).toContain('throw new ApiError(404, "Business not found for this booking link", "business_not_found")');
  });

  it("no client-supplied workspace_id is read anywhere in the submit handler", () => {
    const b = submit();
    expect(b).not.toContain("body.workspace_id");
    expect(b).not.toContain("workspace_id: z.");
    expect(b).not.toContain("insert({ ...body");
  });

  it("the client chain sends the slug it renders under, never a workspace_id", () => {
    expect(COMMAND).toContain("slug: string;");
    expect(COMMAND).not.toContain("workspace_id");
    const callStart = PAGE.indexOf("await submitTestimonial({");
    if (callStart < 0) throw new Error("submitTestimonial call not found");
    const call = PAGE.slice(callStart, PAGE.indexOf("});", callStart));
    expect(call).toContain("user_id: businessProfile.user_id,");
    expect(call).toContain("slug,");
  });
});

describe("need1 — audit_logs platform-admin SELECT policy (NEED-4)", () => {
  it("creates exactly one guarded SELECT policy keyed on the user_roles admin row", () => {
    expect(MIGRATION).toContain(
      "drop policy if exists audit_logs_platform_admin_select on public.audit_logs;",
    );
    expect(MIGRATION).toContain(
      "create policy audit_logs_platform_admin_select on public.audit_logs",
    );
    expect(MIGRATION).toContain("for select to authenticated");
    expect(MIGRATION).toContain("select 1 from public.user_roles ur");
    expect(MIGRATION).toContain("ur.user_id = auth.uid()");
    expect(MIGRATION).toContain("ur.role = 'admin'::public.app_role");
  });

  it("grants nothing beyond SELECT and creates no table", () => {
    expect(MIGRATION).not.toMatch(/for (insert|update|delete|all)\b/);
    expect(MIGRATION).not.toContain("create table");
    expect(MIGRATION).not.toContain("to anon");
  });
});
