/**
 * Catalog domain router — service catalog items (`service_catalog` table).
 *
 * Serves the `/v1/catalog/items` contract the application layer expects:
 * - `src/application/queries/service-catalog.query.ts` — GET list
 * - `src/application/commands/catalog.command.ts` — GET one / POST / PATCH / DELETE
 *
 * These endpoints had no server route (neither a `app/api/v1/catalog/*`
 * handler nor a Hono router), so every ServiceCatalog read/write 404'd.
 * Paths are registered relative to `/api` (the app-level basePath); do not
 * include the `/api` prefix.
 */
import { Hono } from "hono";
import { z } from "zod";
import { json } from "@/server/api";
import { requireWorkspaceAuth } from "@/server/hono/middleware/auth";

export const catalogRouter = new Hono();

const workspaceIdParam = z.string().uuid();
const idParam = z.string().uuid();

const catalogRowSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(5000).nullable().optional(),
    category: z.string().max(200).nullable().optional(),
    labor_price: z.number().nonnegative().nullable().optional(),
    estimated_minutes: z.number().int().min(0).nullable().optional(),
    is_active: z.boolean().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    updated_at: z.string().datetime().optional(),
  })
  .passthrough();

const postBodySchema = z.object({
  workspace_id: z.string().uuid(),
  rows: z.array(catalogRowSchema).min(1).max(100),
});

const patchBodySchema = z.object({
  workspace_id: z.string().uuid(),
  row: catalogRowSchema.partial(),
});

function workspaceIdFromQuery(c: { req: { url: string } }): string {
  const workspaceId = new URL(c.req.url).searchParams.get("workspace_id");
  return workspaceIdParam.parse(workspaceId);
}

// GET /v1/catalog/items?workspace_id= — full rows (incl. metadata); the
// client maps canonical columns + metadata into CatalogItem.
catalogRouter.get("/v1/catalog/items", async (c) => {
  const workspaceId = workspaceIdFromQuery(c);
  const { supabase } = await requireWorkspaceAuth(c, workspaceId);
  const { data, error } = await supabase
    .from("service_catalog")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true });
  if (error) throw error;
  return json({ data: data ?? [] });
});

// GET /v1/catalog/items/:id?workspace_id= — single row (callers read metadata).
catalogRouter.get("/v1/catalog/items/:id", async (c) => {
  const id = idParam.parse(c.req.param("id"));
  const workspaceId = workspaceIdFromQuery(c);
  const { supabase } = await requireWorkspaceAuth(c, workspaceId);
  const { data, error } = await supabase
    .from("service_catalog")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return json({ data: data ?? null });
});

// POST /v1/catalog/items — insert rows; body { workspace_id, rows: [...] }.
catalogRouter.post("/v1/catalog/items", async (c) => {
  const body = postBodySchema.parse(await c.req.json());
  const { supabase } = await requireWorkspaceAuth(c, body.workspace_id);
  const rows = body.rows.map((row) => ({ ...row, workspace_id: body.workspace_id }));
  const { data, error } = await supabase.from("service_catalog").insert(rows).select();
  if (error) throw error;
  return json({ data: data ?? [] }, { status: 201 });
});

// PATCH /v1/catalog/items/:id — partial update; body { workspace_id, row }.
catalogRouter.patch("/v1/catalog/items/:id", async (c) => {
  const id = idParam.parse(c.req.param("id"));
  const body = patchBodySchema.parse(await c.req.json());
  const { supabase } = await requireWorkspaceAuth(c, body.workspace_id);
  const { data, error } = await supabase
    .from("service_catalog")
    .update({ ...body.row, updated_at: new Date().toISOString() })
    .eq("workspace_id", body.workspace_id)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return json({ data });
});

// DELETE /v1/catalog/items/:id?workspace_id=
catalogRouter.delete("/v1/catalog/items/:id", async (c) => {
  const id = idParam.parse(c.req.param("id"));
  const workspaceId = workspaceIdFromQuery(c);
  const { supabase } = await requireWorkspaceAuth(c, workspaceId);
  const { data, error } = await supabase
    .from("service_catalog")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .select("id")
    .single();
  if (error) throw error;
  return json({ data });
});
