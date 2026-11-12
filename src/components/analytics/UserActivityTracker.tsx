import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@packages/auth";
import { useWorkspaceSelection } from "@/hooks/useWorkspaceSelection";
import {
  identifyTelemetry,
  initTelemetry,
  resetTelemetry,
  trackTelemetryPageview,
} from "@/lib/telemetry/client";

/**
 * Built-in telemetry — signed-in stream shell wiring.
 *
 * Mounted beside PostHogIdentity in both shells (SPA + migrated App
 * Router layout). Renders nothing and adds no visible UI for anyone:
 * - installs the capture listeners once (`initTelemetry`),
 * - binds identity as soon as the Supabase session resolves, refreshed
 *   when the selected workspace / role land (`identifyTelemetry`),
 * - emits a pageview on every SPA route change,
 * - resets (and rotates the client session) on sign-out.
 *
 * While signed out, the capture core sends nothing at all.
 */
export function UserActivityTracker(): null {
  const { session, user, loading: authLoading } = useAuth();
  const { selectedWorkspace, loading: workspaceLoading } = useWorkspaceSelection();
  const location = useLocation();

  useEffect(() => {
    initTelemetry();
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!session?.user || !user) {
      resetTelemetry();
      return;
    }
    if (workspaceLoading) return;
    identifyTelemetry({
      userId: user.id,
      email: user.email ?? null,
      workspaceId: selectedWorkspace?.workspace_id ?? null,
      role: selectedWorkspace?.role ?? null,
    });
  }, [authLoading, session?.user, user, workspaceLoading, selectedWorkspace]);

  useEffect(() => {
    if (!session?.user) return;
    trackTelemetryPageview();
  }, [location.pathname, location.search, session?.user]);

  return null;
}
