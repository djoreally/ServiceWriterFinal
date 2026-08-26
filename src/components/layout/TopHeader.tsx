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
  const initials = userEmail
    ? userEmail.substring(0, 2).toUpperCase()
    : "U";

  return (
    <header className="sticky top-0 z-40 bg-card border-b border-border pt-safe">
      <div className="flex min-h-14 items-center justify-between px-3 py-2 sm:px-4 md:min-h-16 md:px-5">
        <div className="flex items-center gap-3 md:gap-4">
          {showMenuButton && (
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden h-9 w-9"
              onClick={onMenuClick}
            >
              <Menu className="h-5 w-5" />
            </Button>
          )}
          <h1 className="max-w-[180px] truncate text-base font-semibold text-foreground sm:max-w-none md:text-lg">{title}</h1>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          {/* Search */}
          <div className="hidden md:flex items-center relative">
            <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search VIN, Name, Plate..."
              className="pl-9 w-64 bg-muted/50 border-0"
            />
          </div>

          {/* Workspace context */}
          {user && (memberships.length > 0 || workspacesLoading || workspacesError) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="h-9 max-w-[170px] gap-2 px-2 text-left sm:max-w-[240px]"
                  aria-label="Select workspace"
                  disabled={workspacesLoading && memberships.length === 0}
                >
                  <Building2 className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 truncate text-xs font-semibold sm:text-sm">
                    {workspacesLoading && memberships.length === 0
                      ? "Loading workspaces…"
                      : selectedWorkspace?.workspaces?.name || "Select workspace"}
                  </span>
                  <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[min(18rem,calc(100vw-1.5rem))]">
                {workspacesError && (
                  <DropdownMenuItem disabled className="text-destructive">
                    {workspacesError}
                  </DropdownMenuItem>
                )}
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

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* Real-time Notifications */}
          <NotificationBell />

          {/* User Profile */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-3 px-2">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary/10 text-primary text-sm">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden md:block text-left">
                  <p className="text-sm font-medium">{isFleetContext ? "Fleet Manager" : "Shop Manager"}</p>
                  <p className="text-xs text-muted-foreground truncate max-w-[120px]">
                    {userEmail || "User"}
                  </p>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => navigate("/settings")}>
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </DropdownMenuItem>
              {isAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/admin")}>
                    <Shield className="h-4 w-4 mr-2" />
                    Admin Dashboard
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};
