/**
 * Repair Pricing — reads and writes for market-benchmark pricing and
 * estimate-only quote requests.
 */
import { supabase } from "@/integrations/supabase/client";
import type { PricingTier } from "@/domain/pricing/repair-estimate";

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
  const { data, error } = await (supabase.from("service_catalog_benchmarks") as any)
    .select("*")
    .order("captured_at", { ascending: false });

  if (error) {
    console.warn("[fetchCatalogBenchmarks]", error.message);
    return {};
  }

  const byItem: Record<string, CatalogBenchmark> = {};
  for (const row of (data ?? []) as CatalogBenchmark[]) {
    if (!byItem[row.service_catalog_id]) byItem[row.service_catalog_id] = row;
  }
  return byItem;
}

export interface SaveBenchmarkInput {
  userId: string;
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
  return (supabase.from("service_catalog_benchmarks") as any).upsert(
    {
      user_id: input.userId,
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
      captured_at: new Date().toISOString(),
    },
    { onConflict: "service_catalog_id,vin" },
  );
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
  const { data, error } = await (supabase.from("quote_requests") as any)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.warn("[fetchQuoteRequests]", error.message);
    return [];
  }
  return (data ?? []) as QuoteRequest[];
}

export async function updateQuoteRequestStatus(
  id: string,
  status: QuoteRequest["status"],
  convertedQuoteId?: string,
) {
  return (supabase.from("quote_requests") as any)
    .update({ status, ...(convertedQuoteId ? { converted_quote_id: convertedQuoteId } : {}) })
    .eq("id", id);
}

/** Public/anonymous submission — always goes through the edge function. */
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
  return supabase.functions.invoke("public-quote-request", { body });
}
