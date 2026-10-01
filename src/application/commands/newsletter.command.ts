/** Newsletter Commands — workspace-scoped writes. */
import { apiClient } from "@/lib/api-client";
import type { NewsletterTemplateRow } from "@/application/queries/newsletter.query";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

async function requireContext() {
  const workspace = await resolveCurrentWorkspace();
  if (!workspace) throw new Error("No active workspace is available.");
  // UI hint only — the server validates it against the caller's memberships
  // and resolves the workspace from the auth token.
  return { selectedWorkspaceId: workspace.workspaceId };
}

export async function createNewsletterSequence(
  _userId: string,
  name: string,
  description: string,
  defaultTemplates: Array<Omit<NewsletterTemplateRow, "id">>,
): Promise<string> {
  const { selectedWorkspaceId } = await requireContext();
  const { data } = await apiClient.post<{ data: { id: string } }>("/v1/newsletter/sequences", {
    selected_workspace_id: selectedWorkspaceId,
    name,
    description,
    defaultTemplates: defaultTemplates.map((template) => ({
      month_number: template.month_number,
      subject: template.subject,
      preview_text: template.preview_text,
      content: template.content,
      holiday_theme: template.holiday_theme,
      seasonal_theme: template.seasonal_theme,
      is_active: template.is_active,
    })),
  });
  return data.id;
}

export async function toggleNewsletterTemplateActive(templateId: string, isActive: boolean): Promise<void> {
  const { selectedWorkspaceId } = await requireContext();
  await apiClient.patch(`/v1/newsletter/templates/${templateId}`, {
    selected_workspace_id: selectedWorkspaceId,
    is_active: isActive,
  });
}

export async function saveNewsletterTemplate(templateId: string, updates: {
  subject: string; preview_text: string; content: string; holiday_theme: string; seasonal_theme: string;
}): Promise<void> {
  const { selectedWorkspaceId } = await requireContext();
  await apiClient.put(`/v1/newsletter/templates/${templateId}`, {
    selected_workspace_id: selectedWorkspaceId,
    ...updates,
  });
}
