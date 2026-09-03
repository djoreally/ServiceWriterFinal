/**
 * Email Testing Commands — send authenticated transactional test emails.
 */
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export async function invokeSendTestEmail(body: Record<string, unknown>) {
  try {
    const workspace = await resolveCurrentWorkspace();
    if (!workspace) return { data: null, error: new Error("No active workspace") };

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session?.access_token) {
      return { data: null, error: sessionError ?? new Error("Authentication required") };
    }

    const response = await fetch("/api/v1/email-testing/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionData.session.access_token}`,
      },
      body: JSON.stringify({ workspace_id: workspace.workspaceId, ...body }),
    });
    const data = await response.json();
    if (!response.ok) {
      return { data: null, error: new Error(data?.error?.message ?? data?.error ?? "Test email failed") };
    }
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Test email failed") };
  }
}
