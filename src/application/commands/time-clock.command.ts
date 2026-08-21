/**
 * Time Clock Commands — Write operations for clock in/out and breaks.
 */
import { supabase } from "@/integrations/supabase/client";

export async function clockIn(location: unknown): Promise<string> {
  const { data, error } = await supabase.rpc("clock_in", { p_location: location as any });
  if (error) throw error;
  return data as string;
}

export async function clockOut(location: unknown): Promise<void> {
  const { error } = await supabase.rpc("clock_out", { p_location: location as any });
  if (error) throw error;
}

export async function startBreak(): Promise<void> {
  const { error } = await supabase.rpc("start_break");
  if (error) throw error;
}

export async function endBreak(): Promise<void> {
  const { error } = await supabase.rpc("end_break");
  if (error) throw error;
}
