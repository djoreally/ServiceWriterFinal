import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fleetNavItems, fleetFooterItems } from "./fleetNavItems";
import { useFleetMode } from "@/stores/fleetModeStore";
import { Truck, Wrench } from "lucide-react";

interface FleetMobileNavProps {
  open: boolean;
  onClose: () => void;
}

export const FleetMobileNav = ({ open, onClose }: FleetMobileNavProps) => {
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
    onClose();
  };

  const allItems = [...fleetNavItems, ...fleetFooterItems];

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="left" className="w-64 flex flex-col p-0 bg-sidebar border-sidebar-border">
        <SheetHeader className="p-4 border-b border-sidebar-border">
          <SheetTitle className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Truck className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="text-left">
              <p className="font-bold text-sidebar-foreground">Fleet OS</p>
              <p className="text-[11px] text-muted-foreground font-normal">Fleet Service Control</p>
            </div>
          </SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1">
          <nav className="p-3 space-y-1">
            <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Navigation
            </p>
            {allItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={onClose}
                  className={cn(
                    "group flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                  )}
                >
                  <div
                    className={cn(
                      "h-7 w-7 rounded-md flex items-center justify-center shrink-0",
                      active
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </ScrollArea>

        {/* Switch to Shop */}
        <div className="p-3 border-t border-sidebar-border shrink-0">
          <button
            onClick={handleSwitchToShop}
            className="flex items-center gap-3 w-full px-3 py-2.5 text-sm font-medium rounded-lg text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors"
          >
            <Wrench className="h-4 w-4" />
            Switch to Shop Mode
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
