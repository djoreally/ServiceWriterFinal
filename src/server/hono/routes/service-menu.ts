/**
 * Service Menu domain router.
 *
 * The menu is a presentation layer over the shop's existing catalog:
 * core/side prices resolve from `service_catalog` and combo prices from
 * `service_packages` at read time — this router never stores a price for
 * a catalog service or a package, so editing the catalog updates the
 * menu everywhere automatically.
 *
 * Endpoints (registered relative to `/api`):
 * - GET    /v1/service-menu?workspace_id=            builder state + resolved menu + guardrail issues
 * - PUT    /v1/service-menu/settings                 upsert settings (enabled / headline / hero)
 * - POST   /v1/service-menu/items                    add a placement (role core|combo|side)
 * - PATCH  /v1/service-menu/items/:id                update a placement
 * - DELETE /v1/service-menu/items/:id?workspace_id=  remove a placement
 * - POST   /v1/service-menu/apply-template           apply a structure-only template (MOMS = template #1)
 * - GET    /v1/public/service-menu?slug=             public render data; { data: null } unless enabled
 *
 * Workspace endpoints require workspace membership (requireWorkspaceAuth,
 * same as the catalog router). The public endpoint resolves the workspace
 * by its public booking slug and returns only what the public booking
 * catalog already exposes (names + prices of active services/packages),
 * and only when the shop has switched its menu on.
 */
import { Hono } from "hono";
import { z } from "zod";
import { json } from "@/server/api";
import { requireWorkspaceAuth } from "@/server/hono/middleware/auth";
import { createSupabaseAdminClient } from "@/lib/supabase";
import {
  resolveMenu,
  validateMenuConfig,
  type CatalogPriceSource,
  type MenuItemConfig,
  type MenuPackageSource,
  type MenuSettingsConfig,
} from "@/lib/service-menu/menu";
import {
  getServiceMenuTemplate,
  mapTemplateToCatalog,
} from "@/lib/service-menu/templates";

export const serviceMenuRouter = new Hono();

const workspaceIdParam = z.string().uuid();
const idParam = z.string().uuid();

const settingsBodySchema = z.object({
  workspace_id: z.string().uuid(),
  enabled: z.boolean().optional(),
  headline: z.string().max(200).nullable().optional(),
  hero_package_id: z.string().uuid().nullable().optional(),
  hero_label: z.string().max(200).nullable().optional(),
});

