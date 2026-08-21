import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Home, CalendarDays, Users, Settings, Zap, MessageSquare, Truck } from "lucide-react";
import { useTeamRole } from "@/hooks/useTeamRole";

type BottomNavItem = {
  path: string;
  label: string;
  icon: React.ElementType;
};

const adminItems: BottomNavItem[] = [
  { path: "/dashboard", label: "Home", icon: Home },
  { path: "/appointments", label: "Schedule", icon: CalendarDays },
  { path: "/customers", label: "Clients", icon: Users },
  { path: "/fleet-os", label: "Fleet OS", icon: Truck },
  { path: "/settings", label: "Settings", icon: Settings },
];

const managerItems: BottomNavItem[] = [
  { path: "/dashboard", label: "Home", icon: Home },
  { path: "/appointments", label: "Schedule", icon: CalendarDays },
  { path: "/customers", label: "Clients", icon: Users },
  { path: "/fleet-os", label: "Fleet OS", icon: Truck },
  { path: "/messages", label: "Messages", icon: MessageSquare },
];

const dispatcherItems: BottomNavItem[] = [
  { path: "/command-center", label: "Today", icon: Zap },
  { path: "/appointments", label: "Schedule", icon: CalendarDays },
  { path: "/messages", label: "Messages", icon: MessageSquare },
  { path: "/fleet-os", label: "Fleet", icon: Truck },
];

export const BottomNavBar = () => {
  const location = useLocation();
  const { role } = useTeamRole();

  const navItems =
    role === "dispatcher" ? dispatcherItems : role === "manager" ? managerItems : adminItems;

  const isActive = (path: string) => {
    if (path === "/appointments" || path === "/fleet-os") {
      return location.pathname.startsWith(path);
    }
    return location.pathname === path;
  };

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border/50 shadow-t-lg pb-[env(safe-area-inset-bottom)]" data-app-bottomnav>
      <div className={cn("grid h-[var(--mobile-nav-height)]", navItems.length === 5 ? "grid-cols-5" : "grid-cols-4")}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex min-h-11 flex-col items-center justify-center text-[11px] font-medium transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:bg-muted/10"
              )}
            >
              <Icon className={cn("mb-1 h-5 w-5", active ? "text-primary" : "text-muted-foreground")} />
              <span className="text-center">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
