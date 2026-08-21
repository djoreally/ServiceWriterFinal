/**
 * AccessDenied — terminal render state for an unauthorized route.
 *
 * Deliberately does NOT navigate: redirect logic lives only in `RequireAuth`
 * and `useStartupNavigation`. Rendering a clear pane avoids the redirect
 * ping-pong that previously bounced staff between routes.
 */
import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTeamRole } from "@/hooks/useTeamRole";

const LANDING: Record<string, string> = {
  admin: "/dashboard",
  manager: "/dashboard",
  dispatcher: "/dispatch",
  technician: "/tech-app",
};

export const AccessDenied = () => {
  const { role } = useTeamRole();
  const home = LANDING[role ?? ""] ?? "/dashboard";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-muted">
          <ShieldAlert className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-semibold text-foreground">You don't have access to this page</h1>
        <p className="text-sm text-muted-foreground">
          Your role{role ? ` (${role})` : ""} doesn't include this area. Ask the shop owner if you
          need it added.
        </p>
        <Button asChild>
          <Link to={home}>Back to my workspace</Link>
        </Button>
      </div>
    </div>
  );
};

export default AccessDenied;
