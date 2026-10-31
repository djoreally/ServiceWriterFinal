import { Link, useLocation } from "react-router-dom";
import { CalendarRange, Home, LayoutDashboard, MessageSquare, Truck, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTeamRole } from "@/hooks/useTeamRole";

type BottomNavItem = {
  path: string;
  label: string;
  icon: LucideIcon;
};

const adminItems: BottomNavItem[] = [
  { path: "/dashboard", label: "Home", icon: Home },
  { path: "/appointments", label: "Schedule", icon: CalendarRange },
  { path: "/customers", label: "Clients", icon: Users },
  { path: "/fleet-os", label: "Fleet OS", icon: Truck },
];

const managerItems: BottomNavItem[] = [
  { path: "/dashboard", label: "Home", icon: Home },
  { path: "/appointments", label: "Schedule", icon: CalendarRange },
  { path: "/customers", label: "Clients", icon: Users },
  { path: "/fleet-os", label: "Fleet OS", icon: Truck },
  { path: "/messages", label: "Messages", icon: MessageSquare },
];

const dispatcherItems: BottomNavItem[] = [
  { path: "/command-center", label: "Today", icon: LayoutDashboard },
  { path: "/appointments", label: "Schedule", icon: CalendarRange },
  { path: "/messages", label: "Messages", icon: MessageSquare },
  { path: "/fleet-os", label: "Fleet", icon: Truck },
];

export const BottomNavBar = () => {
  const location = useLocation();
  const { role } = useTeamRole();
  const navItems = role === "dispatcher" ? dispatcherItems : role === "manager" ? managerItems : adminItems;

  const isActive = (path: string) => {
    if (path === "/appointments" || path === "/fleet-os") return location.pathname.startsWith(path);
    return location.pathname === path;
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/60 bg-card pb-[env(safe-area-inset-bottom)] lg:hidden" data-app-bottomnav>
      <div className={cn("grid h-[var(--mobile-nav-height)]", navItems.length === 5 ? "grid-cols-5" : "grid-cols-4")}>
        {navItems.map((item) => {
          const active = isActive(item.path);
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 flex-col items-center justify-center gap-0.5 border-t-2 px-2 text-center text-[11px] font-bold transition-colors",
                active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-[22px] w-[22px]" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
