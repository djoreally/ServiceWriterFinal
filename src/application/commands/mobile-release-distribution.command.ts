import { supabase } from "@/integrations/supabase/client";

export type MobileReleasePlatform = "android" | "ios";
export type MobileReleaseStatus = "draft" | "published" | "revoked" | "expired";

export interface MobileRelease {
  id: string;
  platform: MobileReleasePlatform;
  channel: "internal" | "preview";
  version: string;
  build_number: number;
  artifact_url: string;
  artifact_sha256: string | null;
  expires_at: string | null;
  status: MobileReleaseStatus;
  release_notes: string | null;
  created_at: string;
}

async function invokeDistribution<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("mobile-release-distribution", { body });
  if (error) throw new Error(error.message || "Mobile release service unavailable");
  if (!data) throw new Error("Mobile release service returned no result");
  if (typeof data === "object" && "error" in data && typeof data.error === "string") throw new Error(data.error);
  return data as T;
}

export async function listMobileReleases(view: "available" | "all" = "available") {
  return invokeDistribution<{ releases: MobileRelease[] }>({ action: "list_releases", view });
}

export async function recordMobileReleaseInstall(releaseId: string) {
  return invokeDistribution<{ recorded: true }>({ action: "record_install", releaseId });
}

export async function publishMobileRelease(input: {
  platform: MobileReleasePlatform;
  channel: "internal" | "preview";
  version: string;
  buildNumber: number;
  artifactUrl: string;
  artifactSha256?: string;
  expiresAt?: string;
  releaseNotes?: string;
}) {
  return invokeDistribution<{ release: Pick<MobileRelease, "id" | "platform" | "version" | "build_number" | "status"> }>({
    action: "publish_release",
    ...input,
  });
}

export async function revokeMobileRelease(releaseId: string) {
  return invokeDistribution<{ release: Pick<MobileRelease, "id" | "status"> }>({ action: "revoke_release", releaseId });
}
