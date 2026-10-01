import { apiClient } from "@/lib/api-client";

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

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

  const form = new FormData();
  form.append("file", file);
  form.append("business_user_id", businessUserId);
  form.append("vehicle_id", vehicleId);
  const { data } = await apiClient.post<{ data: string }>(
    "/v1/platform/booking/assessment-photo",
    form,
  );
  return data;
}
