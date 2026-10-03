import "server-only";

export type ApiService = Record<string, unknown> & { id: string; workspaceId: string; name: string; code: string; description?: string | null; basePriceCents: number; laborMinutes: number; status: string; metadata?: Record<string, unknown> | null };

export function legacyService(row: ApiService) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    ...row,
    workspace_id: row.workspaceId,
    description: row.description ?? null,
    category: metadata.legacy_category ?? null,
    labor_price: row.basePriceCents / 100,
    estimated_minutes: row.laborMinutes,
    is_active: row.status === "active",
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    metadata,
  };
}

export function serviceCode(name: string, explicit?: unknown) {
  if (typeof explicit === "string" && /^[A-Z0-9][A-Z0-9_-]*$/i.test(explicit.trim())) return explicit.trim().toUpperCase();
  const base = name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "SERVICE";
  return `${base}_${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}