const itemBodySchema = z.object({
  role: z.enum(["core", "combo", "side"]),
  service_catalog_id: z.string().uuid().nullable().optional(),
  package_id: z.string().uuid().nullable().optional(),
  is_most_popular: z.boolean().optional(),
  with_service_price: z.number().nonnegative().nullable().optional(),
  display_name: z.string().max(200).nullable().optional(),
  is_draft: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const postItemBodySchema = z.object({
  workspace_id: z.string().uuid(),
  item: itemBodySchema,
});

const patchItemBodySchema = z.object({
  workspace_id: z.string().uuid(),
  item: itemBodySchema.partial(),
});

const applyTemplateBodySchema = z.object({
  workspace_id: z.string().uuid(),
  template_id: z.string().min(1).max(100),
});

function workspaceIdFromQuery(c: { req: { url: string } }): string {
  return workspaceIdParam.parse(
    new URL(c.req.url).searchParams.get("workspace_id"),
  );
}

// The generated Supabase types predate the service_menus tables (added by
// this change's migration); until types are regenerated the menu router
// uses an untyped client, the same escape hatch billing.ts uses.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

interface SettingsRow {
  enabled?: boolean | null;
  headline?: string | null;
  hero_package_id?: string | null;
  hero_label?: string | null;
}

interface ItemRow {
  id: string;
  service_catalog_id?: string | null;
  package_id?: string | null;
  role: MenuItemConfig["role"];
  is_most_popular?: boolean | null;
  with_service_price?: number | string | null;
  display_name?: string | null;
  is_draft?: boolean | null;
  sort_order?: number | null;
}

interface PackageRow {
  id: string;
  name: string;
  description?: string | null;
  package_price?: number | string | null;
  is_active?: boolean | null;
}

interface PackageItemRow {
  package_id: string;
  service_catalog_id: string;
  quantity?: number | null;
  override_price?: number | string | null;
}

interface MenuData {
  settings: MenuSettingsConfig;
  settingsRow: SettingsRow | null;
  items: MenuItemConfig[];
  itemRows: ItemRow[];
  catalog: CatalogPriceSource[];
  packages: MenuPackageSource[];
}

function mapSettings(row: SettingsRow | null): MenuSettingsConfig {
  if (!row) return { enabled: false, headline: null, heroPackageId: null, heroLabel: null };
  return {
    enabled: row.enabled === true,
    headline: row.headline ?? null,
    heroPackageId: row.hero_package_id ?? null,
    heroLabel: row.hero_label ?? null,
  };
}

function mapItem(row: ItemRow): MenuItemConfig {
  return {
    id: row.id,
    serviceCatalogId: row.service_catalog_id ?? null,
    packageId: row.package_id ?? null,
    role: row.role,
    isMostPopular: row.is_most_popular === true,
    withServicePrice:
      row.with_service_price == null ? null : Number(row.with_service_price),
    displayName: row.display_name ?? null,
    isDraft: row.is_draft === true,
    sortOrder: Number(row.sort_order ?? 0),
  };
}

async function loadMenuData(supabase: Db, workspaceId: string): Promise<MenuData> {
  const { data: settingsRow, error: settingsError } = await supabase
    .from("service_menus")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (settingsError) throw settingsError;

  const { data: itemRows, error: itemsError } = await supabase
    .from("service_menu_items")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: true });
  if (itemsError) throw itemsError;

  const { data: catalogRows, error: catalogError } = await supabase
    .from("service_catalog")
    .select("id,name,description,labor_price,estimated_minutes,is_active")
    .eq("workspace_id", workspaceId);
  if (catalogError) throw catalogError;

  const { data: packageRows, error: packagesError } = await supabase
    .from("service_packages")
    .select("id,name,description,package_price,is_active")
    .eq("workspace_id", workspaceId);
  if (packagesError) throw packagesError;

  const packages: MenuPackageSource[] = [];
  const typedPackageRows = (packageRows ?? []) as PackageRow[];
  const packageIds = typedPackageRows.map((p) => p.id);
  if (packageIds.length > 0) {
    const { data: packageItemRows, error: packageItemsError } = await supabase
      .from("service_package_items")
      .select("package_id,service_catalog_id,quantity,override_price")
      .in("package_id", packageIds);
    if (packageItemsError) throw packageItemsError;
    const itemsByPackage = new Map<string, MenuPackageSource["items"]>();
    for (const row of (packageItemRows ?? []) as PackageItemRow[]) {
      const list = itemsByPackage.get(row.package_id) ?? [];
      list.push({
        serviceCatalogId: row.service_catalog_id,
        quantity: Number(row.quantity ?? 1),
        overridePrice:
          row.override_price == null ? null : Number(row.override_price),
      });
      itemsByPackage.set(row.package_id, list);
    }
    for (const row of typedPackageRows) {
      packages.push({
        id: row.id,
        name: row.name,
        description: row.description ?? null,
        packagePrice: Number(row.package_price ?? 0),
        isActive: row.is_active !== false,
        items: itemsByPackage.get(row.id) ?? [],
      });
    }
  }

  return {
    settings: mapSettings((settingsRow as SettingsRow | null) ?? null),
    settingsRow: (settingsRow as SettingsRow | null) ?? null,
    items: ((itemRows ?? []) as ItemRow[]).map(mapItem),
    itemRows: (itemRows ?? []) as ItemRow[],
    catalog: (catalogRows ?? []) as CatalogPriceSource[],
    packages,
  };
}

function builderPayload(data: MenuData) {
  const catalogById = new Map(data.catalog.map((row) => [row.id, row]));
  return {
    settings: data.settings,
    items: data.items,
    // Resolved even while disabled so the builder can preview; the
    // `enabled` flag in settings is what the public surface checks.
    menu: resolveMenu({
      settings: { ...data.settings, enabled: true },
      items: data.items,
      catalog: data.catalog,
      packages: data.packages,
    }),
    issues: validateMenuConfig({
      items: data.items,
      heroPackageIds: [data.settings.heroPackageId],
      packages: data.packages,
      catalogById,
    }),
  };
}

