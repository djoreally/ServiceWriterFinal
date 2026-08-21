import { supabase } from "@/integrations/supabase/client";

export async function searchCommandPalette(userId: string, query: string) {
  const q = query.trim();
  if (!userId || q.length < 2) {
    return { customers: [], appointments: [] };
  }

  const [customersRes, appointmentsRes] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, email, phone")
      .eq("user_id", userId)
      .or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(8),
    supabase
      .from("appointments")
      .select("id, title, scheduled_date, scheduled_time, status")
      .eq("user_id", userId)
      .or(`title.ilike.%${q}%,status.ilike.%${q}%`)
      .order("scheduled_date", { ascending: false })
      .limit(8),
  ]);

  return {
    customers: customersRes.data ?? [],
    appointments: appointmentsRes.data ?? [],
  };
}

