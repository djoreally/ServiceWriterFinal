/**
 * Testimonial Submit Commands — Write operations for public testimonial submission.
 */
import { supabase } from "@/integrations/supabase/client";

export async function submitTestimonial(payload: {
  user_id: string;
  customer_name: string;
  customer_email: string | null;
  content: string;
  rating: number;
}): Promise<void> {
  const { error } = await supabase.from("testimonials").insert({
    ...payload,
    status: "pending",
  });
  if (error) throw error;
}
