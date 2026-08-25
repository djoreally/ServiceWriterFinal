import { assignDispatchJob, type DispatchAssignmentInput } from "@/application/commands/dispatch.command";

/** Quick Dispatch now uses the canonical Service Writer assignment transaction. */
export async function assignDispatchJobRpc(input: DispatchAssignmentInput) {
  try {
    await assignDispatchJob(input);
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error : new Error("Assignment failed") };
  }
}