// GET /v1/service-menu?workspace_id= — builder state.
serviceMenuRouter.get("/v1/service-menu", async (c) => {
  const workspaceId = workspaceIdFromQuery(c);
  const { supabase } = await requireWorkspaceAuth(c, workspaceId);
  const data = await loadMenuData(supabase as unknown as Db, workspaceId);
  return json({ data: builderPayload(data) });
});

// PUT /v1/service-menu/settings — upsert the one settings row.
serviceMenuRouter.put("/v1/service-menu/settings", async (c) => {
  const body = settingsBodySchema.parse(await c.req.json());
  const { supabase } = await requireWorkspaceAuth(c, body.workspace_id);
  const db = supabase as unknown as Db;

  if (body.hero_package_id) {
    const { data: pkg, error } = await db
      .from("service_packages")
      .select("id")
      .eq("workspace_id", body.workspace_id)
      .eq("id", body.hero_package_id)
      .maybeSingle();
    if (error) throw error;
    if (!pkg) {
      return json(
        { error: { code: "invalid_hero", message: "The hero must be one of this workspace's packages." } },
        { status: 400 },
      );
    }
  }

  const { data, error } = await db
    .from("service_menus")
    .upsert(
      {
        workspace_id: body.workspace_id,
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        ...(body.headline !== undefined ? { headline: body.headline } : {}),
        ...(body.hero_package_id !== undefined
          ? { hero_package_id: body.hero_package_id }
          : {}),
        ...(body.hero_label !== undefined ? { hero_label: body.hero_label } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id" },
    )
    .select()
    .single();
  if (error) throw error;
  return json({ data: { settings: mapSettings(data as SettingsRow) } });
});

async function assertTargetsInWorkspace(
  db: Db,
  workspaceId: string,
  item: { service_catalog_id?: string | null; package_id?: string | null },
): Promise<string | null> {
  if (item.service_catalog_id) {
    const { data, error } = await db
      .from("service_catalog")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("id", item.service_catalog_id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return "The selected service is not in this workspace's catalog.";
  }
  if (item.package_id) {
    const { data, error } = await db
      .from("service_packages")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("id", item.package_id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return "The selected package is not in this workspace.";
  }
  return null;
}

async function clearMostPopular(db: Db, workspaceId: string, exceptId?: string) {
  let query = db
    .from("service_menu_items")
    .update({ is_most_popular: false })
    .eq("workspace_id", workspaceId)
    .eq("is_most_popular", true);
  if (exceptId) query = query.neq("id", exceptId);
  const { error } = await query;
  if (error) throw error;
}

// POST /v1/service-menu/items — add a placement.
serviceMenuRouter.post("/v1/service-menu/items", async (c) => {
  const body = postItemBodySchema.parse(await c.req.json());
  const { supabase } = await requireWorkspaceAuth(c, body.workspace_id);
  const db = supabase as unknown as Db;

  const targetError = await assertTargetsInWorkspace(db, body.workspace_id, body.item);
  if (targetError) {
    return json({ error: { code: "invalid_target", message: targetError } }, { status: 400 });
  }
  if (body.item.is_most_popular) await clearMostPopular(db, body.workspace_id);

  const { data, error } = await db
    .from("service_menu_items")
    .insert({ ...body.item, workspace_id: body.workspace_id })
    .select()
    .single();
  if (error) throw error;
  return json({ data: mapItem(data as ItemRow) }, { status: 201 });
});

// PATCH /v1/service-menu/items/:id — update a placement.
serviceMenuRouter.patch("/v1/service-menu/items/:id", async (c) => {
  const id = idParam.parse(c.req.param("id"));
  const body = patchItemBodySchema.parse(await c.req.json());
  const { supabase } = await requireWorkspaceAuth(c, body.workspace_id);
  const db = supabase as unknown as Db;

  const targetError = await assertTargetsInWorkspace(db, body.workspace_id, body.item);
  if (targetError) {
    return json({ error: { code: "invalid_target", message: targetError } }, { status: 400 });
  }
  if (body.item.is_most_popular) await clearMostPopular(db, body.workspace_id, id);

  const { data, error } = await db
    .from("service_menu_items")
    .update({ ...body.item, updated_at: new Date().toISOString() })
    .eq("workspace_id", body.workspace_id)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return json({ data: mapItem(data as ItemRow) });
});

// DELETE /v1/service-menu/items/:id?workspace_id=
serviceMenuRouter.delete("/v1/service-menu/items/:id", async (c) => {
  const id = idParam.parse(c.req.param("id"));
  const workspaceId = workspaceIdFromQuery(c);
  const { supabase } = await requireWorkspaceAuth(c, workspaceId);
  const { data, error } = await supabase
    .from("service_menu_items")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .select("id")
    .single();
  if (error) throw error;
  return json({ data });
});

// POST /v1/service-menu/apply-template — structure-only template apply.
// Matched entries point at the shop's own catalog/packages; unmatched
// entries land as drafts with no price anywhere.
serviceMenuRouter.post("/v1/service-menu/apply-template", async (c) => {
  const body = applyTemplateBodySchema.parse(await c.req.json());
  const template = getServiceMenuTemplate(body.template_id);
  if (!template) {
    return json(
      { error: { code: "unknown_template", message: "That menu template does not exist." } },
      { status: 400 },
    );
  }
  const { supabase } = await requireWorkspaceAuth(c, body.workspace_id);
  const db = supabase as unknown as Db;
  const data = await loadMenuData(db, body.workspace_id);

  const placements = mapTemplateToCatalog(template, data.catalog, data.packages);
  const existing = data.itemRows;
  const hasMostPopular = existing.some((row) => row.is_most_popular === true);

  const rows: Array<Record<string, unknown>> = [];
  const skipped: string[] = [];
  for (const placement of placements) {
    const duplicate = existing.some((row) => {
      if (
        placement.serviceCatalogId &&
        row.service_catalog_id === placement.serviceCatalogId &&
        row.role === placement.role
      ) return true;
      if (
        placement.packageId &&
        row.package_id === placement.packageId &&
        row.role === placement.role
      ) return true;
      if (
        placement.isDraft &&
        row.is_draft === true &&
        row.display_name === placement.displayName &&
        row.role === placement.role
      ) return true;
      return false;
    });
    if (duplicate) {
      skipped.push(placement.templateEntryName);
      continue;
    }
    rows.push({
      workspace_id: body.workspace_id,
      role: placement.role,
      service_catalog_id: placement.serviceCatalogId ?? null,
      package_id: placement.packageId ?? null,
      is_most_popular: Boolean(placement.isMostPopular) && !hasMostPopular,
      display_name: placement.displayName ?? null,
      is_draft: Boolean(placement.isDraft),
      sort_order: placement.sortOrder ?? 0,
      metadata: {
        template_id: template.id,
        template_entry: placement.templateEntryName,
        ...(placement.memberServiceCatalogIds?.length
          ? { member_service_catalog_ids: placement.memberServiceCatalogIds }
          : {}),
      },
    });
  }

  if (rows.length > 0) {
    const { error } = await db.from("service_menu_items").insert(rows);
    if (error) throw error;
  }
  return json({
    data: {
      template_id: template.id,
      created: rows.map((r) => r.display_name),
      skipped,
    },
  }, { status: 201 });
});

// GET /v1/public/service-menu?slug= — public render data.
// Returns { data: null } whenever the shop has no menu or hasn't enabled
// it, so the booking surface falls back to exactly its current behavior.
serviceMenuRouter.get("/v1/public/service-menu", async (c) => {
  const slug = new URL(c.req.url).searchParams.get("slug");
  if (!slug) {
    return json(
      { error: { code: "invalid_input", message: "A booking slug is required." } },
      { status: 400 },
    );
  }
  const db = createSupabaseAdminClient() as unknown as Db;
  const { data: workspace, error: workspaceError } = await db
    .from("workspaces")
    .select("id")
    .eq("booking_slug", slug)
    .maybeSingle();
  if (workspaceError) throw workspaceError;
  if (!workspace) {
    return json(
      { error: { code: "not_found", message: "No shop matches that booking link." } },
      { status: 404 },
    );
  }
  const data = await loadMenuData(db, (workspace as { id: string }).id);
  if (!data.settings.enabled) return json({ data: null });
  return json({
    data: resolveMenu({
      settings: data.settings,
      items: data.items,
      catalog: data.catalog,
      packages: data.packages,
      includeDrafts: false,
    }),
  });
});
