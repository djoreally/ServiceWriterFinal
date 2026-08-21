/**
 * Onboarding website import — read/invoke access for the Firecrawl-powered
 * "import from your website" step.
 */
import { supabase } from "@/integrations/supabase/client";
import type { SiteImportResult } from "@/domain/onboarding/site-import-merge";
import { FunctionsHttpError } from "@supabase/supabase-js";

export interface SiteImportResponse {
  result: SiteImportResult;
  warnings: string[];
}

export async function importSiteForOnboarding(url: string): Promise<SiteImportResponse> {
  const { data, error } = await supabase.functions.invoke("onboarding-site-import", {
    body: { url },
  });

  if (error) {
    let message = "We couldn't import that website.";
    if (error instanceof FunctionsHttpError) {
      try {
        const body = await error.context.json();
        if (body?.error) message = String(body.error);
      } catch {
        /* keep default message */
      }
    }
    throw new Error(message);
  }

  if (!data?.result) throw new Error("We couldn't read anything useful from that website.");
  return { result: data.result as SiteImportResult, warnings: data.warnings ?? [] };
}

export async function loadLastSiteImport(userId: string): Promise<SiteImportResponse | null> {
  const { data } = await supabase
    .from("onboarding_site_imports")
    .select("payload, warnings, status")
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.payload) return null;
  return {
    result: data.payload as unknown as SiteImportResult,
    warnings: (data.warnings as unknown as string[]) ?? [],
  };
}
