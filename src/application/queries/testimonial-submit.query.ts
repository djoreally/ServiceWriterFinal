/**
 * Testimonial Submit Queries — Read operations for public-facing testimonial submission.
 */
import { supabase } from "@/integrations/supabase/client";

export interface TestimonialBusinessProfile {
  user_id: string;
  business_name: string;
  logo_url: string | null;
}

export async function fetchTestimonialBusinessProfile(
  slug: string
): Promise<TestimonialBusinessProfile | null> {
  const { data, error } = await supabase.rpc("get_public_booking_profile_v2", {
    booking_slug_param: slug,
  });

  if (error || !data || data.length === 0) return null;

  const profile = data[0];
  return {
    user_id: profile.user_id,
    business_name: profile.business_name || "Auto Shop",
    logo_url: profile.logo_url,
  };
}
