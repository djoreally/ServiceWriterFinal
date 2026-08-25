/** Booking Link Query — canonical workspace slug availability. */
import { checkSlugAvailability } from "@/application/queries/settings.query";

export async function checkBookingSlugAvailability(
  slug: string,
): Promise<{ available: boolean | null; error: unknown }> {
  try {
    const available = await checkSlugAvailability(slug);
    return { available, error: null };
  } catch (error) {
    return { available: null, error };
  }
}
