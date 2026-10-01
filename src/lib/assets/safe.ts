/**
 * Safe wrappers for Assets operations. These NEVER throw — they return
 * structured fallbacks so the Assets tab can degrade gracefully without
 * propagating failures into React Query / Suspense / the app shell.
 */

import { apiClient } from "@/lib/api-client";
import {
  listAssets,
  getAssetSignedUrl,
  type ListAssetsParams,
  type ListAssetsResult,
} from "@/application/queries/assets.query";
import { logAssetEvent } from "./logger";

export interface SafeListAssetsResult extends ListAssetsResult {
  degraded: boolean;
  reason?: string;
}

export async function safeListAssets(
  params: ListAssetsParams = {},
): Promise<SafeListAssetsResult> {
  try {
    const res = await listAssets(params);
    return { ...res, degraded: false };
  } catch (e) {
    const reason = (e as Error)?.message || "unknown";
    logAssetEvent("list_failed", { reason });
    return { items: [], total: 0, degraded: true, reason };
  }
}

export async function safeGetSignedUrl(
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  try {
    return await getAssetSignedUrl(storagePath, expiresInSeconds);
  } catch (e) {
    logAssetEvent("sign_url_failed", {
      reason: (e as Error)?.message || "unknown",
    });
    return null;
  }
}

export type InfraStatus = "ok" | "unavailable" | "unknown";

/**
 * Probes the assets API with a 3s timeout. Used as a one-time
 * health check inside the Assets tab. NEVER throws; never blocks boot.
 */
export async function verifyAssetsInfrastructure(): Promise<InfraStatus> {
  try {
    const probe = apiClient.get("/v1/assets", { query: { limit: 1 } });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("infra_probe_timeout")), 3000),
    );
    await Promise.race([probe, timeout]);
    return "ok";
  } catch (e) {
    logAssetEvent("infra_probe_failed", {
      reason: (e as Error)?.message || "unknown",
    });
    return "unavailable";
  }
}
