/**
 * Work Order Queries — Read-only data access for work orders and checklists.
 */

import { supabase } from "@/integrations/supabase/client";

/** Fetch all work orders for a business owner, with customer and technician names. */
export async function fetchWorkOrders(userId: string, filters?: {
  status?: string;
  technicianId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  let query = supabase
    .from("work_orders")
    .select(`
      *,
      customers(name, phone, email),
      vehicles(year, make, model, license_plate),
      technicians(name),
      vans(name)
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.technicianId) query = query.eq("technician_id", filters.technicianId);
  if (filters?.dateFrom) query = query.gte("created_at", filters.dateFrom);
  if (filters?.dateTo) query = query.lte("created_at", filters.dateTo);

  return query;
}

/** Fetch a single work order with full details and checklist. */
export async function fetchWorkOrderDetail(workOrderId: string) {
  const [woResult, checklistResult] = await Promise.all([
    supabase
      .from("work_orders")
      .select(`
        *,
        customers(id, name, phone, email, address),
        vehicles(id, year, make, model, vin, license_plate, color),
        technicians(id, name, email),
        vans(id, name),
        appointments(id, title, scheduled_date, scheduled_time)
      `)
      .eq("id", workOrderId)
      .single(),
    supabase
      .from("work_order_checklist_items")
      .select("*")
      .eq("work_order_id", workOrderId)
      .order("step_order", { ascending: true }),
  ]);

  return {
    workOrder: woResult.data,
    workOrderError: woResult.error,
    checklist: checklistResult.data ?? [],
    checklistError: checklistResult.error,
  };
}

/** Fetch work orders assigned to a technician (for field app). */
export async function fetchTechnicianWorkOrders(technicianId: string) {
  return supabase
    .from("work_orders")
    .select(`
      *,
      customers(name, phone, address),
      vehicles(year, make, model, color, license_plate),
      work_order_checklist_items(id, step_name, step_order, status, requires_photo, evidence_url, notes)
    `)
    .eq("technician_id", technicianId)
    .in("status", ["created", "in_progress"])
    .order("created_at", { ascending: true });
}

/** Subscribe to realtime work order changes. */
export function subscribeWorkOrders(userId: string, callback: () => void) {
  const channel = supabase
    .channel("work-orders-realtime")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "work_orders",
        filter: `user_id=eq.${userId}`,
      },
      () => callback()
    )
    .subscribe();

  return { channel, unsubscribe: () => supabase.removeChannel(channel) };
}
