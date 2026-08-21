import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useTerminology } from "@/contexts/TerminologyContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { BriefcaseBusiness, ChevronRight, SlidersHorizontal } from "lucide-react";
import { getNavGroups, getFooterNavItems, type NavItem } from "./navItems";
import {
  filterGroupsForMode,
  groupContainsPath,
  navItemMatchesPath,
  SIDEBAR_MODE_KEY,
  type SidebarMode,
} from "./navUtils";
import { useTeamRole } from "@/hooks/useTeamRole";
import { useWorkspaceBrand } from "@/hooks/useWorkspaceBrand";
import { ProgressiveImage } from "@/components/media/ProgressiveImage";

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
}

export const MobileNav = ({ open, onClose }: MobileNavProps) => {
  const location = useLocation();
  const { terms } = useTerminology();
  const { role } = useTeamRole();
  const brand = useWorkspaceBrand();
  const [mode, setMode] = useState<SidebarMode>("daily");

  useEffect(() => {
    const storedMode = window.localStorage.getItem(SIDEBAR_MODE_KEY);
    if (storedMode === "daily" || storedMode === "admin") {
      setMode(storedMode);
    }
  }, []);

  const allNavGroups = useMemo(() => getNavGroups(terms, role), [terms, role]);
  const navGroups = useMemo(
    () => filterGroupsForMode(allNavGroups, mode, location.pathname),
    [allNavGroups, mode, location.pathname],
  );
  const footerItems = getFooterNavItems(role);
  const isActive = (item: NavItem) => navItemMatchesPath(item, location.pathname);

  const selectMode = (nextMode: SidebarMode) => {
    setMode(nextMode);
    window.localStorage.setItem(SIDEBAR_MODE_KEY, nextMode);
  };

  const renderNavItem = (item: NavItem, nested = false) => {
    const Icon = item.icon;
    const active = isActive(item);
    const hasChildren = (item.children?.length ?? 0) > 0;
    const childHasActive = item.children?.some((child) => isActive(child)) ?? false;

    if (hasChildren) {
      return (
        <Collapsible key={item.path} defaultOpen={active || childHasActive} className="rounded-xl">
          <CollapsibleTrigger
            className={cn(
              "flex items-center justify-between w-full gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
              active || childHasActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <span className="flex min-w-0 items-center gap-3">
              <Icon className="h-5 w-5 shrink-0" />
              <span className="truncate">{item.label}</span>
            </span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-90" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1 space-y-0.5 pl-6">
            {item.children?.map((child) => renderNavItem(child, true))}
          </CollapsibleContent>
        </Collapsible>
      );
    }

    return (
      <Link
        key={item.path}
        to={item.path}
        onClick={onClose}
        className={cn(
          "flex items-center rounded-xl font-medium transition-all",
          nested ? "gap-2 px-3 py-2 text-xs" : "gap-3 px-4 py-3 text-sm",
          active
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <Icon className={cn("shrink-0", nested ? "h-3.5 w-3.5" : "h-5 w-5")} />
        <span className="truncate">{item.label}</span>
      </Link>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="left" className="w-64 flex flex-col p-0">
        <SheetHeader className="p-4 border-b border-border">
          <SheetTitle className="flex items-center gap-3">
            <ProgressiveImage
              src={brand.logoUrl || "/logo.png"}
              alt={`${brand.name} logo`}
              className="h-8 w-8 rounded object-cover"
              placeholderClassName="h-8 w-8 rounded"
            />
            <div className="text-left min-w-0">
              <p className="font-bold truncate">{brand.name}</p>
              <p className="text-xs text-muted-foreground font-normal truncate">{brand.tagline}</p>
            </div>
          </SheetTitle>
          <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1">
            <button
              type="button"
              onClick={() => selectMode("daily")}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors",
                mode === "daily" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <BriefcaseBusiness className="h-3.5 w-3.5" />
              Daily
            </button>
            <button
              type="button"
              onClick={() => selectMode("admin")}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors",
                mode === "admin" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Admin
            </button>
          </div>
        </SheetHeader>
        <ScrollArea className="flex-1">
          <nav className="p-3 space-y-1">
            {navGroups.map((group) => {
              const groupHasActive = groupContainsPath(group, location.pathname);
              return (
                <Collapsible
                  key={group.label}
                  defaultOpen={groupHasActive}
                  className="border-b border-border/40 pb-1 last:border-b-0"
                >
                  <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted/50 group">
                    <span>{group.label}</span>
                    <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-0.5 space-y-0.5 pl-1">
                    {group.items.map((item) => renderNavItem(item))}
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </nav>
        </ScrollArea>

        {/* Footer */}
        {footerItems.length > 0 && (
          <div className="p-4 border-t border-border shrink-0 space-y-1">
            {footerItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item);
              const className = cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all w-full",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              );

              if (item.onClick) {
                return (
                  <button key={item.label} onClick={() => { item.onClick?.(); onClose(); }} className={className}>
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </button>
                );
              }

              return (
                <Link key={item.label} to={item.path} onClick={onClose} className={className}>
                  <Icon className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
