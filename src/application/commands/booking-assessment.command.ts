import { supabase } from "@/integrations/supabase/client";

const BUCKET = "booking-assessment-photos";
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

/**
 * Upload a booking assessment photo and return a readable URL.
 * The bucket is private, so a long-lived signed URL is returned.
 */
export async function uploadBookingAssessmentPhoto(
  businessUserId: string,
  vehicleId: string,
  file: File,
): Promise<string> {
  if (!ALLOWED.includes(file.type)) throw new Error("Use a JPG, PNG, or WebP image");
  if (file.size > MAX_BYTES) throw new Error("Photo must be 5 MB or smaller");

  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${businessUserId}/${vehicleId}/${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;

  const { data, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signError || !data?.signedUrl) throw signError ?? new Error("Could not read uploaded photo");
  return data.signedUrl;
}
