import { ContactRound, LayoutDashboard } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { canAccessRoute } from "@/domain/auth/access-policy";
import { useTeamRole } from "@/hooks/useTeamRole";

export function DashboardModeToggle({ onNavigate }: { onNavigate?: () => void } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { role } = useTeamRole();
  const canUseCrm = canAccessRoute(role, "/crm");
  const isCrm = location.pathname === "/crm" || location.pathname.startsWith("/crm/");

  if (!canUseCrm) return null;

  const go = (path: "/dashboard" | "/crm") => {
    navigate(path);
    onNavigate?.();
  };

  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1" aria-label="Dashboard workspace">
      <button type="button" onClick={() => go("/dashboard")} aria-current={!isCrm ? "page" : undefined} className={cn("flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors", !isCrm ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
        <LayoutDashboard className="h-3.5 w-3.5" />
        Operations
      </button>
      <button type="button" onClick={() => go("/crm")} aria-current={isCrm ? "page" : undefined} className={cn("flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors", isCrm ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
        <ContactRound className="h-3.5 w-3.5" />
        CRM
      </button>
    </div>
  );
}
