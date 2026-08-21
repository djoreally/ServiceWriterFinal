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
import { Search, LogOut, Menu, Shield, Settings } from "lucide-react";
import { toast } from "sonner";
import { useAuth, useRBAC } from "@packages/auth";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/notifications";

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
