import { readFileSync } from "node:fs";
import { join } from "node:path";

// Pins the Recon Steps 6+7 paired code translation: the documents
// lifecycle insert stamps the already-validated workspace_id; the CRM
// retention / campaigns / review / testimonial reads and writes move
// from the creator key (.eq("user_id", user.id)) to workspace tenancy
// (requireWorkspaceAuth + .eq("workspace_id", ...)), with user_id kept
// as the actor stamp on inserts. The named exceptions stay untouched:
// the public testimonial submit (NEED-1, unresolved by design), the
// legacy live-visitors pair, and the platform marketplace surface.

const CRM = readFileSync(
  join(__dirname, "../../../src/server/hono/routes/crm.ts"),
  "utf8",
);
const DOCUMENTS = readFileSync(
  join(__dirname, "../../../src/server/hono/routes/documents.ts"),
  "utf8",
);
const PLATFORM = readFileSync(
  join(__dirname, "../../../src/server/hono/routes/platform.ts"),
  "utf8",
);

function block(src: string, route: string, router: string): string {
  const start = src.indexOf(route);
  if (start < 0) throw new Error(`route not found: ${route}`);
  const next = src.indexOf(router, start + route.length);
  return src.slice(start, next < 0 ? undefined : next);
}

describe("step67 code — documents.ts", () => {
  it("lifecycle insert stamps workspace_id and keeps the actor stamp", () => {
    const b = block(DOCUMENTS, '"/v1/invoices/:id/lifecycle-events"', "documentsRouter.");
    expect(b).toContain("workspace_id: body.workspace_id,");
    expect(b).toContain("user_id: user.id,");
  });
});

describe("step67 code — crm.ts retention cluster", () => {
  it("signals + vehicle-profiles lists are workspace-scoped", () => {
    for (const route of ['"/v1/crm/retention/signals"', '"/v1/crm/retention/vehicle-profiles"']) {
      const b = block(CRM, route, "crmRouter.");
      expect(b).toContain("requireWorkspaceAuth(c, workspaceId)");
      expect(b).toContain('.eq("workspace_id", workspaceId)');
      expect(b).not.toContain('.eq("user_id", user.id)');
    }
  });

  it("snooze scopes BOTH the payload read and the status update", () => {
    const b = block(CRM, '"/v1/crm/retention/signals/snooze"', "crmRouter.");
    expect(b).toContain("requireWorkspaceAuth(c, workspace_id, [...loyaltyWriteRoles])");
    expect(b).toContain('.eq("id", signalId)\n      .eq("workspace_id", workspace_id)');
    expect(b).toContain('.eq("id", signalId).eq("workspace_id", workspace_id)');
  });

  it("dismiss + resolve updates gain the workspace filter", () => {
    const dismiss = block(CRM, '"/v1/crm/retention/signals/dismiss"', "crmRouter.");
    expect(dismiss).toContain('.in("id", signal_ids).eq("workspace_id", workspace_id)');
    const resolve = block(CRM, '"/v1/crm/retention/signals/resolve"', "crmRouter.");
    expect(resolve).toContain('.in("id", signal_ids)\n    .eq("workspace_id", workspace_id)');
  });

  it("enqueue scopes the signals fetch + status update; job_queue keeps its user stamp", () => {
    const b = block(CRM, '"/v1/crm/retention/actions/enqueue"', "crmRouter.");
    expect(b).toContain('.in("id", body.signal_ids)\n    .eq("workspace_id", body.workspace_id)');
    expect(b).toContain('.in("id", body.signal_ids).eq("workspace_id", body.workspace_id)');
    expect(b).toContain("user_id: user.id,");
  });

  it("impact metrics: all four family reads are workspace-scoped", () => {
    const b = block(CRM, '"/v1/crm/retention/impact/metrics"', "crmRouter.");
    expect(b).not.toContain('.eq("user_id", user.id)');
    expect(b).toContain('db.from("loyalty_accounts")');
    expect(b).toContain('.eq("workspace_id", workspaceId).eq("status", "active")');
  });

  it("action-queue, by-ids and signal-log are workspace-scoped", () => {
    for (const route of [
      '"/v1/crm/retention/impact/action-queue"',
      '"/v1/crm/retention/signals/by-ids"',
      '"/v1/crm/retention/signal-log"',
    ]) {
      const b = block(CRM, route, "crmRouter.");
      expect(b).toContain('.eq("workspace_id", workspaceId)');
      expect(b).not.toContain('.eq("user_id", user.id)');
    }
  });

  it("POST /retention/events: envelope gains workspace_id; rows are stamped, actor kept", () => {
    const b = block(CRM, 'crmRouter.post("/v1/crm/retention/events"', "crmRouter.");
    expect(b).toContain("events: z.array(retentionEventSchema).min(1).max(500)");
    expect(b).toContain("requireWorkspaceAuth(c, workspace_id, [...loyaltyWriteRoles])");
    expect(b).toContain("insert(events.map((row) => ({ ...row, workspace_id, user_id: user.id })))");
  });

  it("automation-executions (CRM surface): workspace param replaces the user self-check", () => {
    const b = block(CRM, '"/v1/crm/retention/automation-executions"', "crmRouter.");
    expect(b).toContain("requireWorkspaceAuth(c, workspaceId)");
    expect(b).toContain('.eq("workspace_id", workspaceId)');
    expect(b).not.toContain("You can only view your own execution log");
  });
});

