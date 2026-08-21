/**
 * Customer Segmentation Commands — Write operations for segments.
 */
import { supabase } from "@/integrations/supabase/client";
import type { SegmentRow } from "@/application/queries/customer-segmentation.query";

export async function saveSegment(userId: string, segment: Partial<SegmentRow>, isEdit: boolean) {
  const payload = { ...segment, user_id: userId };
  if (isEdit && segment.id) {
    const { error } = await supabase.from("customer_segments").update(payload).eq("id", segment.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("customer_segments").insert([payload] as any);
    if (error) throw error;
  }
}

export async function deleteSegment(segmentId: string) {
  const { error } = await supabase.from("customer_segments").delete().eq("id", segmentId);
  if (error) throw error;
}

export async function recalculateAllCustomers(): Promise<number> {
  const { data, error } = await supabase.functions.invoke("recalculate-segments", { body: { mode: "all" } });
  if (error) throw error;
  return Number(data?.recalculated ?? 0);
}
