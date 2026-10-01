/**
 * Onboarding Wizard Commands — All write operations for the onboarding flow.
 * Extracted from onboarding-wizard.query.ts to enforce command/query separation.
 */
import { apiClient } from "@/lib/api-client";

/** Upsert onboarding profile data. */
export async function saveOnboardingProgress(profileData: Record<string, unknown>): Promise<void> {
  await apiClient.post("/v1/platform/onboarding/profile", profileData);
}

interface OnboardingServiceInput {
  name: string;
  description: string;
  price: number | null;
  duration_minutes: number;
}

async function saveOnboardingServices(services: OnboardingServiceInput[]): Promise<number> {
  if (services.length === 0) return 0;
  const { count } = await apiClient.post<{ count: number }>(
    "/v1/platform/onboarding/services",
    { services },
  );
  return count;
}

/** Add first service during onboarding. */
export async function addOnboardingService(userId: string, service: {
  name: string;
  description: string;
  price: number;
  duration: number;
}): Promise<void> {
  await saveOnboardingServices([{
    name: service.name,
    description: service.description,
    price: service.price,
    duration_minutes: service.duration,
  }]);
}

/**
 * Bulk-add services accepted from a website import.
 * Services with no detected price are stored unpriced (null) so they surface
 * as "Get a quote" instead of a misleading $0.
 */
export async function addOnboardingServices(
  userId: string,
  services: Array<{ name: string; description: string; price: number | null; duration_minutes: number }>,
): Promise<number> {
  return saveOnboardingServices(services);
}
