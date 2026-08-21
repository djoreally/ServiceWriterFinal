import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@packages/auth";
import {
  clearSelectedWorkspaceId,
  getSelectedWorkspaceId,
  listWorkspaceMemberships,
  resolveSelectedWorkspace,
  setSelectedWorkspaceId,
} from "@/application/queries/workspaces.query";
import type { WorkspaceMembership } from "@/lib/nextApiClient";

export function useWorkspaceSelection() {
  const { session, loading: authLoading } = useAuth();
  const [memberships, setMemberships] = useState<WorkspaceMembership[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (authLoading) return;
    if (!session) {
      setMemberships([]);
      setSelectedWorkspaceIdState(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const nextMemberships = await listWorkspaceMemberships();
      const nextSelection = resolveSelectedWorkspace(nextMemberships, getSelectedWorkspaceId());
      setMemberships(nextMemberships);
      setSelectedWorkspaceIdState(nextSelection?.workspace_id ?? null);
      if (nextSelection) setSelectedWorkspaceId(nextSelection.workspace_id);
      else clearSelectedWorkspaceId();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load workspaces");
    } finally {
      setLoading(false);
    }
  }, [authLoading, session]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectWorkspace = useCallback((workspaceId: string) => {
    const selection = resolveSelectedWorkspace(memberships, workspaceId);
    if (!selection) throw new Error("You do not have access to that workspace");
    setSelectedWorkspaceId(selection.workspace_id);
    setSelectedWorkspaceIdState(selection.workspace_id);
  }, [memberships]);

  const selectedWorkspace = useMemo(
    () => resolveSelectedWorkspace(memberships, selectedWorkspaceId),
    [memberships, selectedWorkspaceId],
  );

  return {
    memberships,
    selectedWorkspace,
    selectedWorkspaceId,
    selectWorkspace,
    reload: load,
    loading: authLoading || loading,
    error,
  };
}
