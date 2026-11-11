/**
 * Repair Pricing — reads and writes for market-benchmark pricing and
 * estimate-only quote requests.
 */
import { apiClient } from "@/lib/api-client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import type { PricingTier } from "@/domain/pricing/repair-estimate";

/**
 * Step 8: the shop pair (service_catalog_benchmarks / quote_requests) is
 * workspace-keyed. The workspace is resolved inside this module — the
 * recurring-services precedent — so page/component callers do not change.
 */
async function requireWorkspaceId(): Promise<string> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("No active workspace is available.");
  return context.workspaceId;
}

export interface CatalogBenchmark {
  id: string;
  service_catalog_id: string;
  vin: string | null;
  vehicle_label: string | null;
  repair_title: string;
  independent_low: number;
  independent_avg: number;
  independent_high: number;
  dealer_low: number;
  dealer_avg: number;
  dealer_high: number;
  shop_price: number | null;
  captured_at: string;
}

/** All benchmarks for the current shop, keyed by catalog item id (latest first). */
export async function fetchCatalogBenchmarks(): Promise<Record<string, CatalogBenchmark>> {
  try {
    const workspaceId = await requireWorkspaceId();
    const response = await apiClient.get<{ data: CatalogBenchmark[] }>("/v1/repair-pricing/catalog-benchmarks", {
      query: { workspace_id: workspaceId },
    });
    const byItem: Record<string, CatalogBenchmark> = {};
    for (const row of response.data ?? []) {
      if (!byItem[row.service_catalog_id]) byItem[row.service_catalog_id] = row;
    }
    return byItem;
  } catch (error) {
    console.warn("[fetchCatalogBenchmarks]", error instanceof Error ? error.message : error);
    return {};
  }
}

export interface SaveBenchmarkInput {
  serviceCatalogId: string;
  vin: string | null;
  vehicleLabel: string | null;
  repairTitle: string;
  independent: { low: number; avg: number; high: number };
  dealer: { low: number; avg: number; high: number };
  shopPrice: number | null;
}

/** Upsert the latest benchmark for a catalog item + vehicle. */
export async function saveCatalogBenchmark(input: SaveBenchmarkInput) {
  const workspaceId = await requireWorkspaceId();
  const response = await apiClient.post<{ data: CatalogBenchmark }>("/v1/repair-pricing/catalog-benchmarks", {
    workspace_id: workspaceId,
    service_catalog_id: input.serviceCatalogId,
    vin: input.vin,
    vehicle_label: input.vehicleLabel,
    repair_title: input.repairTitle,
    independent_low: input.independent.low,
    independent_avg: input.independent.avg,
    independent_high: input.independent.high,
    dealer_low: input.dealer.low,
    dealer_avg: input.dealer.avg,
    dealer_high: input.dealer.high,
    shop_price: input.shopPrice,
  });
  return { data: response.data, error: null };
}

export interface QuoteRequest {
  id: string;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vin: string | null;
  repair_title: string | null;
  notes: string | null;
  pricing_tier: PricingTier;
  estimate_low: number | null;
  estimate_avg: number | null;
  estimate_high: number | null;
  shop_price: number | null;
  source: string;
  status: "new" | "contacted" | "quoted" | "won" | "lost";
  converted_quote_id: string | null;
  created_at: string;
}

/** Estimate-only requests for the current shop. */
export async function fetchQuoteRequests(): Promise<QuoteRequest[]> {
  try {
    const workspaceId = await requireWorkspaceId();
    const response = await apiClient.get<{ data: QuoteRequest[] }>("/v1/repair-pricing/shop-quote-requests", {
      query: { workspace_id: workspaceId },
    });
    return response.data ?? [];
  } catch (error) {
    console.warn("[fetchQuoteRequests]", error instanceof Error ? error.message : error);
    return [];
  }
}

export async function updateQuoteRequestStatus(
  id: string,
  status: QuoteRequest["status"],
  convertedQuoteId?: string,
) {
  const workspaceId = await requireWorkspaceId();
  const response = await apiClient.patch<{ data: QuoteRequest }>(
    `/v1/repair-pricing/shop-quote-requests/${id}`,
    { workspace_id: workspaceId, status, ...(convertedQuoteId ? { converted_quote_id: convertedQuoteId } : {}) },
  );
  return { data: response.data, error: null };
}

/** Public/anonymous submission — proxied to the edge function via Hono. */
export async function submitPublicQuoteRequest(body: {
  businessUserId: string;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  vin?: string;
  vehicleYear?: number;
  vehicleMake?: string;
  vehicleModel?: string;
  repairTitle?: string;
  notes?: string;
  tier?: PricingTier;
  source?: string;
}) {
  const response = await apiClient.post<{
    data: {
      success?: boolean;
      error?: string;
      repairTitle?: string;
      estimate?: { low: number; avg: number; high: number } | null;
      shopPrice?: number | null;
    } | null;
  }>("/v1/repair-pricing/public-quote-requests", body);
  return { data: response.data, error: null };
}
