import { useLocation, useNavigate } from "react-router-dom";
import { signOut } from "@/application/commands/signout.command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Building2, Search, LogOut, Menu, Shield, Settings, ChevronsUpDown } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { useAuth, useRBAC } from "@packages/auth";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/notifications";
import { useWorkspaceSelection } from "@/hooks/useWorkspaceSelection";

interface TopHeaderProps {
  title: string;
  onMenuClick?: () => void;
  showMenuButton?: boolean;
}

export const TopHeader = ({ title, onMenuClick, showMenuButton = true }: TopHeaderProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin } = useRBAC();
  const { memberships, selectedWorkspace, selectWorkspace, loading: workspacesLoading, error: workspacesError } = useWorkspaceSelection();
  const isFleetContext = location.pathname.startsWith("/fleet-os");

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out successfully");
    window.location.assign("/login");
  };

  const userEmail = user?.email || "";
  const initials = userEmail ? userEmail.substring(0, 2).toUpperCase() : "U";

  return (
    <header className="sticky top-0 z-40 w-full max-w-full overflow-x-hidden border-b border-border bg-card pt-safe">
      <div className="flex min-h-14 min-w-0 w-full max-w-full items-center gap-2 px-2 py-2 sm:px-4 md:min-h-16 md:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-4">
          {showMenuButton && (
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 lg:hidden" onClick={onMenuClick}>
              <Menu className="h-5 w-5" />
            </Button>
          )}
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-foreground md:text-lg">{title}</h1>
        </div>

        <div className="flex min-w-0 shrink-0 items-center gap-1 sm:gap-2 md:gap-4">
          <div className="relative hidden items-center md:flex">
            <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search VIN, Name, Plate..." className="w-64 border-0 bg-muted/50 pl-9" />
          </div>

          {user && (memberships.length > 0 || workspacesLoading || workspacesError) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="h-9 w-9 shrink-0 gap-2 p-0 text-left sm:w-auto sm:max-w-[240px] sm:px-2"
                  aria-label="Select workspace"
                  disabled={workspacesLoading && memberships.length === 0}
                >
                  <Building2 className="h-4 w-4 shrink-0 text-primary" />
                  <span className="hidden min-w-0 truncate text-xs font-semibold sm:inline sm:text-sm">
                    {workspacesLoading && memberships.length === 0 ? "Loading workspaces…" : selectedWorkspace?.workspaces?.name || "Select workspace"}
                  </span>
                  <ChevronsUpDown className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:block" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[min(18rem,calc(100vw-1rem))]">
                {workspacesError && <DropdownMenuItem disabled className="text-destructive">{workspacesError}</DropdownMenuItem>}
                {memberships.map((membership) => {
                  const workspace = membership.workspaces;
                  if (!workspace) return null;
                  return (
                    <DropdownMenuItem
                      key={membership.workspace_id}
                      onClick={() => {
                        try {
                          selectWorkspace(membership.workspace_id);
                        } catch (cause) {
                          toast.error(cause instanceof Error ? cause.message : "Unable to select workspace");
                        }
                      }}
                      className="flex min-w-0 items-center gap-2"
                    >
                      <Building2 className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                      <span className="shrink-0 text-[11px] capitalize text-muted-foreground">{membership.role}</span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <ThemeToggle />
          <NotificationBell />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex h-9 w-9 shrink-0 items-center gap-3 p-0 md:w-auto md:px-2">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary/10 text-sm text-primary">{initials}</AvatarFallback>
                </Avatar>
                <div className="hidden text-left md:block">
                  <p className="text-sm font-medium">{isFleetContext ? "Fleet Manager" : "Shop Manager"}</p>
                  <p className="max-w-[120px] truncate text-xs text-muted-foreground">{userEmail || "User"}</p>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => navigate("/settings")}><Settings className="mr-2 h-4 w-4" />Settings</DropdownMenuItem>
              {isAdmin && (<><DropdownMenuSeparator /><DropdownMenuItem onClick={() => navigate("/admin")}><Shield className="mr-2 h-4 w-4" />Admin Dashboard</DropdownMenuItem></>)}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive"><LogOut className="mr-2 h-4 w-4" />Sign Out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};
