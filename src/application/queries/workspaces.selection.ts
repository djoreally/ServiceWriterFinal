import { z } from "zod";
import type { WorkspaceMembership } from "@/lib/nextApiClient";

const selectedWorkspaceIdSchema = z.string().uuid();
const SELECTED_WORKSPACE_KEY = "servicewriter.selected_workspace_id";

export function getSelectedWorkspaceId(storage: Storage | undefined = typeof window === "undefined" ? undefined : window.localStorage): string | null {
  if (!storage) return null;
  const value = storage.getItem(SELECTED_WORKSPACE_KEY);
  return value && selectedWorkspaceIdSchema.safeParse(value).success ? value : null;
}

export function setSelectedWorkspaceId(workspaceId: string, storage: Storage | undefined = typeof window === "undefined" ? undefined : window.localStorage): void {
  if (!selectedWorkspaceIdSchema.safeParse(workspaceId).success) {
    throw new Error("Invalid workspace id");
  }
  storage?.setItem(SELECTED_WORKSPACE_KEY, workspaceId);
}

export function clearSelectedWorkspaceId(storage: Storage | undefined = typeof window === "undefined" ? undefined : window.localStorage): void {
  storage?.removeItem(SELECTED_WORKSPACE_KEY);
}

export function resolveSelectedWorkspace(memberships: WorkspaceMembership[], selectedWorkspaceId = getSelectedWorkspaceId()): WorkspaceMembership | null {
  const active = memberships.filter((membership) => membership.is_active && membership.workspaces?.is_active);
  if (selectedWorkspaceId) {
    const selected = active.find((membership) => membership.workspace_id === selectedWorkspaceId);
    if (selected) return selected;
  }
  return active[0] ?? null;
}
