/**
 * Service Images Command - Upload and delete service images.
 */

import { apiClient } from "@/lib/api-client";

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

  const res = await apiClient.get<{ images: ServiceImage[]; userId: string | null }>(
    "/v1/platform/service-images",
    { query: { service_id: serviceId } },
  );
  return { images: res.images ?? [], userId: res.userId ?? user.id };
}

export async function uploadServiceImage(params: {
  userId: string;
  serviceId: string;
  file: File;
  caption: string | null;
  imageType: string;
  sortOrder: number;
}): Promise<void> {
  const form = new FormData();
  form.append("file", params.file);
  form.append("service_id", params.serviceId);
  form.append("caption", params.caption ?? "");
  form.append("image_type", params.imageType);
  form.append("sort_order", String(params.sortOrder));
  await apiClient.post("/v1/platform/service-images", form);
}

export async function deleteServiceImage(imageId: string, imageUrl: string): Promise<void> {
  await apiClient.delete(`/v1/platform/service-images/${encodeURIComponent(imageId)}`, {
    query: { image_url: imageUrl },
  });
}
