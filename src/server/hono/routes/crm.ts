/**
 * CRM domain router (Phase 1 Hono migration).
 *
 * Migrated from:
 * - app/api/v1/crm/access/route.ts
 * - app/api/v1/crm/activities/route.ts
 * - app/api/v1/crm/campaigns/route.ts
 * - app/api/v1/crm/profiles/route.ts
 * - app/api/v1/customers/route.ts
 * - app/api/v1/customers/[id]/route.ts
 * - app/api/v1/customers/[id]/summary/route.ts
 *
 * Handler bodies are copied verbatim from the original Next.js route handlers;
 * only signatures were adapted (`request` -> `c.req.raw`, `[id]` params ->
 * `c.req.param('id')`). The per-handler try/catch -> errorResponse wrapper was
 * removed because the app-level onError in `src/server/hono/app.ts` handles
 * thrown errors identically.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import {
  ApiError,
  json,
  paginationSchema,
  requireCrmCapability,
  workspaceIdSchema,
} from "@/server/api";
import { requireAuth, requireWorkspaceAuth } from "@/server/hono/middleware/auth";
import { createSupabaseAdminClient } from "@/lib/supabase";

export const crmRouter = new Hono();

// ---------------------------------------------------------------------------
// GET /v1/crm/access
// ---------------------------------------------------------------------------
crmRouter.get("/v1/crm/access", async (c) => {
  const url = new URL(c.req.url);
  const workspaceId = url.searchParams.get("workspace_id") || "";
  const parsed = workspaceIdSchema.safeParse(workspaceId);
  if (!parsed.success) {
    return json({ error: { code: "invalid_workspace", message: "Invalid workspace_id" } }, { status: 400 });
  }

  await requireCrmCapability(c.req.raw, workspaceId, "crm.view");
  return json({ data: { workspace_id: workspaceId, can_view: true } });
});

// ---------------------------------------------------------------------------
// /v1/crm/activities
// ---------------------------------------------------------------------------
const activitySchema = z.object({
  workspace_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  vehicle_id: z.string().uuid().nullable().optional(),
  appointment_id: z.string().uuid().nullable().optional(),
  activity_type: z.enum(["call", "note", "follow_up", "campaign_interaction", "review", "referral", "service_milestone"]),
  summary: z.string().trim().min(1).max(4000),
  occurred_at: z.string().datetime().optional(),
  source_event_id: z.string().trim().max(240).nullable().optional(),
});

crmRouter.get("/v1/crm/activities", async (c) => {
  const url = new URL(c.req.url);
  const workspaceId = url.searchParams.get("workspace_id") || "";
  const customerId = url.searchParams.get("customer_id");
  const pagination = paginationSchema.parse({
    limit: url.searchParams.get("limit") || undefined,
    offset: url.searchParams.get("offset") || undefined,
  });
  const { supabase } = await requireCrmCapability(c.req.raw, workspaceId, "crm.view");

  let query = supabase
    .from("crm_activities")
    .select("id,workspace_id,customer_id,vehicle_id,appointment_id,activity_type,summary,occurred_at,created_by,source_event_id,created_at", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .order("occurred_at", { ascending: false })
    .range(pagination.offset, pagination.offset + pagination.limit - 1);
  if (customerId) query = query.eq("customer_id", z.string().uuid().parse(customerId));

  const { data, error, count } = await query;
  if (error) throw error;
  return json({ data: data ?? [], meta: { limit: pagination.limit, offset: pagination.offset, total: count ?? 0 } });
});

crmRouter.post("/v1/crm/activities", async (c) => {
  const payload = activitySchema.parse(await c.req.json());
  const { supabase, user } = await requireCrmCapability(c.req.raw, payload.workspace_id, "crm.task.write");
  const { data, error } = await supabase
    .from("crm_activities")
    .insert({ ...payload, occurred_at: payload.occurred_at ?? new Date().toISOString(), created_by: user.id })
    .select("id,workspace_id,customer_id,vehicle_id,appointment_id,activity_type,summary,occurred_at,created_by,source_event_id,created_at")
    .single();
  if (error) throw error;
  return json({ data }, { status: 201 });
});

// ---------------------------------------------------------------------------
// /v1/crm/campaigns
// ---------------------------------------------------------------------------
const campaignSchema = z.object({
  workspace_id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  purpose: z.enum(["marketing", "loyalty", "newsletter", "win_back", "review_request", "referral", "education"]),
  channel: z.enum(["email", "sms"]),
  template_id: z.string().uuid().nullable().optional(),
  segment_id: z.string().uuid().nullable().optional(),
  frequency_policy: z.record(z.string(), z.unknown()).optional(),
  scheduled_at: z.string().datetime().nullable().optional(),
});

const campaignProjection = "id,workspace_id,name,purpose,channel,template_id,segment_id,approval_state,frequency_policy,scheduled_at,created_by,approved_by,approved_at,created_at,updated_at";

crmRouter.get("/v1/crm/campaigns", async (c) => {
  const url = new URL(c.req.url);
  const workspaceId = url.searchParams.get("workspace_id") || "";
  const pagination = paginationSchema.parse({
    limit: url.searchParams.get("limit") || undefined,
    offset: url.searchParams.get("offset") || undefined,
  });
  const state = url.searchParams.get("approval_state");
  const { supabase } = await requireCrmCapability(c.req.raw, workspaceId, "crm.view");

  let query = supabase
    .from("crm_campaigns")
    .select(campaignProjection, { count: "exact" })
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .range(pagination.offset, pagination.offset + pagination.limit - 1);
  if (state) query = query.eq("approval_state", state);

  const { data, error, count } = await query;
  if (error) throw error;
  return json({ data: data ?? [], meta: { limit: pagination.limit, offset: pagination.offset, total: count ?? 0 } });
});

crmRouter.post("/v1/crm/campaigns", async (c) => {
  const payload = campaignSchema.parse(await c.req.json());
  const { supabase, user } = await requireCrmCapability(c.req.raw, payload.workspace_id, "crm.campaign.draft");
  const { data, error } = await supabase
    .from("crm_campaigns")
    .insert({ ...payload, created_by: user.id })
    .select(campaignProjection)
    .single();
  if (error) throw error;
  return json({ data }, { status: 201 });
});

// ---------------------------------------------------------------------------
// /v1/crm/profiles
// ---------------------------------------------------------------------------
const profileCreateSchema = z.object({
  workspace_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  lifecycle_stage: z.enum(["new", "contacted", "qualified", "booked", "active", "due", "at_risk", "reactivated", "inactive"]).optional(),
  lead_source: z.string().trim().max(160).nullable().optional(),
  relationship_owner_id: z.string().uuid().nullable().optional(),
  next_action_at: z.string().datetime().nullable().optional(),
  preferred_channel: z.enum(["email", "sms", "phone", "none"]).nullable().optional(),
});

const profileUpdateSchema = profileCreateSchema.omit({ workspace_id: true, customer_id: true }).partial();

crmRouter.get("/v1/crm/profiles", async (c) => {
  const url = new URL(c.req.url);
  const workspaceId = url.searchParams.get("workspace_id") || "";
  const pagination = paginationSchema.parse({
    limit: url.searchParams.get("limit") || undefined,
    offset: url.searchParams.get("offset") || undefined,
  });
  const search = url.searchParams.get("search")?.trim();
  const stage = url.searchParams.get("lifecycle_stage")?.trim();
  const { supabase } = await requireCrmCapability(c.req.raw, workspaceId, "crm.view");

  let query = supabase
    .from("crm_profiles")
    .select("id,workspace_id,customer_id,lifecycle_stage,lead_source,relationship_owner_id,next_action_at,preferred_channel,last_contacted_at,last_service_at,created_at,updated_at,customers(id,first_name,last_name,email,phone)", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .range(pagination.offset, pagination.offset + pagination.limit - 1);
  if (stage) query = query.eq("lifecycle_stage", stage);
  if (search) query = query.or(`lead_source.ilike.%${search}%,lifecycle_stage.ilike.%${search}%`);

  const { data, error, count } = await query;
  if (error) throw error;
  return json({ data: data ?? [], meta: { limit: pagination.limit, offset: pagination.offset, total: count ?? 0 } });
});

crmRouter.post("/v1/crm/profiles", async (c) => {
  const payload = profileCreateSchema.parse(await c.req.json());
  const { supabase } = await requireCrmCapability(c.req.raw, payload.workspace_id, "crm.profile.write");
  const { data, error } = await supabase
    .from("crm_profiles")
    .insert(payload)
    .select("id,workspace_id,customer_id,lifecycle_stage,lead_source,relationship_owner_id,next_action_at,preferred_channel,last_contacted_at,last_service_at,created_at,updated_at")
    .single();
  if (error) throw error;
  return json({ data }, { status: 201 });
});

crmRouter.patch("/v1/crm/profiles", async (c) => {
  const body = await c.req.json();
  const id = z.string().uuid().parse(body.id);
  const workspaceId = z.string().uuid().parse(body.workspace_id);
  const payload = profileUpdateSchema.parse(body);
  const { supabase } = await requireCrmCapability(c.req.raw, workspaceId, "crm.profile.write");
  const { data, error } = await supabase
    .from("crm_profiles")
    .update(payload)
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select("id,workspace_id,customer_id,lifecycle_stage,lead_source,relationship_owner_id,next_action_at,preferred_channel,last_contacted_at,last_service_at,created_at,updated_at")
    .single();
  if (error) throw error;
  return json({ data });
});

// ---------------------------------------------------------------------------
// /v1/customers
// ---------------------------------------------------------------------------
const customerCreateSchema = z.object({
  workspace_id: z.string().uuid(),
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().max(100).default(""),
  company_name: z.string().trim().max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(500).optional(),
  address_line1: z.string().trim().max(250).optional(),
  address_line2: z.string().trim().max(250).optional(),
  city: z.string().trim().max(120).optional(),
  region: z.string().trim().max(120).optional(),
  postal_code: z.string().trim().max(24).optional(),
  notes: z.string().max(5000).optional(),
});

crmRouter.get("/v1/customers", async (c) => {
  const url = new URL(c.req.url);
  const workspaceId = url.searchParams.get("workspace_id");
  if (!workspaceId) {
    return json({ error: { code: "missing_workspace", message: "workspace_id is required" } }, { status: 400 });
  }
  const { supabase } = await requireWorkspaceAuth(c, workspaceId);
  const { limit, offset } = paginationSchema.parse(Object.fromEntries(url.searchParams));
  const search = url.searchParams.get("search")?.trim();
  let query = supabase
    .from("customers")
    .select("*")
    .eq("workspace_id", workspaceId)
    .neq("status", "archived")
    .order("last_name")
    .order("first_name")
    .range(offset, offset + limit - 1);
  if (search) {
    query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return json({ data: data ?? [], pagination: { limit, offset } });
});

crmRouter.post("/v1/customers", async (c) => {
  const body = customerCreateSchema.parse(await c.req.json());
  const { supabase, user } = await requireWorkspaceAuth(c, body.workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist", "dispatcher"]);
  const { workspace_id, address, ...customer } = body;
  const { data, error } = await supabase.from("customers").insert({
    ...customer,
    workspace_id,
    address_line1: customer.address_line1 || address || null,
    created_by: user.id,
  }).select().single();
  if (error) throw error;
  return json({ data }, { status: 201 });
});

// ---------------------------------------------------------------------------
// /v1/customers/:id
// ---------------------------------------------------------------------------
const customerUpdateSchema = z.object({
  workspace_id: z.string().uuid(),
  first_name: z.string().trim().min(1).max(100).optional(),
  last_name: z.string().trim().max(100).optional(),
  company_name: z.string().trim().max(200).nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  address_line1: z.string().trim().max(250).nullable().optional(),
  address_line2: z.string().trim().max(250).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  region: z.string().trim().max(120).nullable().optional(),
  postal_code: z.string().trim().max(24).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  status: z.enum(["active", "inactive", "archived"]).optional(),
}).refine((body) => Object.keys(body).some((key) => key !== "workspace_id"), {
  message: "At least one customer field is required",
});

const writeRoles = ["owner", "admin", "manager", "service_advisor", "receptionist"] as const;

function customerIdFromParams(id: string): string {
  return z.string().uuid().parse(id);
}

crmRouter.get("/v1/customers/:id", async (c) => {
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id"));
  const id = customerIdFromParams(c.req.param("id"));
  const { supabase } = await requireWorkspaceAuth(c, workspaceId);
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .single();
  if (error) throw error;
  return json({ data });
});

crmRouter.patch("/v1/customers/:id", async (c) => {
  const body = customerUpdateSchema.parse(await c.req.json());
  const id = customerIdFromParams(c.req.param("id"));
  const { supabase } = await requireWorkspaceAuth(c, body.workspace_id, [...writeRoles]);
  const { workspace_id, address, ...customer } = body;
  const patch: Record<string, unknown> = { ...customer };
  if (Object.prototype.hasOwnProperty.call(body, "address")) {
    patch.address_line1 = address || null;
  }
  const { data, error } = await supabase
    .from("customers")
    .update(patch as never)
    .eq("id", id)
    .eq("workspace_id", workspace_id)
    .select()
    .single();
  if (error) throw error;
  return json({ data });
});

crmRouter.delete("/v1/customers/:id", async (c) => {
  const url = new URL(c.req.url);
  const workspaceId = z.string().uuid().parse(url.searchParams.get("workspace_id"));
  const id = customerIdFromParams(c.req.param("id"));
  const { supabase } = await requireWorkspaceAuth(c, workspaceId, [...writeRoles]);
  const { data, error } = await supabase
    .from("customers")
    .update({ status: "archived" } as never)
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select("id,status")
    .single();
  if (error) throw error;
  return json({ data });
});

// ---------------------------------------------------------------------------
// GET /v1/customers/:id/summary
// ---------------------------------------------------------------------------
crmRouter.get("/v1/customers/:id/summary", async (c) => {
  const customerId = z.string().uuid().parse(c.req.param("id"));
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id"));
  const { supabase } = await requireWorkspaceAuth(c, workspaceId);

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", customerId)
    .single();
  if (customerError || !customer) throw customerError ?? new Error("Customer not found");

  const [vehicles, services, quotes, appointments, payments] = await Promise.all([
    supabase.from("vehicles").select("*,vehicle_service_specs(engine,oil_type,oil_capacity,oil_filter,metadata)")
      .eq("workspace_id", workspaceId).eq("customer_id", customerId).neq("status", "archived").order("year", { ascending: false }),
    supabase.from("service_records").select("*")
      .eq("workspace_id", workspaceId).eq("customer_id", customerId).order("completed_at", { ascending: false, nullsFirst: false }),
    supabase.from("quotes").select("*")
      .eq("workspace_id", workspaceId).eq("customer_id", customerId).order("created_at", { ascending: false }),
    supabase.from("appointments").select("*")
      .eq("workspace_id", workspaceId).eq("customer_id", customerId).order("starts_at", { ascending: false }),
    supabase.from("payments").select("amount,status,currency_code,paid_at,metadata")
      .eq("workspace_id", workspaceId).eq("customer_id", customerId).eq("status", "succeeded").order("paid_at", { ascending: false, nullsFirst: false }),
  ]);

  for (const result of [vehicles, services, quotes, appointments, payments]) {
    if (result.error) throw result.error;
  }

  return json({
    data: {
      customer,
      vehicles: vehicles.data ?? [],
      service_records: services.data ?? [],
      quotes: quotes.data ?? [],
      appointments: appointments.data ?? [],
      payments: payments.data ?? [],
    },
  });
});

// ---------------------------------------------------------------------------
// /v1/crm/loyalty/* — canonical CRM loyalty reads/writes (workspace-scoped)
// ---------------------------------------------------------------------------
const loyaltyWriteRoles = ["owner", "admin", "manager", "service_advisor", "receptionist"] as const;

crmRouter.get("/v1/crm/loyalty/programs", async (c) => {
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id"));
  const { supabase } = await requireWorkspaceAuth(c, workspaceId);
  const { data, error } = await (supabase as any)
    .from("crm_loyalty_programs")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return json({
    data: (data ?? []).map((row: any) => ({
      ...row,
      earn_rules_jsonb: {
        points_per_dollar: Number(row.points_per_dollar ?? 0),
        points_per_visit: Number(row.points_per_visit ?? 0),
      },
    })),
  });
});

crmRouter.get("/v1/crm/loyalty/rewards", async (c) => {
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id"));
  const { supabase } = await requireWorkspaceAuth(c, workspaceId);
  const { data, error } = await (supabase as any)
    .from("crm_loyalty_rewards")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("points_required", { ascending: true });
  if (error) throw error;
  return json({ data: (data ?? []).map((row: any) => ({ ...row, config_jsonb: row.config ?? {} })) });
});

crmRouter.get("/v1/crm/loyalty/accounts/stats", async (c) => {
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id"));
  const { supabase } = await requireWorkspaceAuth(c, workspaceId);
  const { data, error } = await (supabase as any)
    .from("crm_loyalty_accounts")
    .select("current_points")
    .eq("workspace_id", workspaceId);
  if (error) throw error;
  const totalPoints = (data ?? []).reduce((sum: number, row: any) => sum + Number(row.current_points ?? 0), 0);
  return json({ data: { active: data?.length || 0, total: data?.length || 0, totalPoints } });
});

const loyaltyProgramSchema = z.object({
  workspace_id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  scope: z.string().trim().min(1).max(60),
  status: z.string().trim().min(1).max(40),
  points_per_dollar: z.number().nonnegative(),
  points_per_visit: z.number().nonnegative(),
  program_id: z.string().uuid().nullable().optional(),
});

crmRouter.post("/v1/crm/loyalty/programs", async (c) => {
  const body = loyaltyProgramSchema.parse(await c.req.json());
  const { supabase } = await requireWorkspaceAuth(c, body.workspace_id, [...loyaltyWriteRoles]);
  const { data, error } = await (supabase as any).rpc("save_loyalty_program_v1", {
    p_workspace_id: body.workspace_id,
    p_name: body.name,
    p_scope: body.scope,
    p_status: body.status === "paused" ? "inactive" : body.status,
    p_points_per_dollar: Math.max(0, body.points_per_dollar),
    p_points_per_visit: Math.max(0, body.points_per_visit),
    p_program_id: body.program_id ?? null,
  });
  if (error) throw error;
  return json({ data });
});

crmRouter.delete("/v1/crm/loyalty/programs/:id", async (c) => {
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id"));
  const id = z.string().uuid().parse(c.req.param("id"));
  const { supabase } = await requireWorkspaceAuth(c, workspaceId, [...loyaltyWriteRoles]);
  const { error } = await (supabase as any).from("crm_loyalty_programs").delete().eq("workspace_id", workspaceId).eq("id", id);
  if (error) throw error;
  return json({ data: { id } });
});

const loyaltyRewardSchema = z.object({
  workspace_id: z.string().uuid(),
  program_id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  points_required: z.number().int().min(1),
  reward_type: z.string().trim().min(1).max(80),
  config: z.record(z.string(), z.unknown()).default({}),
  reward_id: z.string().uuid().nullable().optional(),
});

crmRouter.post("/v1/crm/loyalty/rewards", async (c) => {
  const body = loyaltyRewardSchema.parse(await c.req.json());
  const { supabase } = await requireWorkspaceAuth(c, body.workspace_id, [...loyaltyWriteRoles]);
  const { data, error } = await (supabase as any).rpc("save_loyalty_reward_v1", {
    p_workspace_id: body.workspace_id,
    p_program_id: body.program_id,
    p_name: body.name,
    p_description: body.description ?? null,
    p_points_required: Math.max(1, body.points_required),
    p_reward_type: body.reward_type,
    p_config: body.config,
    p_reward_id: body.reward_id ?? null,
  });
  if (error) throw error;
  return json({ data });
});

crmRouter.delete("/v1/crm/loyalty/rewards/:id", async (c) => {
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id"));
  const id = z.string().uuid().parse(c.req.param("id"));
  const { supabase } = await requireWorkspaceAuth(c, workspaceId, [...loyaltyWriteRoles]);
  const { error } = await (supabase as any).from("crm_loyalty_rewards").delete().eq("workspace_id", workspaceId).eq("id", id);
  if (error) throw error;
  return json({ data: { id } });
});

const loyaltyTemplateSeedSchema = z.object({
  workspace_id: z.string().uuid(),
  program: z.object({
    name: z.string().trim().min(1).max(200),
    scope: z.string().trim().min(1).max(60),
    points_per_dollar: z.number().nonnegative(),
    points_per_visit: z.number().nonnegative(),
  }),
  rewards: z.array(z.object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullable().optional(),
    points_required: z.number().int().min(1),
    reward_type: z.string().trim().min(1).max(80),
    config: z.record(z.string(), z.unknown()).default({}),
  })),
});

crmRouter.post("/v1/crm/loyalty/templates/seed", async (c) => {
  const body = loyaltyTemplateSeedSchema.parse(await c.req.json());
  const { supabase } = await requireWorkspaceAuth(c, body.workspace_id, [...loyaltyWriteRoles]);
  const db = supabase as any;
  const { data: programId, error: programError } = await db.rpc("save_loyalty_program_v1", {
    p_workspace_id: body.workspace_id,
    p_name: body.program.name,
    p_scope: body.program.scope,
    p_status: "active",
    p_points_per_dollar: body.program.points_per_dollar,
    p_points_per_visit: body.program.points_per_visit,
    p_program_id: null,
  });
  if (programError || !programId) throw new Error(programError?.message || "Failed to create program from template");

  let inserted = 0;
  try {
    for (const reward of body.rewards) {
      const { error } = await db.rpc("save_loyalty_reward_v1", {
        p_workspace_id: body.workspace_id,
        p_program_id: programId,
        p_name: reward.name,
        p_description: reward.description ?? null,
        p_points_required: reward.points_required,
        p_reward_type: reward.reward_type,
        p_config: reward.config,
        p_reward_id: null,
      });
      if (error) throw error;
      inserted += 1;
    }
  } catch (error) {
    await db.from("crm_loyalty_programs").delete().eq("workspace_id", body.workspace_id).eq("id", programId);
    throw error;
  }
  return json({ data: { programId: String(programId), rewardsInserted: inserted } }, { status: 201 });
});

// ---------------------------------------------------------------------------
// /v1/crm/loyalty/* — rewards operations RPCs (provider-scoped)
// ---------------------------------------------------------------------------
const rewardsRpcBody = z.object({
  provider_id: z.string().min(1).optional().default(""),
  customer_id: z.string().uuid().nullable().optional(),
  appointment_id: z.string().uuid().nullable().optional(),
  reward_instance_id: z.string().uuid().nullable().optional(),
  points_delta: z.number().int().nullable().optional(),
  reason_code: z.string().trim().min(1).max(120).nullable().optional(),
  reason_note: z.string().trim().max(2000).nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
  idempotency_key: z.string().trim().max(200).nullable().optional(),
  from_completed_at: z.string().datetime().nullable().optional(),
  to_completed_at: z.string().datetime().nullable().optional(),
  limit: z.number().int().min(1).max(2000).nullable().optional(),
  resume_after_appointment_id: z.string().uuid().nullable().optional(),
  event_type: z.string().trim().max(120).nullable().optional(),
  from: z.string().datetime().nullable().optional(),
  to: z.string().datetime().nullable().optional(),
  offset: z.number().int().min(0).nullable().optional(),
});

async function invokeRewardsRpc(c: Context, rpcName: string, args: Record<string, unknown>) {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await (supabase as any).rpc(rpcName, { ...args, p_actor_id: (args.p_actor_id as string | undefined) ?? user.id });
  if (error) throw new Error(error.message);
  return json({ data: data ?? {} });
}

crmRouter.post("/v1/crm/loyalty/points/adjust", async (c) => {
  const body = rewardsRpcBody.parse(await c.req.json());
  return invokeRewardsRpc(c, "adjust_loyalty_points", {
    p_provider_id: body.provider_id,
    p_customer_id: body.customer_id ?? undefined,
    p_points_delta: body.points_delta ?? undefined,
    p_reason_code: body.reason_code ?? undefined,
    p_reason_note: body.reason_note ?? undefined,
    p_appointment_id: body.appointment_id ?? undefined,
    p_idempotency_key: body.idempotency_key ?? undefined,
  });
});

crmRouter.post("/v1/crm/loyalty/reward-instances/cancel", async (c) => {
  const body = rewardsRpcBody.parse(await c.req.json());
  return invokeRewardsRpc(c, "cancel_loyalty_reward_instance", {
    p_reward_instance_id: body.reward_instance_id ?? undefined,
    p_reason_code: body.reason_code ?? undefined,
    p_reason_note: body.reason_note ?? undefined,
  });
});

crmRouter.post("/v1/crm/loyalty/reward-instances/override-expiration", async (c) => {
  const body = rewardsRpcBody.parse(await c.req.json());
  return invokeRewardsRpc(c, "override_loyalty_reward_expiration", {
    p_reward_instance_id: body.reward_instance_id ?? undefined,
    p_expires_at: body.expires_at ?? undefined,
    p_reason_code: body.reason_code ?? undefined,
    p_reason_note: body.reason_note ?? undefined,
  });
});

crmRouter.post("/v1/crm/loyalty/appointments/retry", async (c) => {
  const body = rewardsRpcBody.parse(await c.req.json());
  return invokeRewardsRpc(c, "retry_appointment_rewards_application", {
    p_appointment_id: body.appointment_id ?? undefined,
    p_reason_code: body.reason_code ?? undefined,
    p_reason_note: body.reason_note ?? undefined,
  });
});

crmRouter.post("/v1/crm/loyalty/backfill/execute", async (c) => {
  const body = rewardsRpcBody.parse(await c.req.json());
  return invokeRewardsRpc(c, "execute_rewards_backfill_batch", {
    p_provider_id: body.provider_id,
    p_from_completed_at: body.from_completed_at ?? undefined,
    p_to_completed_at: body.to_completed_at ?? undefined,
    p_limit: body.limit ?? 100,
    p_resume_after_appointment_id: body.resume_after_appointment_id ?? undefined,
  });
});

crmRouter.post("/v1/crm/loyalty/backfill/dry-run", async (c) => {
  const body = rewardsRpcBody.parse(await c.req.json());
  return invokeRewardsRpc(c, "dry_run_rewards_backfill", {
    p_provider_id: body.provider_id,
    p_from_completed_at: body.from_completed_at ?? undefined,
    p_to_completed_at: body.to_completed_at ?? undefined,
    p_limit: body.limit ?? 500,
  });
});

crmRouter.get("/v1/crm/loyalty/rollout-readiness", async (c) => {
  const providerId = new URL(c.req.url).searchParams.get("provider_id") ?? "";
  const { supabase } = await requireAuth(c);
  const { data, error } = await (supabase as any).rpc("get_rewards_rollout_readiness", { p_provider_id: providerId });
  if (error) throw new Error(error.message);
  return json({ data: data ?? {} });
});

crmRouter.get("/v1/crm/loyalty/ledger", async (c) => {
  const params = new URL(c.req.url).searchParams;
  const { supabase } = await requireAuth(c);
  const { data, error } = await (supabase as any).rpc("get_provider_rewards_ledger", {
    p_provider_id: params.get("provider_id") ?? "",
    p_customer_id: params.get("customer_id") ?? undefined,
    p_appointment_id: params.get("appointment_id") ?? undefined,
    p_event_type: params.get("event_type") ?? undefined,
    p_from: params.get("from") ?? undefined,
    p_to: params.get("to") ?? undefined,
    p_limit: params.get("limit") ? Number(params.get("limit")) : 200,
    p_offset: params.get("offset") ? Number(params.get("offset")) : 0,
  });
  if (error) throw new Error(error.message);
  const payload = (data || {}) as { status?: string; rows?: Array<Record<string, unknown>>; reason?: string };
  return json({ data: { status: payload.status || "ok", rows: payload.rows || [], reason: payload.reason } });
});

crmRouter.get("/v1/crm/loyalty/operations-summary", async (c) => {
  const providerId = new URL(c.req.url).searchParams.get("provider_id") ?? "";
  const { supabase } = await requireAuth(c);
  const { data, error } = await (supabase as any).rpc("get_rewards_operations_summary", { p_provider_id: providerId });
  if (error) throw new Error(error.message);
  return json({ data: data ?? {} });
});

crmRouter.get("/v1/crm/loyalty/production-health", async (c) => {
  const providerId = new URL(c.req.url).searchParams.get("provider_id") ?? "";
  const { supabase } = await requireAuth(c);
  const { data, error } = await (supabase as any).rpc("get_rewards_production_health", { p_provider_id: providerId });
  if (error) throw new Error(error.message);
  return json({ data: data ?? {} });
});

crmRouter.get("/v1/crm/loyalty/launch-signoff", async (c) => {
  const providerId = new URL(c.req.url).searchParams.get("provider_id") ?? "";
  const { supabase } = await requireAuth(c);
  const { data, error } = await (supabase as any).rpc("validate_rewards_launch_signoff", { p_provider_id: providerId });
  if (error) throw new Error(error.message);
  return json({ data: data ?? {} });
});

// ---------------------------------------------------------------------------
// /v1/crm/follow-up/* — follow-up automation rules (workspace-scoped)
// ---------------------------------------------------------------------------
const followUpRuleSchema = z.object({
  workspace_id: z.string().uuid(),
  id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  trigger_type: z.string().trim().min(1).max(80),
  trigger_days: z.number().int().min(0).max(365).default(0),
  segment_filter: z.array(z.string()).nullable().optional(),
  service_type_filter: z.array(z.string()).nullable().optional(),
  churn_risk_filter: z.array(z.string()).nullable().optional(),
  action_type: z.string().trim().min(1).max(40),
  email_subject: z.string().trim().max(500).nullable().optional(),
  email_content: z.string().max(20000).nullable().optional(),
  sms_content: z.string().max(1600).nullable().optional(),
  task_title: z.string().trim().max(500).nullable().optional(),
  task_description: z.string().max(10000).nullable().optional(),
  task_assignee_id: z.string().uuid().nullable().optional(),
  min_value_filter: z.number().nullable().optional(),
  max_value_filter: z.number().nullable().optional(),
  preset_key: z.string().trim().max(120).nullable().optional(),
  is_active: z.boolean().optional(),
  is_edit: z.boolean().default(false),
});

crmRouter.get("/v1/crm/follow-up", async (c) => {
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id"));
  const { supabase } = await requireWorkspaceAuth(c, workspaceId);
  const db = supabase as any;
  const [rulesRes, scheduledRes, segmentRes] = await Promise.all([
    db.from("follow_up_rules").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
    db.from("scheduled_follow_ups")
      .select("*,customers(first_name,last_name,company_name),follow_up_rules(name)")
      .eq("workspace_id", workspaceId).order("scheduled_for", { ascending: true }).limit(100),
    db.from("customer_segments").select("name").eq("workspace_id", workspaceId).eq("is_active", true),
  ]);
  if (rulesRes.error) throw rulesRes.error;
  if (scheduledRes.error) throw scheduledRes.error;
  if (segmentRes.error) throw segmentRes.error;
  const one = <T,>(value: T | T[] | null | undefined): T | null =>
    Array.isArray(value) ? value[0] ?? null : value ?? null;
  const scheduledFollowUps = (scheduledRes.data ?? []).map((row: any) => {
    const customer = one<any>(row.customers);
    const rule = one<any>(row.follow_up_rules);
    return {
      ...row,
      customer_name: customer
        ? [customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.company_name || "Unknown"
        : "Unknown",
      rule_name: rule?.name || "Manual",
    };
  });
  return json({
    data: {
      rules: rulesRes.data ?? [],
      scheduledFollowUps,
      segments: (segmentRes.data ?? []).flatMap((row: any) => (row.name ? [String(row.name)] : [])),
    },
  });
});

crmRouter.post("/v1/crm/follow-up/rules/seed-defaults", async (c) => {
  const { workspace_id } = z.object({ workspace_id: z.string().uuid() }).parse(await c.req.json());
  const { supabase, user } = await requireWorkspaceAuth(c, workspace_id, [...loyaltyWriteRoles]);
  const db = supabase as any;
  const defaults = [
    { name: "Declined Service Follow-Up", description: "Follow up after a customer declines recommended work.", trigger_type: "declined_service", trigger_days: 7, action_type: "email", email_subject: "A quick follow-up on your recommended service", email_content: "We wanted to follow up on the service recommendation from your recent visit.", preset_key: "declined_service_7d" },
    { name: "Service Thank You", description: "Thank customers after completed service.", trigger_type: "service_completed", trigger_days: 1, action_type: "email", email_subject: "Thanks for choosing us", email_content: "Thank you for trusting us with your vehicle service.", preset_key: "service_thank_you" },
    { name: "90-Day Inactivity", description: "Reconnect with customers who have not serviced recently.", trigger_type: "inactivity", trigger_days: 90, action_type: "email", email_subject: "Is your vehicle due for service?", email_content: "It may be time to schedule your next maintenance visit.", preset_key: "inactivity_90d" },
  ];
  for (const rule of defaults) {
    const { error } = await db
      .from("follow_up_rules")
      .upsert({ ...rule, workspace_id, user_id: user.id, is_active: true }, { onConflict: "workspace_id,name", ignoreDuplicates: true });
    if (error) throw error;
  }
  return json({ data: { seeded: defaults.length } }, { status: 201 });
});

crmRouter.post("/v1/crm/follow-up/rules", async (c) => {
  const body = followUpRuleSchema.parse(await c.req.json());
  if (!body.name?.trim() || !body.trigger_type || !body.action_type) {
    throw new ApiError(400, "Follow-up rule is missing required fields", "invalid_rule");
  }
  if (body.action_type === "email" && (!body.email_subject?.trim() || !body.email_content?.trim())) {
    throw new ApiError(400, "Email automations require a subject and message", "invalid_rule");
  }
  if (body.action_type === "sms" && (!body.sms_content?.trim() || body.sms_content.trim().length > 1600)) {
    throw new ApiError(400, "SMS automations require a message no longer than 1600 characters", "invalid_rule");
  }
  if (body.action_type === "task" && !body.task_title?.trim()) {
    throw new ApiError(400, "Task automations require a task title", "invalid_rule");
  }
  const { supabase, user } = await requireWorkspaceAuth(c, body.workspace_id, [...loyaltyWriteRoles]);
  const db = supabase as any;
  const { is_edit, id, workspace_id, ...rest } = body;
  const payload = {
    ...rest,
    id: undefined,
    workspace_id,
    user_id: user.id,
    trigger_days: Number.isFinite(Number(rest.trigger_days)) ? Math.max(0, Math.min(365, Number(rest.trigger_days))) : 0,
    updated_at: new Date().toISOString(),
  };
  if (is_edit && id) {
    const { error } = await db.from("follow_up_rules").update(payload).eq("workspace_id", workspace_id).eq("id", id);
    if (error) throw error;
    return json({ data: { id } });
  }
  const { data, error } = await db.from("follow_up_rules").insert(payload).select("id").single();
  if (error) throw error;
  return json({ data }, { status: 201 });
});

crmRouter.patch("/v1/crm/follow-up/rules/:id", async (c) => {
  const body = z.object({ workspace_id: z.string().uuid(), is_active: z.boolean() }).parse(await c.req.json());
  const id = z.string().uuid().parse(c.req.param("id"));
  const { supabase } = await requireWorkspaceAuth(c, body.workspace_id, [...loyaltyWriteRoles]);
  const { error } = await (supabase as any)
    .from("follow_up_rules")
    .update({ is_active: body.is_active, updated_at: new Date().toISOString() })
    .eq("workspace_id", body.workspace_id)
    .eq("id", id);
  if (error) throw error;
  return json({ data: { id, is_active: body.is_active } });
});

crmRouter.delete("/v1/crm/follow-up/rules/:id", async (c) => {
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id"));
  const id = z.string().uuid().parse(c.req.param("id"));
  const { supabase } = await requireWorkspaceAuth(c, workspaceId, [...loyaltyWriteRoles]);
  const { error } = await (supabase as any).from("follow_up_rules").delete().eq("workspace_id", workspaceId).eq("id", id);
  if (error) throw error;
  return json({ data: { id } });
});

// ---------------------------------------------------------------------------
// /v1/crm/retention/* — signals, actions, automation, verification
// ---------------------------------------------------------------------------
const retentionSignalIdsSchema = z.object({ signal_ids: z.array(z.string().uuid()).min(1).max(500) });

crmRouter.get("/v1/crm/retention/signals", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await supabase
    .from("retention_signals")
    .select("*")
    .eq("user_id", user.id)
    .order("detected_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return json({ data: data ?? [] });
});

crmRouter.get("/v1/crm/retention/vehicle-profiles", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await supabase
    .from("retention_vehicle_profiles")
    .select("*")
    .eq("user_id", user.id)
    .order("days_overdue", { ascending: false })
    .limit(50);
  if (error) throw error;
  return json({ data: data ?? [] });
});

crmRouter.get("/v1/crm/retention/automation-rules", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await supabase
    .from("automation_rules")
    .select("*")
    .eq("user_id", user.id)
    .order("priority", { ascending: false });
  if (error) throw error;
  return json({ data: data ?? [] });
});

const automationRulePayloadSchema = z.object({
  name: z.string().trim().min(1).max(200),
  is_active: z.boolean().default(true),
  priority: z.number().int().default(0),
  trigger_jsonb: z.unknown(),
  actions_jsonb: z.unknown(),
  conditions_jsonb: z.unknown().nullable().default(null),
  audience_jsonb: z.unknown().nullable().default(null),
  frequency_guard_jsonb: z.unknown().nullable().default(null),
});

crmRouter.post("/v1/crm/retention/automation-rules", async (c) => {
  const body = automationRulePayloadSchema.parse(await c.req.json());
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await (supabase as any)
    .from("automation_rules")
    .insert({ ...body, user_id: user.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return json({ data }, { status: 201 });
});

crmRouter.patch("/v1/crm/retention/automation-rules/:id", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const body = automationRulePayloadSchema.partial().parse(await c.req.json());
  if (!Object.keys(body).length) throw new ApiError(422, "No updates provided", "empty_update");
  const { supabase, user } = await requireAuth(c);
  const { error } = await supabase.from("automation_rules").update(body).eq("id", id).eq("user_id", user.id);
  if (error) throw error;
  return json({ data: { id } });
});

crmRouter.get("/v1/crm/retention/automation-rules/:id", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await supabase
    .from("automation_rules")
    .select("id, name, trigger_jsonb, actions_jsonb")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (error) throw error;
  return json({ data });
});

crmRouter.post("/v1/crm/retention/seed-defaults", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const db = supabase as any;
  const [rulesRes, segsRes] = await Promise.all([
    db.rpc("seed_default_automation_rules", { p_user_id: user.id }),
    db.rpc("seed_default_customer_segments", { p_user_id: user.id }),
  ]);
  if (rulesRes.error) throw new Error(rulesRes.error.message);
  if (segsRes.error) throw new Error(segsRes.error.message);
  return json({ data: { rules: (rulesRes.data as number) ?? 0, segments: (segsRes.data as number) ?? 0 } });
});

crmRouter.delete("/v1/crm/retention/automation-rules/:id", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const { supabase, user } = await requireAuth(c);
  const { error } = await supabase.from("automation_rules").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw error;
  return json({ data: { id } });
});

crmRouter.post("/v1/crm/retention/signals/snooze", async (c) => {
  const { signal_ids, days } = retentionSignalIdsSchema
    .extend({ days: z.number().int().min(1).max(365).default(30) })
    .parse(await c.req.json());
  const { supabase } = await requireAuth(c);
  const db = supabase as any;
  const snoozeUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  for (const signalId of signal_ids) {
    const { data: existing, error: readErr } = await db
      .from("retention_signals")
      .select("payload_jsonb")
      .eq("id", signalId)
      .single();
    if (readErr) throw readErr;
    const merged = {
      ...((existing?.payload_jsonb as Record<string, unknown> | null) || {}),
      snooze_until: snoozeUntil,
      snoozed_at: new Date().toISOString(),
    };
    const { error } = await db.from("retention_signals").update({ status: "suppressed", payload_jsonb: merged }).eq("id", signalId);
    if (error) throw error;
  }
  return json({ data: { snoozed: signal_ids.length, snooze_until: snoozeUntil } });
});

crmRouter.post("/v1/crm/retention/signals/dismiss", async (c) => {
  const { signal_ids } = retentionSignalIdsSchema.parse(await c.req.json());
  const { supabase } = await requireAuth(c);
  const { error } = await (supabase as any).from("retention_signals").update({ status: "suppressed" }).in("id", signal_ids);
  if (error) throw error;
  return json({ data: { dismissed: signal_ids.length } });
});

crmRouter.post("/v1/crm/retention/signals/resolve", async (c) => {
  const { signal_ids } = retentionSignalIdsSchema.parse(await c.req.json());
  const { supabase } = await requireAuth(c);
  const { error } = await (supabase as any)
    .from("retention_signals")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .in("id", signal_ids);
  if (error) throw error;
  return json({ data: { resolved: signal_ids.length } });
});

const retentionActionSchema = z.object({
  signal_ids: z.array(z.string().uuid()).min(1).max(500),
  action_type: z.enum(["send_winback_sms", "send_winback_email", "issue_reward", "send_reminder", "schedule_call", "send_recovery_offer", "award_points"]),
  config: z.record(z.string(), z.unknown()).default({}),
});

crmRouter.post("/v1/crm/retention/actions/enqueue", async (c) => {
  const body = retentionActionSchema.parse(await c.req.json());
  const { supabase, user } = await requireAuth(c);
  const db = supabase as any;
  const { data: signals, error: fetchErr } = await db
    .from("retention_signals")
    .select("id, signal_type, customer_id, vehicle_id")
    .in("id", body.signal_ids);
  if (fetchErr) throw fetchErr;
  const jobs = (signals || []).map((s: any) => ({
    user_id: user.id,
    job_type: `retention.${body.action_type}`,
    priority: 5,
    payload_jsonb: {
      signal_id: s.id,
      signal_type: s.signal_type,
      customer_id: s.customer_id,
      vehicle_id: s.vehicle_id,
      config: body.config,
    },
  }));
  const { error: insertErr } = await db.from("job_queue").insert(jobs);
  if (insertErr) throw insertErr;
  const { error: updateErr } = await db.from("retention_signals").update({ status: "active" }).in("id", body.signal_ids);
  if (updateErr) throw updateErr;
  return json({ data: { enqueued: jobs.length } }, { status: 201 });
});

crmRouter.get("/v1/crm/retention/job-queue/stats", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await supabase.from("job_queue").select("status").eq("user_id", user.id).limit(500);
  if (error) throw error;
  return json({ data: data ?? [] });
});

crmRouter.get("/v1/crm/retention/job-queue/health", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await supabase
    .from("job_queue")
    .select("status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  let running = 0;
  let pending = 0;
  let failed = 0;
  let lastJobAt: string | null = null;
  for (const row of data || []) {
    const status = row.status as string;
    if (!lastJobAt && row.created_at) lastJobAt = row.created_at as string;
    if (status === "running" || status === "in_progress") running++;
    else if (status === "pending" || status === "queued") pending++;
    else if (status === "failed" || status === "dead_letter") failed++;
  }
  return json({ data: { idle: running === 0 && pending === 0, running, pending, failed, lastJobAt } });
});

// Retention impact (command-center derived metrics), computed server-side.
const RETENTION_ACTIVE_STATUSES = ["detected", "active"] as const;
const RETENTION_TYPE_WEIGHT: Record<string, number> = {
  winback_candidate: 1.0,
  customer_winback_candidate: 1.0,
  vehicle_overdue: 0.95,
  vehicle_at_risk: 0.9,
  at_risk: 0.85,
  cancelled_appointment: 0.7,
  customer_cancelled_appointment: 0.7,
  payment_received: 0.2,
  customer_payment_received: 0.2,
};

crmRouter.get("/v1/crm/retention/impact/metrics", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const db = supabase as any;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const [signalsRes, profilesRes, loyaltyRes, prevSignalsRes] = await Promise.all([
    db.from("retention_signals").select("id, signal_type, customer_id, score, detected_at, status").eq("user_id", user.id).in("status", [...RETENTION_ACTIVE_STATUSES]).gte("detected_at", thirtyDaysAgo),
    db.from("retention_vehicle_profiles").select("vehicle_id, days_overdue").eq("user_id", user.id).gt("days_overdue", 0),
    db.from("loyalty_accounts").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "active"),
    db.from("retention_signals").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("detected_at", sixtyDaysAgo).lt("detected_at", thirtyDaysAgo),
  ]);
  if (signalsRes.error) throw signalsRes.error;
  if (profilesRes.error) throw profilesRes.error;
  const signals = signalsRes.data || [];
  const winbackTypes = new Set(["winback_candidate", "customer_winback_candidate", "at_risk"]);
  const winbackCustomerIds = new Set<string>();
  for (const s of signals) {
    if (winbackTypes.has(s.signal_type) && s.customer_id) winbackCustomerIds.add(s.customer_id);
  }
  let revenueAtRisk = 0;
  if (winbackCustomerIds.size > 0) {
    const { data: customers } = await db.from("customers").select("id, lifetime_value").in("id", Array.from(winbackCustomerIds));
    revenueAtRisk = (customers || []).reduce((sum: number, cc: any) => sum + (Number(cc.lifetime_value) || 0), 0);
  }
  const currentVolume = signals.length;
  const previousVolume = prevSignalsRes.count || 0;
  const trendDelta = previousVolume > 0 ? ((currentVolume - previousVolume) / previousVolume) * 100 : 0;
  return json({
    data: {
      revenueAtRisk,
      winbackCustomers: winbackCustomerIds.size,
      overdueVehicles: profilesRes.data?.length || 0,
      loyaltyActive: loyaltyRes.count || 0,
      trendDelta,
    },
  });
});

crmRouter.get("/v1/crm/retention/impact/action-queue", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const db = supabase as any;
  const { data: signals, error } = await db
    .from("retention_signals")
    .select("id, signal_type, status, score, detected_at, customer_id, vehicle_id")
    .eq("user_id", user.id)
    .in("status", [...RETENTION_ACTIVE_STATUSES])
    .order("detected_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  if (!signals?.length) return json({ data: [] });
  const customerIds = Array.from(new Set(signals.map((s: any) => s.customer_id).filter(Boolean) as string[]));
  const ltvMap = new Map<string, number>();
  if (customerIds.length > 0) {
    const { data: customers } = await db.from("customers").select("id, lifetime_value").in("id", customerIds);
    (customers || []).forEach((cc: any) => ltvMap.set(cc.id, Number(cc.lifetime_value) || 0));
  }
  const groups = new Map<string, any>();
  for (const s of signals) {
    const key = s.signal_type;
    if (!groups.has(key)) {
      groups.set(key, {
        signal_type: key, count: 0, avg_score: 0, max_score: 0, estimated_impact: 0,
        signal_ids: [], customer_ids: [], vehicle_ids: [],
        oldest_detected_at: null, newest_detected_at: null,
      });
    }
    const g = groups.get(key);
    g.count += 1;
    g.signal_ids.push(s.id);
    if (s.customer_id) g.customer_ids.push(s.customer_id);
    if (s.vehicle_id) g.vehicle_ids.push(s.vehicle_id);
    const score = Number(s.score) || 0;
    g.avg_score += score;
    g.max_score = Math.max(g.max_score, score);
    if (!g.oldest_detected_at || s.detected_at < g.oldest_detected_at) g.oldest_detected_at = s.detected_at;
    if (!g.newest_detected_at || s.detected_at > g.newest_detected_at) g.newest_detected_at = s.detected_at;
  }
  const result: any[] = [];
  for (const g of groups.values()) {
    g.avg_score = g.count > 0 ? g.avg_score / g.count : 0;
    const uniqueCustomers = Array.from(new Set(g.customer_ids));
    g.estimated_impact = uniqueCustomers.reduce((sum: number, id: string) => sum + (ltvMap.get(id) || 0), 0);
    result.push(g);
  }
  result.sort((a, b) => {
    const wa = (RETENTION_TYPE_WEIGHT[a.signal_type] ?? 0.5) * a.count * Math.max(a.avg_score, 0.1);
    const wb = (RETENTION_TYPE_WEIGHT[b.signal_type] ?? 0.5) * b.count * Math.max(b.avg_score, 0.1);
    return wb - wa;
  });
  return json({ data: result.slice(0, 10) });
});

crmRouter.get("/v1/crm/retention/signals/by-ids", async (c) => {
  const ids = (new URL(c.req.url).searchParams.get("ids") || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 50);
  const { supabase } = await requireAuth(c);
  const db = supabase as any;
  if (!ids.length) return json({ data: [] });
  const { data, error } = await db
    .from("retention_signals")
    .select("id, signal_type, status, score, detected_at, customer_id, vehicle_id, payload_jsonb")
    .in("id", ids)
    .order("score", { ascending: false, nullsFirst: false })
    .limit(50);
  if (error) throw error;
  const customerIds = Array.from(new Set((data || []).map((r: any) => r.customer_id).filter(Boolean) as string[]));
  const custMap = new Map<string, any>();
  if (customerIds.length) {
    const { data: customers } = await db.from("customers").select("id, name, email, phone, lifetime_value").in("id", customerIds);
    (customers || []).forEach((cc: any) => custMap.set(cc.id, cc));
  }
  return json({
    data: (data || []).map((s: any) => ({
      ...s,
      customer: s.customer_id ? custMap.get(s.customer_id) ?? null : null,
    })),
  });
});

crmRouter.get("/v1/crm/retention/signal-log", async (c) => {
  const params = new URL(c.req.url).searchParams;
  const { supabase, user } = await requireAuth(c);
  const db = supabase as any;
  let q = db
    .from("retention_signals")
    .select("id, signal_type, status, score, detected_at, customer_id, vehicle_id, payload_jsonb")
    .eq("user_id", user.id)
    .order("detected_at", { ascending: false })
    .limit(Math.min(Number(params.get("limit") || 200), 5000));
  const type = params.get("type");
  const status = params.get("status");
  const scoreMin = params.get("score_min");
  if (type) q = q.eq("signal_type", type);
  if (status) q = q.eq("status", status);
  if (scoreMin !== null && scoreMin !== "" && !Number.isNaN(Number(scoreMin))) q = q.gte("score", Number(scoreMin));
  const { data, error } = await q;
  if (error) throw error;
  return json({ data: data || [] });
});

// Retention verification: event inserts, email retry, worker invoke, snapshots.
const retentionEventSchema = z.object({
  event_name: z.string().trim().min(1).max(200),
  aggregate_type: z.string().trim().min(1).max(120),
  aggregate_id: z.string().trim().min(1).max(200),
  customer_id: z.string().uuid().nullable().optional(),
  vehicle_id: z.string().uuid().nullable().optional(),
  payload_jsonb: z.record(z.string(), z.unknown()).default({}),
  occurred_at: z.string().datetime(),
});

crmRouter.post("/v1/crm/retention/events", async (c) => {
  const rows = z.array(retentionEventSchema).min(1).max(500).parse(await c.req.json());
  const { supabase, user } = await requireAuth(c);
  const { error } = await (supabase as any)
    .from("retention_events")
    .insert(rows.map((row) => ({ ...row, user_id: user.id })));
  if (error) throw error;
  return json({ data: { inserted: rows.length } }, { status: 201 });
});

crmRouter.patch("/v1/crm/retention/email-queue/:id/retry", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const { supabase } = await requireAuth(c);
  const db = supabase as any;
  const { error: updErr } = await db
    .from("email_queue")
    .update({ status: "pending", error_message: null, retry_count: 0, scheduled_for: new Date().toISOString(), sent_at: null })
    .eq("id", id);
  if (updErr) throw updErr;
  const { error: invErr } = await supabase.functions.invoke("transactional-email-worker", {
    body: { trigger: "manual_retry", email_queue_id: id },
  });
  if (invErr) throw new Error(invErr.message || "Could not retry queued email.");
  return json({ data: { id, status: "pending" } });
});

crmRouter.post("/v1/crm/retention/worker/invoke", async (c) => {
  const { scope } = z.object({ scope: z.string().trim().max(80).default("verify_today") }).parse(await c.req.json().catch(() => ({})));
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await supabase.functions.invoke("retention-worker", {
    body: { user_id: user.id, scope },
  });
  if (error) throw new Error(error.message || "Could not invoke retention worker.");
  return json({ data: data ?? {} });
});

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

crmRouter.get("/v1/crm/retention/verification/snapshot", async (c) => {
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id"));
  const { supabase } = await requireWorkspaceAuth(c, workspaceId);
  const todayIso = startOfTodayIso();
  const { count, error } = await supabase
    .from("service_records")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "completed")
    .gte("updated_at", todayIso);
  if (error) throw error;
  return json({
    data: {
      counts: {
        servicesCompleted: count ?? 0,
        retentionEvents: 0,
        reviewActions: 0,
        reviewRequests: 0,
        reviewEmailsQueued: 0,
        reviewEmailsSent: 0,
      },
      recentEvents: [],
      recentActions: [],
      recentEmails: [],
    },
  });
});

crmRouter.get("/v1/crm/retention/verification/completed-services", async (c) => {
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id"));
  const { supabase } = await requireWorkspaceAuth(c, workspaceId);
  const todayIso = startOfTodayIso();
  const { data, error } = await (supabase as any)
    .from("service_records")
    .select("id,customer_id,vehicle_id,total_amount,completed_at,created_at,updated_at")
    .eq("workspace_id", workspaceId)
    .eq("status", "completed")
    .gte("updated_at", todayIso);
  if (error) throw error;
  return json({
    data: ((data ?? []) as any[]).map((row) => ({
      id: row.id,
      customer_id: row.customer_id ?? null,
      vehicle_id: row.vehicle_id ?? null,
      total_cost: row.total_amount == null ? null : Number(row.total_amount),
      service_date: (row.completed_at ?? row.created_at)?.slice(0, 10) ?? null,
      updated_at: row.updated_at,
    })),
  });
});

// ---------------------------------------------------------------------------
// /v1/crm/segments/* — customer segmentation (workspace-scoped)
// ---------------------------------------------------------------------------
const segmentSaveSchema = z.object({
  workspace_id: z.string().uuid(),
  id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  color: z.string().trim().max(40).nullable().optional(),
  icon: z.string().trim().max(80).nullable().optional(),
  min_lifetime_value: z.number().nullable().optional(),
  max_lifetime_value: z.number().nullable().optional(),
  min_total_services: z.number().nullable().optional(),
  max_total_services: z.number().nullable().optional(),
  min_days_since_service: z.number().nullable().optional(),
  max_days_since_service: z.number().nullable().optional(),
  min_average_order: z.number().nullable().optional(),
  max_average_order: z.number().nullable().optional(),
  is_auto: z.boolean().nullable().optional(),
  priority: z.number().int().nullable().optional(),
  auto_follow_up_days: z.number().int().nullable().optional(),
  is_active: z.boolean().nullable().optional(),
  geo_center_lat: z.number().nullable().optional(),
  geo_center_lng: z.number().nullable().optional(),
  geo_radius_miles: z.number().nullable().optional(),
  is_edit: z.boolean().default(false),
});

crmRouter.get("/v1/crm/segments", async (c) => {
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id"));
  const { supabase } = await requireWorkspaceAuth(c, workspaceId);
  const { data, error } = await (supabase as any)
    .from("customer_segments")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("priority", { ascending: false });
  if (error) throw error;
  return json({ data: data ?? [] });
});

crmRouter.post("/v1/crm/segments", async (c) => {
  const body = segmentSaveSchema.parse(await c.req.json());
  const { supabase, user } = await requireWorkspaceAuth(c, body.workspace_id, [...loyaltyWriteRoles]);
  const db = supabase as any;
  const { is_edit, id, workspace_id, ...rest } = body;
  const payload = {
    ...rest,
    id: undefined,
    workspace_id,
    user_id: user.id,
    updated_at: new Date().toISOString(),
  };
  if (is_edit && id) {
    const { error } = await db.from("customer_segments").update(payload).eq("workspace_id", workspace_id).eq("id", id);
    if (error) throw error;
    return json({ data: { id } });
  }
  const { data, error } = await db.from("customer_segments").insert(payload).select("id").single();
  if (error) throw error;
  return json({ data }, { status: 201 });
});

crmRouter.delete("/v1/crm/segments/:id", async (c) => {
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id"));
  const id = z.string().uuid().parse(c.req.param("id"));
  const { supabase } = await requireWorkspaceAuth(c, workspaceId, [...loyaltyWriteRoles]);
  const { error } = await (supabase as any).from("customer_segments").delete().eq("workspace_id", workspaceId).eq("id", id);
  if (error) throw error;
  return json({ data: { id } });
});

function segmentMatches(value: number | null, min: unknown, max: unknown): boolean {
  if (min != null && (value == null || value < Number(min))) return false;
  if (max != null && (value == null || value > Number(max))) return false;
  return true;
}

crmRouter.get("/v1/crm/segments/:name/customers", async (c) => {
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id"));
  const segmentName = decodeURIComponent(c.req.param("name"));
  const { supabase } = await requireWorkspaceAuth(c, workspaceId);
  const db = supabase as any;
  const [segmentResult, customerResult, serviceResult] = await Promise.all([
    db.from("customer_segments").select("*").eq("workspace_id", workspaceId).eq("name", segmentName).maybeSingle(),
    db.from("customers").select("id,first_name,last_name,company_name,email,phone").eq("workspace_id", workspaceId).neq("status", "archived"),
    db.from("service_records").select("customer_id,total_amount,completed_at,started_at,created_at").eq("workspace_id", workspaceId),
  ]);
  if (segmentResult.error) throw segmentResult.error;
  if (customerResult.error) throw customerResult.error;
  if (serviceResult.error) throw serviceResult.error;
  const segment = segmentResult.data;
  if (!segment) return json({ data: [] });
  const servicesByCustomer = new Map<string, any[]>();
  for (const service of serviceResult.data ?? []) {
    if (!service.customer_id) continue;
    const list = servicesByCustomer.get(service.customer_id) ?? [];
    list.push(service);
    servicesByCustomer.set(service.customer_id, list);
  }
  const now = Date.now();
  const rows: any[] = [];
  for (const customer of customerResult.data ?? []) {
    const services = servicesByCustomer.get(customer.id) ?? [];
    const lifetime = services.reduce((sum: number, row: any) => sum + Number(row.total_amount ?? 0), 0);
    const total = services.length;
    const average = total ? lifetime / total : 0;
    const dates = services
      .map((row: any) => row.completed_at || row.started_at || row.created_at)
      .filter(Boolean)
      .map((value: unknown) => Date.parse(String(value)))
      .filter(Number.isFinite);
    const lastMs = dates.length ? Math.max(...dates) : null;
    const days = lastMs == null ? null : Math.max(0, Math.floor((now - lastMs) / 86_400_000));
    if (
      !segmentMatches(lifetime, segment.min_lifetime_value, segment.max_lifetime_value) ||
      !segmentMatches(total, segment.min_total_services, segment.max_total_services) ||
      !segmentMatches(days, segment.min_days_since_service, segment.max_days_since_service) ||
      !segmentMatches(average, segment.min_average_order, segment.max_average_order)
    ) {
      continue;
    }
    rows.push({
      id: customer.id,
      name: [customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.company_name || "Customer",
      email: customer.email,
      phone: customer.phone,
      lifetime_value: lifetime,
      total_services: total,
      last_service_date: lastMs == null ? null : new Date(lastMs).toISOString(),
    });
  }
  rows.sort((a, b) => b.lifetime_value - a.lifetime_value);
  return json({ data: rows.slice(0, 500) });
});

crmRouter.get("/v1/crm/segments/demographics", async (c) => {
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id"));
  const { supabase } = await requireWorkspaceAuth(c, workspaceId);
  const db = supabase as any;
  const [customerResult, serviceResult] = await Promise.all([
    db.from("customers").select("id,first_name,last_name,company_name,address_line1,address_line2,city,region,postal_code,metadata").eq("workspace_id", workspaceId),
    db.from("service_records").select("customer_id,total_amount").eq("workspace_id", workspaceId),
  ]);
  if (customerResult.error) throw customerResult.error;
  if (serviceResult.error) throw serviceResult.error;
  const totals = new Map<string, { value: number; count: number }>();
  for (const service of serviceResult.data ?? []) {
    if (!service.customer_id) continue;
    const current = totals.get(service.customer_id) ?? { value: 0, count: 0 };
    current.value += Number(service.total_amount ?? 0);
    current.count += 1;
    totals.set(service.customer_id, current);
  }
  const metadataObject = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return json({
    data: (customerResult.data ?? []).map((row: any) => {
      const metadata = metadataObject(row.metadata);
      const summary = totals.get(row.id) ?? { value: 0, count: 0 };
      const latitude = Number(metadata.latitude ?? metadata.lat);
      const longitude = Number(metadata.longitude ?? metadata.lng);
      return {
        id: row.id,
        name: [row.first_name, row.last_name].filter(Boolean).join(" ") || row.company_name || "Customer",
        address: [row.address_line1, row.address_line2, row.city, row.region, row.postal_code].filter(Boolean).join(", ") || null,
        postal_code: row.postal_code,
        latitude: Number.isFinite(latitude) ? latitude : null,
        longitude: Number.isFinite(longitude) ? longitude : null,
        lifetime_value: summary.value,
        total_services: summary.count,
      };
    }),
  });
});

crmRouter.post("/v1/crm/segments/recalculate", async (c) => {
  const { workspace_id } = z.object({ workspace_id: z.string().uuid() }).parse(await c.req.json());
  const { supabase } = await requireWorkspaceAuth(c, workspace_id, [...loyaltyWriteRoles]);
  const db = supabase as any;
  const [customersRes, servicesRes, segmentsRes] = await Promise.all([
    db.from("customers").select("id,created_at").eq("workspace_id", workspace_id),
    db.from("service_records").select("customer_id,total_amount,completed_at,started_at,created_at").eq("workspace_id", workspace_id),
    db.from("customer_segments").select("*").eq("workspace_id", workspace_id).eq("is_active", true),
  ]);
  if (customersRes.error) throw customersRes.error;
  if (servicesRes.error) throw servicesRes.error;
  if (segmentsRes.error) throw segmentsRes.error;
  const servicesByCustomer = new Map<string, any[]>();
  for (const service of servicesRes.data ?? []) {
    if (!service.customer_id) continue;
    const list = servicesByCustomer.get(service.customer_id) ?? [];
    list.push(service);
    servicesByCustomer.set(service.customer_id, list);
  }
  const now = Date.now();
  const stats = (customersRes.data ?? []).map((customer: any) => {
    const services = servicesByCustomer.get(customer.id) ?? [];
    const lifetime = services.reduce((sum: number, row: any) => sum + Number(row.total_amount ?? 0), 0);
    const dates = services
      .map((row: any) => row.completed_at || row.started_at || row.created_at)
      .filter(Boolean)
      .map((value: unknown) => Date.parse(String(value)))
      .filter(Number.isFinite);
    const last = dates.length ? Math.max(...dates) : null;
    return {
      id: customer.id,
      lifetime,
      total: services.length,
      average: services.length ? lifetime / services.length : 0,
      days: last == null ? null : Math.max(0, Math.floor((now - last) / 86_400_000)),
    };
  });
  const timestamp = new Date().toISOString();
  for (const segment of segmentsRes.data ?? []) {
    const memberCount = stats.filter((customer: any) =>
      segmentMatches(customer.lifetime, segment.min_lifetime_value, segment.max_lifetime_value) &&
      segmentMatches(customer.total, segment.min_total_services, segment.max_total_services) &&
      segmentMatches(customer.days, segment.min_days_since_service, segment.max_days_since_service) &&
      segmentMatches(customer.average, segment.min_average_order, segment.max_average_order)
    ).length;
    const { error } = await db.from("customer_segments").update({
      member_count: memberCount,
      last_calculated_at: timestamp,
      calculation_status: "current",
      calculation_started_at: null,
      calculation_error: null,
      updated_at: timestamp,
    }).eq("workspace_id", workspace_id).eq("id", segment.id);
    if (error) throw error;
  }
  return json({ data: { recalculated: stats.length } });
});

// ---------------------------------------------------------------------------
// /v1/crm/phone-coupons/* — phone coupon overrides (workspace-scoped)
// ---------------------------------------------------------------------------
const phoneCouponOverrideSchema = z.object({
  workspace_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  disabled: z.boolean().default(false),
  custom_discount_type: z.enum(["percentage", "fixed"]).nullable().optional(),
  custom_discount_value: z.number().nullable().optional(),
  custom_min_order_amount: z.number().nullable().optional(),
  custom_description: z.string().trim().max(2000).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

crmRouter.get("/v1/crm/phone-coupons", async (c) => {
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id"));
  const { supabase } = await requireWorkspaceAuth(c, workspaceId);
  const db = supabase as any;
  const [customerRes, overrideRes] = await Promise.all([
    db.from("customers").select("id,first_name,last_name,company_name,email,phone").eq("workspace_id", workspaceId).not("phone", "is", null),
    db.from("phone_coupon_overrides").select("*").eq("workspace_id", workspaceId),
  ]);
  if (customerRes.error) throw customerRes.error;
  if (overrideRes.error) throw overrideRes.error;
  const customers = (customerRes.data ?? [])
    .map((row: any) => ({
      id: row.id,
      name: [row.first_name, row.last_name].filter(Boolean).join(" ") || row.company_name || "Customer",
      email: row.email ?? null,
      phone: row.phone ?? null,
    }))
    .sort((a: { name: string | null }, b: { name: string | null }) => (a.name || "").localeCompare(b.name || ""));
  return json({ data: { customers, overrides: overrideRes.data ?? [] } });
});

crmRouter.post("/v1/crm/phone-coupons/overrides", async (c) => {
  const body = phoneCouponOverrideSchema.parse(await c.req.json());
  const { supabase, user } = await requireWorkspaceAuth(c, body.workspace_id, [...loyaltyWriteRoles]);
  const { error } = await (supabase as any).from("phone_coupon_overrides").upsert(
    {
      workspace_id: body.workspace_id,
      user_id: user.id,
      customer_id: body.customer_id,
      disabled: body.disabled ?? false,
      custom_discount_type: body.custom_discount_type ?? null,
      custom_discount_value: body.custom_discount_value ?? null,
      custom_min_order_amount: body.custom_min_order_amount ?? null,
      custom_description: body.custom_description ?? null,
      notes: body.notes ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id,customer_id" },
  );
  if (error) throw error;
  return json({ data: { customer_id: body.customer_id } });
});

crmRouter.delete("/v1/crm/phone-coupons/overrides/:id", async (c) => {
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id"));
  const id = z.string().uuid().parse(c.req.param("id"));
  const { supabase } = await requireWorkspaceAuth(c, workspaceId, [...loyaltyWriteRoles]);
  const { error } = await (supabase as any).from("phone_coupon_overrides").delete().eq("workspace_id", workspaceId).eq("id", id);
  if (error) throw error;
  return json({ data: { id } });
});

// ---------------------------------------------------------------------------
// GET /v1/crm/coupons/validate — public coupon validation for booking
// ---------------------------------------------------------------------------
crmRouter.get("/v1/crm/coupons/validate", async (c) => {
  const params = new URL(c.req.url).searchParams;
  const businessUserId = z.string().uuid().parse(params.get("business_user_id"));
  const code = z.string().trim().min(1).max(120).parse(params.get("code"));
  const subtotal = Number(params.get("subtotal") || 0);
  const admin = createSupabaseAdminClient();
  const trimmed = code.trim();

  const { data: coupon } = await admin
    .from("coupon_codes")
    .select("*")
    .eq("user_id", businessUserId)
    .ilike("code", trimmed)
    .eq("is_active", true)
    .maybeSingle();

  if (coupon) {
    if (coupon.valid_until && new Date(coupon.valid_until) < new Date()) {
      throw new ApiError(422, "This coupon has expired", "coupon_expired");
    }
    if (coupon.valid_from && new Date(coupon.valid_from) > new Date()) {
      throw new ApiError(422, "This coupon is not yet valid", "coupon_not_yet_valid");
    }
    if (coupon.max_uses && coupon.used_count >= coupon.max_uses) {
      throw new ApiError(422, "This coupon has reached its usage limit", "coupon_usage_limit");
    }
    if (coupon.min_order_amount && subtotal < coupon.min_order_amount) {
      // apiClient only surfaces error code + message, so the formatted amount
      // is embedded in the message for the client's user-friendly error.
      const formatted = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
        Number(coupon.min_order_amount),
      );
      throw new ApiError(422, `Minimum order amount of ${formatted} required for this coupon.`, "coupon_min_order");
    }
    return json({
      data: {
        id: coupon.id,
        code: coupon.code,
        discount_type: coupon.discount_type,
        discount_value: Number(coupon.discount_value),
        description: coupon.description,
        min_order_amount: coupon.min_order_amount ?? null,
      },
    });
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length >= 7) {
    const { data: phoneCoupon } = await (admin as any).rpc("validate_phone_coupon", {
      _business_user_id: businessUserId,
      _phone: digits,
    });
    const row = Array.isArray(phoneCoupon) ? phoneCoupon[0] : phoneCoupon;
    if (row) {
      const min = Number(row.min_order_amount) || 0;
      if (min && subtotal < min) {
        const formatted = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(min);
        throw new ApiError(422, `Minimum order amount of ${formatted} required for this coupon.`, "coupon_min_order");
      }
      return json({
        data: {
          id: `phone:${digits}`,
          code: digits,
          discount_type: row.discount_type || "percentage",
          discount_value: Number(row.discount_value) || 0,
          description: row.description || "Loyalty discount",
          min_order_amount: min || null,
        },
      });
    }
  }

  throw new ApiError(422, "Invalid or expired coupon code", "coupon_invalid");
});

// ---------------------------------------------------------------------------
// /v1/crm/marketing/* — marketing reads (user-scoped via session)
// ---------------------------------------------------------------------------
crmRouter.get("/v1/crm/marketing/email-campaigns", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await supabase
    .from("email_marketing_campaigns")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return json({ data: data ?? [] });
});

crmRouter.get("/v1/crm/marketing/email-campaigns/customer-count", async (c) => {
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id"));
  const { supabase } = await requireWorkspaceAuth(c, workspaceId);
  const { count, error } = await (supabase as any)
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .neq("status", "archived")
    .not("email", "is", null);
  if (error) throw error;
  return json({ data: { count: count ?? 0 } });
});

const emailCampaignCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  subject: z.string().trim().min(1).max(500),
  content: z.string().min(1),
  recipient_type: z.string().trim().min(1).max(120),
  scheduled_at: z.string().datetime().nullable().optional(),
  recipient_ids: z.array(z.string().uuid()).nullable().optional(),
});

crmRouter.post("/v1/crm/marketing/email-campaigns", async (c) => {
  const payload = emailCampaignCreateSchema.parse(await c.req.json());
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await (supabase as any)
    .from("email_marketing_campaigns")
    .insert({
      user_id: user.id,
      name: payload.name,
      subject: payload.subject,
      content: payload.content,
      recipient_type: payload.recipient_type,
      scheduled_at: payload.scheduled_at ?? null,
      recipient_ids: payload.recipient_ids ?? null,
      status: payload.scheduled_at ? "scheduled" : "draft",
    })
    .select("id")
    .single();
  if (error) throw error;
  return json({ data }, { status: 201 });
});

crmRouter.delete("/v1/crm/marketing/email-campaigns/:id", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const { supabase, user } = await requireAuth(c);
  const { error } = await (supabase as any).from("email_marketing_campaigns").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw error;
  return json({ data: { id } });
});

// Recipient resolution for campaign audience previews and sends.
crmRouter.get("/v1/crm/marketing/recipients", async (c) => {
  const params = new URL(c.req.url).searchParams;
  const workspaceId = z.string().uuid().parse(params.get("workspace_id"));
  const recipientType = params.get("recipient_type") || "all";
  const segmentCustomerIds = (params.get("segment_customer_ids") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const overrideIds = (params.get("override_ids") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const { supabase } = await requireWorkspaceAuth(c, workspaceId);
  const db = supabase as any;

  const { data: customerRows, error: customerError } = await db
    .from("customers")
    .select("id,first_name,last_name,company_name,email")
    .eq("workspace_id", workspaceId)
    .not("email", "is", null);
  if (customerError) throw customerError;
  let customers = (customerRows ?? [])
    .filter((row: any) => Boolean(row.email))
    .map((row: any) => ({
      id: String(row.id),
      name: [row.first_name, row.last_name].filter(Boolean).join(" ") || row.company_name || "Customer",
      email: String(row.email),
    }));

  if (recipientType.startsWith("segment:")) {
    const matchingIds = new Set(segmentCustomerIds);
    customers = customers.filter((customer: { id: string }) => matchingIds.has(customer.id));
  } else if (overrideIds.length > 0) {
    const matchingIds = new Set(overrideIds);
    customers = customers.filter((customer: { id: string }) => matchingIds.has(customer.id));
  } else if (recipientType === "recent" || recipientType === "inactive") {
    const months = recipientType === "recent" ? 3 : 6;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const { data: appointments, error: apptError } = await db
      .from("appointments")
      .select("customer_id")
      .eq("workspace_id", workspaceId)
      .gte("starts_at", cutoff.toISOString());
    if (apptError) throw apptError;
    const activeIds = new Set((appointments ?? []).map((row: any) => row.customer_id).filter(Boolean));
    customers = recipientType === "recent"
      ? customers.filter((customer: { id: string }) => activeIds.has(customer.id))
      : customers.filter((customer: { id: string }) => !activeIds.has(customer.id));
  }
  return json({ data: customers });
});

const campaignSendSchema = z.object({
  recipient_ids: z.array(z.string().uuid()).nullable().optional(),
  recipient_type: z.string().trim().min(1).max(120),
  segment_customer_ids: z.array(z.string().uuid()).default([]),
});

async function resolveCampaignRecipients(
  db: any,
  workspaceId: string,
  campaign: { name: string; recipient_ids: string[] | null },
  input: z.infer<typeof campaignSendSchema>,
): Promise<Array<{ id: string; name: string; email: string }>> {
  const overrideIds = campaign.recipient_ids ?? input.recipient_ids ?? null;
  if (overrideIds !== null) {
    if (overrideIds.length === 0) {
      throw new ApiError(422, `Campaign "${campaign.name}" has an empty recipient override. Either add recipients or remove the override.`, "empty_recipient_override");
    }
    const { data, error } = await db
      .from("customers")
      .select("id,first_name,last_name,company_name,email")
      .eq("workspace_id", workspaceId)
      .in("id", overrideIds)
      .not("email", "is", null);
    if (error) throw error;
    const recipients = (data ?? []).filter((row: any) => Boolean(row.email)).map((row: any) => ({
      id: String(row.id),
      name: [row.first_name, row.last_name].filter(Boolean).join(" ") || row.company_name || "Customer",
      email: String(row.email),
    }));
    if (!recipients.length) {
      throw new ApiError(422, `Campaign "${campaign.name}" has no deliverable recipients in override.`, "no_deliverable_recipients");
    }
    return recipients;
  }
  const { data: customerRows, error: customerError } = await db
    .from("customers")
    .select("id,first_name,last_name,company_name,email")
    .eq("workspace_id", workspaceId)
    .not("email", "is", null);
  if (customerError) throw customerError;
  let customers = (customerRows ?? []).filter((row: any) => Boolean(row.email)).map((row: any) => ({
    id: String(row.id),
    name: [row.first_name, row.last_name].filter(Boolean).join(" ") || row.company_name || "Customer",
    email: String(row.email),
  }));
  const recipientType = input.recipient_type;
  if (recipientType.startsWith("segment:")) {
    const matchingIds = new Set(input.segment_customer_ids);
    customers = customers.filter((customer: { id: string }) => matchingIds.has(customer.id));
  } else if (recipientType === "recent" || recipientType === "inactive") {
    const months = recipientType === "recent" ? 3 : 6;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const { data: appointments, error: apptError } = await db
      .from("appointments")
      .select("customer_id")
      .eq("workspace_id", workspaceId)
      .gte("starts_at", cutoff.toISOString());
    if (apptError) throw apptError;
    const activeIds = new Set((appointments ?? []).map((row: any) => row.customer_id).filter(Boolean));
    customers = recipientType === "recent"
      ? customers.filter((customer: { id: string }) => activeIds.has(customer.id))
      : customers.filter((customer: { id: string }) => !activeIds.has(customer.id));
  }
  return customers;
}

crmRouter.post("/v1/crm/marketing/email-campaigns/:id/send", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const input = campaignSendSchema.parse(await c.req.json());
  const { workspace_id } = z.object({ workspace_id: z.string().uuid() }).parse({ workspace_id: new URL(c.req.url).searchParams.get("workspace_id") });
  const { supabase, user } = await requireWorkspaceAuth(c, workspace_id, [...loyaltyWriteRoles]);
  const db = supabase as any;
  const { data: campaign, error: campaignError } = await db
    .from("email_marketing_campaigns")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (campaignError || !campaign) throw campaignError ?? new ApiError(404, "Campaign not found", "not_found");

  const recipients = await resolveCampaignRecipients(db, workspace_id, campaign, input);
  if (!recipients.length) throw new ApiError(422, "No customers matching the criteria found", "no_recipients");

  const { data: profile } = await supabase
    .from("business_profiles")
    .select("business_name, email, booking_slug")
    .eq("user_id", user.id)
    .maybeSingle();

  const emailQueue = recipients.map((customer) => ({
    user_id: user.id,
    customer_id: customer.id,
    campaign_id: campaign.id,
    email_type: "promotional",
    recipient_email: customer.email,
    recipient_name: customer.name,
    scheduled_for: new Date().toISOString(),
    status: "pending",
    source: "campaign_manager",
    metadata: {
      campaignId: campaign.id,
      subject: campaign.subject,
      content: campaign.content,
      service_name: campaign.subject,
      service_description: campaign.content,
      businessName: profile?.business_name || "Your Auto Shop",
      business_name: profile?.business_name || "Your Auto Shop",
      business_email: profile?.email || undefined,
      bookingSlug: profile?.booking_slug,
      booking_slug: profile?.booking_slug,
    },
  }));
  const { error: queueError } = await db.from("email_queue").insert(emailQueue);
  if (queueError) throw queueError;
  const { error: updateError } = await db
    .from("email_marketing_campaigns")
    .update({ status: "sent", sent_at: new Date().toISOString(), recipient_count: recipients.length })
    .eq("id", campaign.id);
  if (updateError) throw updateError;
  return json({ data: { sent: recipients.length } });
});

crmRouter.post("/v1/crm/marketing/email-campaigns/:id/test", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const { to } = z.object({ to: z.string().email().max(320) }).parse(await c.req.json());
  const { supabase, user } = await requireAuth(c);
  const db = supabase as any;
  const { data: campaign, error: campaignError } = await db
    .from("email_marketing_campaigns")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (campaignError || !campaign) throw campaignError ?? new ApiError(404, "Campaign not found", "not_found");
  const { data: profile } = await supabase
    .from("business_profiles")
    .select("business_name, email, booking_slug")
    .eq("user_id", user.id)
    .maybeSingle();
  // Thin server-side proxy for the existing send-email edge function; the
  // messaging worker owns the sending mechanism itself.
  const { error } = await supabase.functions.invoke("send-email", {
    body: {
      source: "campaign_manager_test",
      to,
      type: "promotional",
      campaign_id: campaign.id,
      customerName: "Test Customer",
      businessName: profile?.business_name || "Your Auto Shop",
      businessEmail: profile?.email || undefined,
      serviceName: campaign.subject,
      serviceDescription: campaign.content,
      bookingSlug: profile?.booking_slug || undefined,
    },
  });
  if (error) throw new Error(error.message || "Could not send test email.");
  return json({ data: { sent: true } });
});

// Marketing reads: testimonials, business slug, review dashboard, analytics, LTV.
crmRouter.get("/v1/crm/marketing/testimonials", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await supabase
    .from("testimonials")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return json({ data: data ?? [] });
});

crmRouter.get("/v1/crm/marketing/business-slug", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data } = await supabase.from("business_profiles").select("booking_slug").eq("user_id", user.id).maybeSingle();
  return json({ data: { booking_slug: data?.booking_slug ?? null } });
});

crmRouter.get("/v1/crm/marketing/review-dashboard", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const db = supabase as any;
  const [analyticsRes, requestsRes] = await Promise.all([
    db.rpc("get_review_analytics", { p_days: 30 }),
    supabase.from("review_requests").select("*, services:service_id (service_type, description)").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
  ]);
  if (requestsRes.error) throw requestsRes.error;
  return json({ data: { analytics: analyticsRes.data?.[0] ?? null, requests: requestsRes.data ?? [] } });
});

crmRouter.get("/v1/crm/marketing/analytics", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const db = supabase as any;
  const [emailQueueRes, reviewRes, testimonialRes, campaignRes, subscriberRes] = await Promise.all([
    db.from("email_queue").select("email_type, status").eq("user_id", user.id),
    db.from("review_requests").select("status, clicked_at").eq("user_id", user.id),
    db.from("testimonials").select("status").eq("user_id", user.id),
    db.from("email_marketing_campaigns").select("id").eq("user_id", user.id),
    db.from("customers").select("*", { count: "exact", head: true }).eq("user_id", user.id).not("email", "is", null),
  ]);
  if (emailQueueRes.error) throw emailQueueRes.error;
  if (reviewRes.error) throw reviewRes.error;
  if (testimonialRes.error) throw testimonialRes.error;
  const emailQueue = emailQueueRes.data ?? [];
  const reviewRequests = reviewRes.data ?? [];
  const testimonials = testimonialRes.data ?? [];
  const emailsSent = emailQueue.filter((e: any) => e.status === "sent").length;
  const emailTypeCount = emailQueue.reduce((acc: Record<string, number>, email: any) => {
    acc[email.email_type] = (acc[email.email_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const emailQueueStats = Object.entries(emailTypeCount).map(([type, count]) => ({
    email_type: type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
    count: Number(count),
  }));
  return json({
    data: {
      emailsSent,
      emailsOpened: null,
      reviewRequestsSent: reviewRequests.filter((r: any) => r.status === "sent").length,
      reviewRequestsClicked: reviewRequests.filter((r: any) => r.clicked_at).length,
      testimonials: testimonials.length,
      approvedTestimonials: testimonials.filter((t: any) => t.status === "approved").length,
      campaigns: campaignRes.data?.length ?? 0,
      subscribers: subscriberRes.count ?? 0,
      emailQueueStats,
    },
  });
});

crmRouter.get("/v1/crm/marketing/ltv", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const db = supabase as any;
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const twelveMonthsAgoDate = twelveMonthsAgo.toISOString().slice(0, 10);
  const [customerRes, paymentRes, serviceRes] = await Promise.all([
    db.from("customers").select("*").eq("user_id", user.id).not("lifetime_value", "is", null).order("lifetime_value", { ascending: false }),
    db.from("payments").select("created_at, amount, status, appointment_id").eq("user_id", user.id).eq("status", "succeeded").gte("created_at", `${twelveMonthsAgoDate}T00:00:00`).order("created_at"),
    db.from("services").select("service_date, total_cost").eq("user_id", user.id).eq("status", "completed").gte("service_date", twelveMonthsAgoDate).order("service_date"),
  ]);
  if (customerRes.error) throw customerRes.error;
  if (paymentRes.error) throw paymentRes.error;
  if (serviceRes.error) throw serviceRes.error;
  return json({
    data: {
      customers: customerRes.data ?? [],
      payments: paymentRes.data ?? [],
      services: serviceRes.data ?? [],
    },
  });
});

crmRouter.patch("/v1/crm/marketing/testimonials/:id", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const { status } = z.object({ status: z.enum(["approved", "rejected"]) }).parse(await c.req.json());
  const { supabase, user } = await requireAuth(c);
  const { error } = await (supabase as any).from("testimonials").update({ status }).eq("id", id).eq("user_id", user.id);
  if (error) throw error;
  return json({ data: { id, status } });
});

crmRouter.patch("/v1/crm/marketing/testimonials/:id/featured", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const { featured } = z.object({ featured: z.boolean() }).parse(await c.req.json());
  const { supabase, user } = await requireAuth(c);
  const { error } = await (supabase as any).from("testimonials").update({ featured }).eq("id", id).eq("user_id", user.id);
  if (error) throw error;
  return json({ data: { id, featured } });
});

crmRouter.post("/v1/crm/marketing/abandoned-bookings/:id/recovery-sent", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const { supabase, user } = await requireAuth(c);
  const { error } = await (supabase as any)
    .from("abandoned_bookings")
    .update({ recovery_sent_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
  return json({ data: { id } });
});

crmRouter.get("/v1/crm/marketing/abandoned-bookings", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await supabase
    .from("abandoned_bookings")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return json({ data: data ?? [] });
});

crmRouter.get("/v1/crm/marketing/segment-names", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data } = await supabase.from("customer_segments").select("name").eq("user_id", user.id).eq("is_active", true);
  return json({ data: (data ?? []).map((d: any) => d.name as string) });
});

crmRouter.get("/v1/crm/marketing/segments", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await supabase
    .from("customer_segments")
    .select("id, name, color")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("priority", { ascending: false });
  if (error) throw error;
  return json({ data: data ?? [] });
});

crmRouter.get("/v1/crm/marketing/legacy-segments/:name/customers", async (c) => {
  const segmentName = decodeURIComponent(c.req.param("name"));
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, email, phone, lifetime_value, total_services, last_service_date")
    .eq("user_id", user.id)
    .eq("customer_segment", segmentName)
    .order("lifetime_value", { ascending: false, nullsFirst: false })
    .limit(500);
  if (error) throw error;
  return json({ data: data ?? [] });
});

crmRouter.get("/v1/crm/marketing/legacy-segments/:name/customer-ids", async (c) => {
  const segmentName = decodeURIComponent(c.req.param("name"));
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await supabase
    .from("customers")
    .select("id")
    .eq("user_id", user.id)
    .eq("customer_segment", segmentName);
  if (error) throw error;
  return json({ data: (data ?? []).map((row: any) => row.id as string) });
});

crmRouter.get("/v1/crm/marketing/retention-signals-since", async (c) => {
  const since = z.string().datetime().parse(new URL(c.req.url).searchParams.get("since"));
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await supabase
    .from("retention_signals")
    .select("detected_at, signal_type, customer_id")
    .eq("user_id", user.id)
    .gte("detected_at", since)
    .order("detected_at", { ascending: true })
    .limit(5000);
  if (error) throw error;
  return json({ data: data ?? [] });
});

crmRouter.get("/v1/crm/marketing/service-reminders-since", async (c) => {
  const since = z.string().datetime().parse(new URL(c.req.url).searchParams.get("since"));
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await supabase
    .from("service_reminders")
    .select("created_at, reminder_date, service_type, status, customer_id")
    .eq("user_id", user.id)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(5000);
  if (error) throw error;
  return json({ data: data ?? [] });
});

// Marketing settings (business_profiles, keyed by session user).
const marketingSettingsSchema = z.object({
  google_review_url: z.string().trim().max(2000).nullable().optional(),
  yelp_review_url: z.string().trim().max(2000).nullable().optional(),
  review_request_delay_hours: z.number().int().min(0).max(720),
  appointment_reminder_hours: z.number().int().min(0).max(720),
  service_reminder_months: z.number().int().min(0).max(60),
});

crmRouter.get("/v1/crm/marketing/settings", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await supabase
    .from("business_profiles")
    .select("google_review_url, yelp_review_url, review_request_delay_hours, appointment_reminder_hours, service_reminder_months")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return json({ data: null });
  return json({
    data: {
      google_review_url: data.google_review_url || "",
      yelp_review_url: data.yelp_review_url || "",
      review_request_delay_hours: data.review_request_delay_hours || 24,
      appointment_reminder_hours: data.appointment_reminder_hours || 24,
      service_reminder_months: data.service_reminder_months || 3,
    },
  });
});

crmRouter.patch("/v1/crm/marketing/settings", async (c) => {
  const body = marketingSettingsSchema.parse(await c.req.json());
  const { supabase, user } = await requireAuth(c);
  const { error } = await supabase
    .from("business_profiles")
    .update({
      google_review_url: body.google_review_url || null,
      yelp_review_url: body.yelp_review_url || null,
      review_request_delay_hours: body.review_request_delay_hours,
      appointment_reminder_hours: body.appointment_reminder_hours,
      service_reminder_months: body.service_reminder_months,
    })
    .eq("user_id", user.id);
  if (error) throw error;
  return json({ data: { updated: true } });
});

// Live visitors (legacy tenant_id column, owner-scoped read).
crmRouter.get("/v1/crm/marketing/live-visitors", async (c) => {
  const params = new URL(c.req.url).searchParams;
  const ownerUserId = z.string().uuid().parse(params.get("owner_user_id"));
  const cutoff = z.string().datetime().parse(params.get("cutoff"));
  const { supabase, user } = await requireAuth(c);
  if (user.id !== ownerUserId) throw new ApiError(403, "You can only view your own live visitors", "forbidden");
  const db = supabase as any;
  const [{ data: rows }, { data: liveEvents }] = await Promise.all([
    db.from("visitor_presence").select("id,visitor_id,current_path,state,heartbeat_at,device_type").eq("tenant_id", ownerUserId).in("state", ["active", "idle"]).gte("heartbeat_at", cutoff),
    db.from("analytics_events").select("event_name, created_at").eq("tenant_id", ownerUserId).order("created_at", { ascending: false }).limit(50),
  ]);
  return json({ data: { rows: rows ?? [], events: liveEvents ?? [] } });
});

// Thin server-side proxies for the existing messaging edge functions. The
// messaging worker owns the sending mechanisms; these endpoints only relocate
// the existing client-side invoke calls behind the Hono boundary.
async function invokeEdgeFunction(c: Context, fn: string, body: unknown, headers?: Record<string, string>) {
  const { supabase } = await requireAuth(c);
  const { data, error } = await supabase.functions.invoke(fn, { body, headers });
  if (error) throw new Error(error.message || `Could not invoke ${fn}.`);
  const payload = (data ?? {}) as { error?: string };
  if (payload && typeof payload.error === "string" && payload.error) throw new Error(payload.error);
  return json({ data: data ?? {} });
}

crmRouter.post("/v1/crm/marketing/email/send", async (c) => {
  const body = z.object({ to: z.string().email().max(320), subject: z.string().min(1).max(500), html: z.string().min(1) }).parse(await c.req.json());
  return invokeEdgeFunction(c, "send-email", body);
});

crmRouter.post("/v1/crm/marketing/newsletter/subscribe", async (c) => {
  const body = z.object({
    workspaceUserId: z.string().uuid(),
    email: z.string().email().max(320),
    name: z.string().trim().max(200).optional(),
    source: z.string().trim().min(1).max(120),
    segment: z.string().trim().max(120).default("general"),
    utm: z.record(z.string(), z.string()).default({}),
  }).parse(await c.req.json());
  return invokeEdgeFunction(c, "newsletter-subscribe", body);
});

crmRouter.get("/v1/crm/marketing/newsletter/campaigns", async (c) => {
  const { supabase } = await requireAuth(c);
  const { data, error } = await supabase.functions.invoke("newsletter-campaign-schedule", { method: "GET" } as never);
  if (error) throw new Error(error.message || "Could not list newsletter campaigns.");
  return json({ data: data ?? {} });
});

crmRouter.post("/v1/crm/marketing/newsletter/campaigns", async (c) => {
  const body = z.object({
    subject: z.string().trim().min(1).max(500),
    previewText: z.string().trim().max(500).nullable(),
    html: z.string().min(1),
    segment: z.string().trim().min(1).max(120),
    sendAt: z.string().datetime(),
  }).parse(await c.req.json());
  return invokeEdgeFunction(c, "newsletter-campaign-schedule", { subject: body.subject, previewText: body.previewText, html: body.html, segment: body.segment, sendAt: body.sendAt });
});

crmRouter.delete("/v1/crm/marketing/newsletter/campaigns/:id", async (c) => {
  const id = z.string().min(1).max(200).parse(c.req.param("id"));
  const { supabase } = await requireAuth(c);
  const { data, error } = await supabase.functions.invoke(`newsletter-campaign-schedule?id=${encodeURIComponent(id)}`, { method: "DELETE" } as never);
  if (error) throw new Error(error.message || "Could not cancel newsletter campaign.");
  return json({ data: data ?? {} });
});

crmRouter.post("/v1/crm/maintenance-reminders/send", async (c) => {
  const { send_all } = z.object({ send_all: z.boolean().default(false) }).parse(await c.req.json().catch(() => ({})));
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await supabase.functions.invoke("maintenance-reminder-scheduler", {
    body: { user_id: user.id, send_all },
  });
  if (error) throw new Error(error.message || "Could not send maintenance reminders.");
  return json({ data: data ?? { sent: 0 } });
});

// ---------------------------------------------------------------------------
// /v1/crm/receptionist/* — AI receptionist profile + provisioning proxies
// ---------------------------------------------------------------------------
crmRouter.get("/v1/crm/receptionist/profile", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await supabase
    .from("business_profiles")
    .select("user_id, business_name, elevenlabs_agent_id, receptionist_phone_number, receptionist_phone_number_id, receptionist_voice_id, receptionist_system_prompt, receptionist_first_message, receptionist_status, receptionist_provisioned_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return json({ data: data ?? null });
});

crmRouter.post("/v1/crm/receptionist/config", async (c) => {
  const body = z.object({
    voiceId: z.string().trim().min(1).max(200),
    firstMessage: z.string().trim().min(1).max(4000),
    systemPrompt: z.string().trim().min(1).max(20000),
  }).parse(await c.req.json());
  return invokeEdgeFunction(c, "receptionist-update", body);
});

crmRouter.post("/v1/crm/receptionist/deprovision", async (c) => {
  return invokeEdgeFunction(c, "receptionist-deprovision", {});
});

crmRouter.get("/v1/crm/receptionist/health", async (c) => {
  const { supabase } = await requireAuth(c);
  const { data, error } = await supabase.functions.invoke("receptionist-health", { body: {} });
  if (error) throw new Error(error.message || "Could not check receptionist health.");
  const payload = (data ?? {}) as { error?: string };
  if (payload && typeof payload.error === "string" && payload.error) throw new Error(payload.error);
  return json({ data: data ?? { healthy: false, state: "check_failed" } });
});

// ---------------------------------------------------------------------------
// /v1/crm/customer-portal/* — customer-facing portal (session-scoped RPCs)
// ---------------------------------------------------------------------------
crmRouter.post("/v1/crm/customer-portal/accounts/link", async (c) => {
  const { supabase } = await requireAuth(c);
  const result = await (supabase as any).rpc("link_customer_portal_account_v1");
  if (result.error) throw new Error(result.error.message || "Could not link customer account.");
  return json({ data: result.data ?? [] });
});

crmRouter.get("/v1/crm/customer-portal/account", async (c) => {
  const { supabase, user } = await requireAuth(c);
  const db = supabase as any;
  const linked = await db.rpc("link_customer_portal_account_v1");
  if (linked.error) throw new Error(linked.error.message || "Could not link customer account.");
  const links = (linked.data ?? []) as Array<{ customer_id: string; workspace_id: string }>;
  const link = links[0];
  if (!link) return json({ data: null });
  const { data: customer, error } = await db
    .from("customers")
    .select("id,workspace_id,first_name,last_name,email,phone")
    .eq("id", link.customer_id)
    .eq("workspace_id", link.workspace_id)
    .maybeSingle();
  if (error) throw error;
  if (!customer) return json({ data: null });
  const row = customer as { id: string; workspace_id: string; first_name: string; last_name: string; email: string | null; phone: string | null };
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  return json({
    data: {
      id: row.id,
      email: row.email ?? user.email ?? "",
      full_name: [row.first_name, row.last_name].filter(Boolean).join(" ") || (typeof meta.full_name === "string" ? meta.full_name : null),
      phone: row.phone ?? (typeof meta.phone === "string" ? meta.phone : null),
      user_id: user.id,
      provider_id: null,
      workspace_id: row.workspace_id,
    },
  });
});

crmRouter.patch("/v1/crm/customer-portal/account", async (c) => {
  const body = z.object({
    account_id: z.string().uuid().nullable(),
    full_name: z.string().trim().max(200).nullable(),
    phone: z.string().trim().max(40).nullable(),
  }).parse(await c.req.json());
  const { supabase, user } = await requireAuth(c);
  const db = supabase as any;
  let accountId = body.account_id;
  if (!accountId) {
    // Fallback: the caller's own account row (matches the legacy flow where
    // the auth user id was the account identifier).
    const { data: own, error: ownError } = await db.from("customer_accounts").select("id,user_id").eq("user_id", user.id).maybeSingle();
    if (ownError) throw ownError;
    if (!own) throw new ApiError(404, "Customer account not found", "not_found");
    accountId = (own as { id: string }).id;
  }
  const { data: existing, error: readError } = await db.from("customer_accounts").select("id,user_id").eq("id", accountId).single();
  if (readError || !existing) throw readError ?? new ApiError(404, "Customer account not found", "not_found");
  if (existing.user_id !== user.id) throw new ApiError(403, "You can only update your own account", "forbidden");
  const { data, error } = await db
    .from("customer_accounts")
    .update({ full_name: body.full_name, phone: body.phone })
    .eq("id", body.account_id)
    .select()
    .single();
  if (error) throw new ApiError(500, "Failed to update profile", "profile_update_failed");
  return json({ data });
});

crmRouter.get("/v1/crm/customer-portal/experience", async (c) => {
  const { supabase } = await requireAuth(c);
  const { data, error } = await (supabase as any).rpc("get_customer_portal_rewards_v1");
  if (error) throw new Error(error.message);
  const result = (data ?? {}) as {
    status?: "active" | "not_enrolled";
    completed_services?: number;
    total_spent?: number;
    points_balance?: number;
    accounts?: any[];
    ledger?: any[];
  };
  return json({
    data: {
      completedServices: Number(result.completed_services ?? 0),
      totalSpent: Number(result.total_spent ?? 0),
      rewardPoints: Number(result.points_balance ?? 0),
      accounts: result.accounts ?? [],
      ledger: result.ledger ?? [],
      dashboardStatus: result.status ?? "not_enrolled",
    },
  });
});

crmRouter.get("/v1/crm/customer-portal/service-history", async (c) => {
  const { supabase } = await requireAuth(c);
  const { data, error } = await (supabase as any).rpc("get_customer_portal_service_history_v1");
  if (error) throw error;
  type Row = { id:string; title:string|null; scheduled_date:string; scheduled_time:string; status:string; estimated_cost:number|null; duration_minutes:number|null; description:string|null; notes:string|null; tax_amount:number|null; actual_start_time:string|null; actual_end_time:string|null; service_catalog_name:string|null; vehicle_make:string|null; vehicle_model:string|null; vehicle_year:number|null };
  return json({
    data: ((data ?? []) as Row[]).map((row) => ({
      id: row.id, title: row.title ?? "Service", scheduled_date: row.scheduled_date, scheduled_time: row.scheduled_time, status: row.status,
      estimated_cost: row.estimated_cost, duration_minutes: row.duration_minutes ?? 0, description: row.description, notes: row.notes, tax_amount: row.tax_amount,
      actual_start_time: row.actual_start_time, actual_end_time: row.actual_end_time,
      service_catalog: row.service_catalog_name ? { name: row.service_catalog_name } : null,
      vehicles: row.vehicle_make || row.vehicle_model || row.vehicle_year != null ? { make: row.vehicle_make ?? "", model: row.vehicle_model ?? "", year: row.vehicle_year ?? 0 } : null,
    })),
  });
});

crmRouter.get("/v1/crm/customer-portal/payments", async (c) => {
  const { supabase } = await requireAuth(c);
  const { data, error } = await (supabase as any).rpc("get_customer_portal_payments_v1");
  if (error) throw error;
  type Row = { id:string; title:string|null; scheduled_date:string; scheduled_time:string; status:string; estimated_cost:number|null; payment_status:string|null; tax_amount:number|null; service_catalog_name:string|null; invoice_id:string|null; invoice_number:number|null; invoice_status:string|null; payment_url:string|null; receipt_url:string|null };
  return json({
    data: ((data ?? []) as Row[]).map((row) => ({
      id: row.id, title: row.title ?? "Payment", scheduled_date: row.scheduled_date, scheduled_time: row.scheduled_time, status: row.status,
      estimated_cost: row.estimated_cost, payment_status: row.payment_status, tax_amount: row.tax_amount,
      service_catalog: row.service_catalog_name ? { name: row.service_catalog_name } : null,
      invoice_id: row.invoice_id, invoice_number: row.invoice_number, invoice_status: row.invoice_status, payment_url: row.payment_url, receipt_url: row.receipt_url,
    })),
  });
});

// Public, management-token-scoped appointment reschedule (no session).
crmRouter.post("/v1/crm/customer-portal/appointments/reschedule-by-token", async (c) => {
  const body = z.object({
    management_token: z.string().trim().min(1).max(500),
    new_date: z.string().trim().min(1).max(40),
    new_time: z.string().trim().min(1).max(40),
  }).parse(await c.req.json());
  const admin = createSupabaseAdminClient();
  const { data, error } = await (admin as any).rpc("reschedule_appointment_by_token", {
    p_management_token: body.management_token,
    p_new_date: body.new_date,
    p_new_time: body.new_time,
  });
  if (error) throw new Error(error.message || "Could not reschedule appointment.");
  const result = data as Record<string, unknown> | null;
  if (result?.success === false) {
    return json({ data: { success: false, message: result.message as string } });
  }
  return json({ data: { success: true } });
});

// ---------------------------------------------------------------------------
// POST /v1/crm/messaging-consent — public booking-consent edge function proxy
// ---------------------------------------------------------------------------
crmRouter.post("/v1/crm/messaging-consent", async (c) => {
  const body = z.object({
    userId: z.string().uuid(),
    email: z.string().email().max(320).nullable(),
    phone: z.string().trim().max(40).nullable(),
    transactionalSmsConsent: z.boolean(),
    marketingSmsConsent: z.boolean(),
    marketingEmailConsent: z.boolean(),
    consentTexts: z.object({
      transactionalSms: z.string().max(4000),
      marketingSms: z.string().max(4000),
      marketingEmail: z.string().max(4000),
    }),
    source: z.string().trim().min(1).max(120),
    signature: z.string().trim().max(500).optional(),
  }).parse(await c.req.json());
  const { signature, ...rest } = body;
  // Public endpoint (booking flow); the edge function verifies the HMAC
  // signature itself. Uses the service-role client so the call works without
  // a staff session, exactly like the original client-side invoke.
  const admin = createSupabaseAdminClient();
  const { error } = await admin.functions.invoke("record-booking-consent", {
    body: rest,
    headers: signature ? { "x-hmac-signature": signature } : {},
  });
  if (error) throw new Error(error.message || "Could not update preferences.");
  return json({ data: { recorded: true } });
});

// ---------------------------------------------------------------------------
// /v1/crm/testimonials/* — public testimonial submission
// ---------------------------------------------------------------------------
crmRouter.get("/v1/crm/testimonials/profile", async (c) => {
  const slug = z.string().trim().min(1).max(200).parse(new URL(c.req.url).searchParams.get("slug"));
  const admin = createSupabaseAdminClient();
  const { data, error } = await (admin as any).rpc("get_public_booking_profile_v2", { booking_slug_param: slug });
  if (error || !data || data.length === 0) return json({ data: null });
  const profile = data[0];
  return json({
    data: {
      user_id: profile.user_id,
      business_name: profile.business_name || "Auto Shop",
      logo_url: profile.logo_url,
    },
  });
});

crmRouter.post("/v1/crm/testimonials/submit", async (c) => {
  const body = z.object({
    user_id: z.string().uuid(),
    customer_name: z.string().trim().min(1).max(200),
    customer_email: z.string().email().max(320).nullable(),
    content: z.string().trim().min(1).max(10000),
    rating: z.number().int().min(1).max(5),
  }).parse(await c.req.json());
  const admin = createSupabaseAdminClient();
  const { error } = await (admin as any).from("testimonials").insert({ ...body, status: "pending" });
  if (error) throw error;
  return json({ data: { submitted: true } }, { status: 201 });
});

// ---------------------------------------------------------------------------
// /v1/crm/newsletter/* — newsletter sequences, templates, subscribers
// ---------------------------------------------------------------------------
crmRouter.get("/v1/crm/newsletter/sequences", async (c) => {
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id"));
  const { supabase } = await requireWorkspaceAuth(c, workspaceId);
  const { data, error } = await (supabase as any)
    .from("newsletter_sequences")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return json({ data: data ?? [] });
});

const newsletterSequenceSchema = z.object({
  workspace_id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).default(""),
  templates: z.array(z.object({
    month_number: z.number().int().min(1).max(120),
    subject: z.string().trim().min(1).max(500),
    preview_text: z.string().trim().max(500).default(""),
    content: z.string().min(1),
    holiday_theme: z.string().trim().max(200).default(""),
    seasonal_theme: z.string().trim().max(200).default(""),
    is_active: z.boolean().default(true),
  })).default([]),
});

crmRouter.post("/v1/crm/newsletter/sequences", async (c) => {
  const body = newsletterSequenceSchema.parse(await c.req.json());
  const { supabase, user } = await requireWorkspaceAuth(c, body.workspace_id, [...loyaltyWriteRoles]);
  const db = supabase as any;
  const { data: sequence, error: seqError } = await db.from("newsletter_sequences").insert({
    workspace_id: body.workspace_id,
    user_id: user.id,
    name: body.name,
    description: body.description,
    is_active: true,
    start_date: new Date().toISOString().split("T")[0],
  }).select("id").single();
  if (seqError) throw seqError;
  if (body.templates.length) {
    const { error: templateError } = await db.from("newsletter_templates").insert(body.templates.map((template) => ({
      ...template,
      workspace_id: body.workspace_id,
      user_id: user.id,
      sequence_id: sequence.id,
    })));
    if (templateError) throw templateError;
  }
  return json({ data: { id: sequence.id } }, { status: 201 });
});

crmRouter.get("/v1/crm/newsletter/templates", async (c) => {
  const params = new URL(c.req.url).searchParams;
  const workspaceId = z.string().uuid().parse(params.get("workspace_id"));
  const sequenceId = z.string().uuid().parse(params.get("sequence_id"));
  const { supabase } = await requireWorkspaceAuth(c, workspaceId);
  const { data, error } = await (supabase as any)
    .from("newsletter_templates")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("sequence_id", sequenceId)
    .order("month_number");
  if (error) throw error;
  return json({ data: data ?? [] });
});

const newsletterTemplateUpdateSchema = z.object({
  workspace_id: z.string().uuid(),
  is_active: z.boolean().optional(),
  subject: z.string().trim().min(1).max(500).optional(),
  preview_text: z.string().trim().max(500).optional(),
  content: z.string().min(1).optional(),
  holiday_theme: z.string().trim().max(200).optional(),
  seasonal_theme: z.string().trim().max(200).optional(),
});

crmRouter.patch("/v1/crm/newsletter/templates/:id", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const body = newsletterTemplateUpdateSchema.parse(await c.req.json());
  const { supabase } = await requireWorkspaceAuth(c, body.workspace_id, [...loyaltyWriteRoles]);
  const { workspace_id: _ws, ...updates } = body;
  if (!Object.keys(updates).length) throw new ApiError(422, "No updates provided", "empty_update");
  const { error } = await (supabase as any).from("newsletter_templates").update(updates).eq("workspace_id", body.workspace_id).eq("id", id);
  if (error) throw error;
  return json({ data: { id } });
});

crmRouter.get("/v1/crm/newsletter/subscriber-count", async (c) => {
  const workspaceId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("workspace_id"));
  const { supabase } = await requireWorkspaceAuth(c, workspaceId);
  const { count, error } = await (supabase as any)
    .from("newsletter_subscribers")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "active");
  if (error) throw error;
  return json({ data: { count: count ?? 0 } });
});

// ---------------------------------------------------------------------------
// /v1/crm/customer-portal — customer account + bookings (session-scoped)
// ---------------------------------------------------------------------------
crmRouter.get("/v1/crm/customer-portal/account-row", async (c) => {
  const userId = z.string().uuid().parse(new URL(c.req.url).searchParams.get("user_id"));
  const { supabase, user } = await requireAuth(c);
  if (user.id !== userId) throw new ApiError(403, "You can only view your own account", "forbidden");
  const { data, error } = await supabase
    .from("customer_accounts")
    .select("id, email, full_name, phone")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return json({ data: data ?? null });
});

crmRouter.post("/v1/crm/customer-portal/accounts", async (c) => {
  const body = z.object({
    email: z.string().email().max(320),
    full_name: z.string().trim().max(200).nullable().optional(),
    phone: z.string().trim().max(40).nullable().optional(),
  }).parse(await c.req.json());
  const { supabase, user } = await requireAuth(c);
  const db = supabase as any;
  // Canonical account linking (the legacy create_customer_account RPC is retired).
  const linked = await db.rpc("link_customer_portal_account_v1");
  if (linked.error) throw new Error(linked.error.message || "Could not create customer account.");
  const { data: account } = await db
    .from("customer_accounts")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  return json({ data: account?.id ?? null });
});

crmRouter.get("/v1/crm/customer-portal/accounts/:id", async (c) => {
  const id = z.string().uuid().parse(c.req.param("id"));
  const { supabase, user } = await requireAuth(c);
  const { data, error } = await supabase.from("customer_accounts").select("*").eq("id", id).single();
  if (error) throw error;
  if ((data as { user_id: string }).user_id !== user.id) throw new ApiError(403, "You can only view your own account", "forbidden");
  return json({ data });
});

crmRouter.get("/v1/crm/customer-portal/bookings", async (c) => {
  const params = new URL(c.req.url).searchParams;
  const accountId = params.get("account_id") ? z.string().uuid().parse(params.get("account_id")) : null;
  const email = z.string().email().max(320).parse(params.get("email"));
  const { supabase, user } = await requireAuth(c);
  const db = supabase as any;
  // Verify the account belongs to the caller before exposing its bookings.
  if (accountId) {
    const { data: account, error: accountError } = await db
      .from("customer_accounts")
      .select("id, user_id")
      .eq("id", accountId)
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account || account.user_id !== user.id) throw new ApiError(403, "You can only view your own bookings", "forbidden");
  }
  const { data, error } = await db
    .from("appointments")
    .select("id, title, scheduled_date, scheduled_time, duration_minutes, status, estimated_cost, guest_name, management_token, service_catalog:service_catalog(name), user_id")
    .or(accountId ? `customer_account_id.eq.${accountId},guest_email.ilike.${email.replace(/,/g, "\\,")}` : `guest_email.ilike.${email.replace(/,/g, "\\,")}`)
    .order("scheduled_date", { ascending: false })
    .order("scheduled_time", { ascending: false });
  if (error) throw error;
  return json({ data: data ?? [] });
});

crmRouter.post("/v1/crm/customer-portal/appointments/cancel-by-token", async (c) => {
  const body = z.object({
    management_token: z.string().trim().min(1).max(500),
    reason: z.string().trim().max(2000).nullable().optional(),
  }).parse(await c.req.json());
  // Public endpoint (cancel dialog in the booking flow); the token itself is
  // the credential, mirroring the original client-side RPC call.
  const admin = createSupabaseAdminClient();
  const { data, error } = await (admin as any).rpc("cancel_appointment_by_token", {
    p_management_token: body.management_token,
    p_cancellation_reason: body.reason || undefined,
  });
  if (error) throw new Error(error.message || "Failed to cancel appointment");
  return json({ data: data ?? null });
});

crmRouter.get("/v1/crm/customer-portal/appointments", async (c) => {
  const { supabase } = await requireAuth(c);
  const { data, error } = await (supabase as any).rpc("get_customer_portal_appointments_v1");
  if (error) {
    console.error("[customer-portal/appointments] rpc error", error);
    throw new Error("Appointments are temporarily unavailable.");
  }
  type Row = {
    id: string; title: string | null; scheduled_date: string; scheduled_time: string; duration_minutes: number | null;
    status: string; estimated_cost: number | null; guest_name: string | null; management_token: string | null;
    location_address: string | null; notes: string | null; description: string | null; payment_status: string | null;
    service_catalog_name: string | null; created_at: string | null; assigned_at: string | null;
    actual_start_time: string | null; actual_end_time: string | null;
  };
  return json({
    data: ((data ?? []) as Row[]).map((r) => ({
      id: r.id,
      title: r.title ?? "",
      scheduled_date: r.scheduled_date,
      scheduled_time: r.scheduled_time,
      duration_minutes: r.duration_minutes ?? 0,
      status: r.status,
      estimated_cost: r.estimated_cost,
      guest_name: r.guest_name,
      management_token: r.management_token,
      location_address: r.location_address,
      notes: r.notes,
      description: r.description,
      payment_status: r.payment_status,
      service_catalog: r.service_catalog_name ? { name: r.service_catalog_name } : null,
      created_at: r.created_at,
      assigned_at: r.assigned_at,
      actual_start_time: r.actual_start_time,
      actual_end_time: r.actual_end_time,
    })),
  });
});

crmRouter.get("/v1/crm/retention/automation-executions", async (c) => {
  const params = new URL(c.req.url).searchParams;
  const userId = z.string().uuid().parse(params.get("user_id"));
  const limit = Math.max(1, Math.min(500, Number(params.get("limit") ?? 50) || 50));
  const { supabase, user } = await requireAuth(c);
  if (user.id !== userId) throw new ApiError(403, "You can only view your own execution log", "forbidden");
  const { data, error } = await (supabase as any)
    .from("retention_action_executions")
    .select("id, rule_id, customer_id, action_type, status, executed_at, result_jsonb, automation_rules(name), customers(name)")
    .eq("user_id", user.id)
    .order("executed_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return json({
    data: (data || []).map((row: any) => {
      const ruleRel = row.automation_rules as { name?: string } | null;
      const custRel = row.customers as { name?: string } | null;
      return {
        id: row.id,
        rule_id: row.rule_id,
        rule_name: ruleRel?.name ?? null,
        customer_id: row.customer_id,
        customer_name: custRel?.name ?? null,
        action_type: row.action_type,
        status: row.status,
        executed_at: row.executed_at,
        result_jsonb: row.result_jsonb as Record<string, unknown> | null,
      };
    }),
  });
});
