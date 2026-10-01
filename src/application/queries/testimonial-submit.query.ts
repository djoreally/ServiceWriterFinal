/**
 * Testimonial Submit Queries — Read operations for public-facing testimonial submission.
 */
import { apiClient } from "@/lib/api-client";

export interface TestimonialBusinessProfile {
  user_id: string;
  business_name: string;
  logo_url: string | null;
}

export async function fetchTestimonialBusinessProfile(
  slug: string
): Promise<TestimonialBusinessProfile | null> {
  const { data } = await apiClient.get<{ data: TestimonialBusinessProfile | null }>("/v1/crm/testimonials/profile", {
    query: { slug },
  });
  return data;
}
