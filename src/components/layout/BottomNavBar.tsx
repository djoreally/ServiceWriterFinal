import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useTeamRole } from "@/hooks/useTeamRole";

type BottomNavItem = {
  path: string;
  label: string;
};

const adminItems: BottomNavItem[] = [
  { path: "/dashboard", label: "Home" },
  { path: "/appointments", label: "Schedule" },
  { path: "/customers", label: "Clients" },
  { path: "/fleet-os", label: "Fleet OS" },
];

const managerItems: BottomNavItem[] = [
  { path: "/dashboard", label: "Home" },
  { path: "/appointments", label: "Schedule" },
  { path: "/customers", label: "Clients" },
  { path: "/fleet-os", label: "Fleet OS" },
  { path: "/messages", label: "Messages" },
];

const dispatcherItems: BottomNavItem[] = [
  { path: "/command-center", label: "Today" },
  { path: "/appointments", label: "Schedule" },
  { path: "/messages", label: "Messages" },
  { path: "/fleet-os", label: "Fleet" },
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
          return (
            <Link
              key={item.path}
              to={item.path}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center justify-center border-t-2 px-2 text-center text-xs font-semibold transition-colors",
                active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