describe("step67 code — crm.ts campaigns cluster", () => {
  it("list is workspace-scoped", () => {
    const b = block(CRM, 'crmRouter.get("/v1/crm/marketing/email-campaigns"', "crmRouter.");
    expect(b).toContain('.eq("workspace_id", workspaceId)');
    expect(b).not.toContain('.eq("user_id", user.id)');
  });

  it("create: schema + insert gain workspace_id; creator stamp kept", () => {
    expect(CRM).toContain("const emailCampaignCreateSchema = z.object({\n  workspace_id: z.string().uuid(),");
    const b = block(CRM, 'crmRouter.post("/v1/crm/marketing/email-campaigns"', "crmRouter.");
    expect(b).toContain("requireWorkspaceAuth(c, payload.workspace_id, [...loyaltyWriteRoles])");
    expect(b).toContain("workspace_id: payload.workspace_id,");
    expect(b).toContain("user_id: user.id,");
  });

  it("delete is workspace-scoped via query param", () => {
    const b = block(CRM, 'crmRouter.delete("/v1/crm/marketing/email-campaigns/:id"', "crmRouter.");
    expect(b).toContain('.eq("id", id).eq("workspace_id", workspaceId)');
  });

  it("send: campaign fetch + post-send update are workspace-scoped", () => {
    const b = block(CRM, '"/v1/crm/marketing/email-campaigns/:id/send"', "crmRouter.");
    expect(b).toContain('.eq("workspace_id", workspace_id)\n    .single()');
    expect(b).toContain('.eq("id", campaign.id)\n    .eq("workspace_id", workspace_id)');
  });

  it("test: campaign fetch is workspace-scoped via query param", () => {
    const b = block(CRM, '"/v1/crm/marketing/email-campaigns/:id/test"', "crmRouter.");
    expect(b).toContain("requireWorkspaceAuth(c, workspaceId, [...loyaltyWriteRoles])");
    expect(b).toContain('.eq("workspace_id", workspaceId)');
    expect(b).not.toContain('.eq("user_id", user.id)');
  });
});

describe("step67 code — crm.ts reviews / testimonials / reminders", () => {
  it("testimonials list + both patches are workspace-scoped", () => {
    const list = block(CRM, 'crmRouter.get("/v1/crm/marketing/testimonials"', "crmRouter.");
    expect(list).toContain('.eq("workspace_id", workspaceId)');
    const patch = block(CRM, 'crmRouter.patch("/v1/crm/marketing/testimonials/:id"', "crmRouter.");
    expect(patch).toContain('.update({ status }).eq("id", id).eq("workspace_id", workspace_id)');
    const featured = block(CRM, '"/v1/crm/marketing/testimonials/:id/featured"', "crmRouter.");
    expect(featured).toContain('.update({ featured }).eq("id", id).eq("workspace_id", workspace_id)');
  });

  it("review dashboard requests read is workspace-scoped; the analytics RPC is untouched", () => {
    const b = block(CRM, '"/v1/crm/marketing/review-dashboard"', "crmRouter.");
    expect(b).toContain('.eq("workspace_id", workspaceId)');
    expect(b).toContain('db.rpc("get_review_analytics", { p_days: 30 })');
  });

  it("marketing analytics: the three family reads are workspace-scoped", () => {
    const b = block(CRM, 'crmRouter.get("/v1/crm/marketing/analytics"', "crmRouter.");
    expect(b).toContain('db.from("review_requests").select("status, clicked_at").eq("workspace_id", workspaceId)');
    expect(b).toContain('db.from("testimonials").select("status").eq("workspace_id", workspaceId)');
    expect(b).toContain('db.from("email_marketing_campaigns").select("id").eq("workspace_id", workspaceId)');
  });

  it("signals-since + reminders-since are workspace-scoped", () => {
    for (const route of ['"/v1/crm/marketing/retention-signals-since"', '"/v1/crm/marketing/service-reminders-since"']) {
      const b = block(CRM, route, "crmRouter.");
      expect(b).toContain("requireWorkspaceAuth(c, workspaceId)");
      expect(b).toContain('.eq("workspace_id", workspaceId)');
    }
  });
});

describe("step67 code — exceptions stay untouched", () => {
  it("public testimonial submit is byte-identical in contract (NEED-1 gate)", () => {
    const b = block(CRM, 'crmRouter.post("/v1/crm/testimonials/submit"', "crmRouter.");
    expect(b).toContain("insert({ ...body, status: \"pending\" })");
    expect(b).not.toContain("workspace_id");
  });

  it("live-visitors still keys on the legacy tenant_id with the owner self-check", () => {
    const b = block(CRM, '"/v1/crm/marketing/live-visitors"', "crmRouter.");
    expect(b).toContain('.eq("tenant_id", ownerUserId)');
    expect(b).toContain("You can only view your own live visitors");
  });

  it("platform marketplace reviews still key on the owner's user_id", () => {
    const b = block(PLATFORM, '"/v1/platform/marketplace/reviews"', "platformRouter.");
    expect(b).toContain('.eq("user_id", userId)');
  });
});

describe("step67 code — platform.ts", () => {
  it("automation executions: workspace_id param + filter; platform gate stays", () => {
    const b = block(PLATFORM, '"/v1/platform/automation/executions"', "platformRouter.");
    expect(b).toContain("workspace_id: z.string().uuid(),");
    expect(b).toContain("requirePlatformWorkspace(c)");
    expect(b).toContain('.eq("workspace_id", workspace_id)');
    expect(b).not.toContain('.eq("user_id", user_id)');
  });
});
