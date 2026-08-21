import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Car, ClipboardList, Radio, CalendarClock } from "lucide-react";

type BottomNavItem = {
  path: string;
  label: string;
  icon: React.ElementType;
};

const fleetBottomItems: BottomNavItem[] = [
  { path: "/fleet-os", label: "Overview", icon: LayoutDashboard },
  { path: "/fleet-os/command-center", label: "Command", icon: Radio },
  { path: "/fleet-os/scheduler", label: "Schedule", icon: CalendarClock },
  { path: "/fleet-os/vehicles", label: "Vehicles", icon: Car },
  { path: "/fleet-os/work-orders", label: "Orders", icon: ClipboardList },
];

export const FleetBottomNavBar = () => {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/fleet-os") return location.pathname === "/fleet-os";
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] shadow-lg" data-app-bottomnav>
      <div className="grid h-[var(--mobile-nav-height)] grid-cols-5">
        {fleetBottomItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex min-h-11 flex-col items-center justify-center text-xs font-medium transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className={cn("h-5 w-5 mb-1", active ? "text-primary" : "text-muted-foreground")} />
              <span className="text-center text-[10px]">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
