/**
 * Service Images Command - Upload and delete service images.
 */

import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface ServiceImage {
  id: string;
  image_url: string;
  caption: string | null;
  image_type: string;
  sort_order: number;
  created_at: string;
}

export async function fetchServiceImages(serviceId: string): Promise<{ images: ServiceImage[]; userId: string | null }> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return { images: [], userId: null };

  const { data, error } = await supabase
    .from("service_images")
    .select("*")
    .eq("service_id", serviceId)
    .order("sort_order");

  return { images: (!error && data ? data : []) as ServiceImage[], userId: user.id };
}

export async function uploadServiceImage(params: {
  userId: string;
  serviceId: string;
  file: File;
  caption: string | null;
  imageType: string;
  sortOrder: number;
}): Promise<void> {
  const fileExt = params.file.name.split(".").pop();
  const fileName = `${params.userId}/${params.serviceId}/${Date.now()}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from("service-images")
    .upload(fileName, params.file);
  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage
    .from("service-images")
    .getPublicUrl(fileName);

  const { error: dbError } = await supabase.from("service_images").insert({
    user_id: params.userId,
    service_id: params.serviceId,
    image_url: publicUrl,
    caption: params.caption,
    image_type: params.imageType,
    sort_order: params.sortOrder,
  });
  if (dbError) throw dbError;
}

export async function deleteServiceImage(imageId: string, imageUrl: string): Promise<void> {
  // Remove from storage
  const urlParts = imageUrl.split("/service-images/");
  if (urlParts[1]) {
    await supabase.storage.from("service-images").remove([urlParts[1]]);
  }

  const { error } = await supabase.from("service_images").delete().eq("id", imageId);
  if (error) throw error;
}
