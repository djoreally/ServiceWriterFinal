/**
 * Testimonial Submit Commands — Write operations for public testimonial submission.
 */
import { apiClient } from "@/lib/api-client";

export async function submitTestimonial(payload: {
  user_id: string;
  customer_name: string;
  customer_email: string | null;
  content: string;
  rating: number;
}): Promise<void> {
  await apiClient.post("/v1/crm/testimonials/submit", payload);
}
