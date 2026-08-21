import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTeamRole } from "@/hooks/useTeamRole";
import { errorMessage } from "@/lib/error-message";

/**
 * Non-blocking replacement for the old full-screen "we couldn't reach your
 * workspace" card. Sign-in now always continues into the app; if the workspace
 * identity read failed on the way in, the user still sees their screen and gets
 * an inline retry here instead of a dead end.
 *
 * Only a real backend fault renders this. "Signed in but no role assigned" is a
 * different condition and is handled by the route role guards.
 */
export const WorkspaceIdentityBanner = () => {
  const { error, loading, retry } = useTeamRole();
  if (loading || !error) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        We couldn't confirm your workspace role.{" "}
        <span className="text-destructive/80">{errorMessage(error, "The backend did not respond.")}</span>
      </span>
      <Button size="sm" variant="outline" className="rounded-md" onClick={retry}>
        <RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
        Retry
      </Button>
    </div>
  );
};
