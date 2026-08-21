import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fleetNavItems, fleetFooterItems } from "./fleetNavItems";
import { useFleetMode } from "@/stores/fleetModeStore";
import { Wrench, Truck, ChevronRight } from "lucide-react";

export const FleetSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { setFleetMode } = useFleetMode();

  const isActive = (path: string) =>
    path === "/fleet-os"
      ? location.pathname === "/fleet-os"
      : location.pathname.startsWith(path);

  const handleSwitchToShop = () => {
    setFleetMode(false);
    navigate("/dashboard");
  };

  return (
    <aside className="hidden lg:flex flex-col w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border h-screen sticky top-0">
      {/* Fleet OS Branding */}
      <div className="px-5 py-5 border-b border-sidebar-border shrink-0">
        <Link to="/fleet-os" className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
            <Truck className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-sidebar-foreground text-base tracking-tight">Fleet OS</h1>
            <p className="text-[11px] text-muted-foreground font-medium">Fleet Service Control</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-auto">
        <ScrollArea className="h-full">
          <nav className="px-3 py-4 space-y-1">
            <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Navigation
            </p>
            {fleetNavItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all relative",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                  )}
                >
                  {active && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full" />
                  )}
                  <div
                    className={cn(
                      "h-7 w-7 rounded-md flex items-center justify-center shrink-0 transition-colors",
                      active
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground group-hover:bg-muted/80 group-hover:text-foreground"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="block truncate">{item.label}</span>
                    {item.description && (
                      <span className={cn(
                        "block text-[10px] truncate transition-colors",
                        active ? "text-primary/70" : "text-muted-foreground/70 group-hover:text-muted-foreground"
                      )}>
                        {item.description}
                      </span>
                    )}
                  </div>
                  {active && (
                    <ChevronRight className="h-3.5 w-3.5 text-primary/50 shrink-0" />
                  )}
                </Link>
              );
            })}
          </nav>
        </ScrollArea>
      </div>

      {/* Footer */}
      <div className="px-3 pb-2 pt-2 border-t border-sidebar-border shrink-0 space-y-1">
        {fleetFooterItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all w-full",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}

        {/* Switch to Shop Mode */}
        <button
          onClick={handleSwitchToShop}
          className="flex items-center gap-3 w-full px-3 py-2 text-sm font-medium rounded-lg text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors"
        >
          <Wrench className="h-4 w-4" />
          Shop Mode
        </button>
      </div>
    </aside>
  );
};
