/**
 * Onboarding website import — read/invoke access for the Firecrawl-powered
 * "import from your website" step.
 */
import { apiClient, ApiClientError } from "@/lib/api-client";
import type { SiteImportResult } from "@/domain/onboarding/site-import-merge";

export interface SiteImportResponse {
  result: SiteImportResult;
  warnings: string[];
}

export async function importSiteForOnboarding(url: string): Promise<SiteImportResponse> {
  try {
    const data = await apiClient.post<SiteImportResponse>(
      "/v1/platform/onboarding/site-import",
      { url },
    );
    if (!data?.result) throw new Error("We couldn't read anything useful from that website.");
    return { result: data.result as SiteImportResult, warnings: data.warnings ?? [] };
  } catch (error) {
    if (error instanceof ApiClientError) throw new Error(error.message);
    throw error;
  }
}

export async function loadLastSiteImport(userId: string): Promise<SiteImportResponse | null> {
  const data = await apiClient.get<SiteImportResponse | null>(
    "/v1/platform/onboarding/site-import/latest",
  );
  if (!data?.result) return null;
  return {
    result: data.result as SiteImportResult,
    warnings: data.warnings ?? [],
  };
}
