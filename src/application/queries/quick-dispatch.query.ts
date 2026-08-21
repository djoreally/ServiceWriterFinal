/**
 * Quick Dispatch Query — Abstracts dispatch engine edge function + assign RPC
 */

import { supabase } from "@/integrations/supabase/client";
import { assignDispatchJob, type DispatchAssignmentInput } from "@/application/commands/dispatch.command";

export async function fetchDispatchCandidates(body: Record<string, unknown>): Promise<any> {
  return supabase.functions.invoke("dispatch-engine", {
    body: { ...body, estimated_duration_minutes: Number(body.estimated_duration_minutes ?? body.estimated_duration ?? 60) },
  });
}

export async function assignDispatchJobRpc(input: DispatchAssignmentInput) {
  try {
    await assignDispatchJob(input);
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error : new Error("Assignment failed") };
  }
}
