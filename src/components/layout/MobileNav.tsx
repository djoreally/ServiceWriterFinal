import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useTerminology } from "@/contexts/TerminologyContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight } from "lucide-react";
import { getNavGroups, getFooterNavItems, type NavItem } from "./navItems";
import { filterGroupsForMode, groupContainsPath, navItemMatchesPath, type SidebarMode } from "./navUtils";
import { useTeamRole } from "@/hooks/useTeamRole";
import { useWorkspaceBrand } from "@/hooks/useWorkspaceBrand";
import { DashboardModeToggle } from "./DashboardModeToggle";

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
}

export const MobileNav = ({ open, onClose }: MobileNavProps) => {
  const location = useLocation();
  const { terms } = useTerminology();
  const { role } = useTeamRole();
  const brand = useWorkspaceBrand();
  const mode = "daily" as SidebarMode;

  const allNavGroups = useMemo(() => getNavGroups(terms, role), [terms, role]);
  const navGroups = useMemo(
    () => filterGroupsForMode(allNavGroups, mode, location.pathname),
    [allNavGroups, mode, location.pathname],
  );
  const footerItems = getFooterNavItems(role);
  const isActive = (item: NavItem) => navItemMatchesPath(item, location.pathname);

  const renderNavItem = (item: NavItem, nested = false) => {
    const active = isActive(item);
    const hasChildren = (item.children?.length ?? 0) > 0;
    const childHasActive = item.children?.some((child) => isActive(child)) ?? false;

    if (hasChildren) {
      return (
        <Collapsible key={item.path} defaultOpen={active || childHasActive}>
          <CollapsibleTrigger className={cn(
            "group flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm font-medium transition-colors",
            active || childHasActive
              ? "bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))]"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}>
            <span className="truncate">{item.label}</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-90" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1 space-y-0.5 pl-3">
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
          "block rounded-md font-medium transition-colors",
          nested ? "px-3 py-2 text-xs" : "px-3 py-2.5 text-sm",
          active
            ? "bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))]"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        )}
      >
        <span className="truncate">{item.label}</span>
      </Link>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="left" className="flex w-64 flex-col p-0">
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle className="text-left">
            <p className="truncate text-base font-semibold">{brand.name}</p>
            {brand.tagline && <p className="mt-0.5 truncate text-xs font-normal text-muted-foreground">{brand.tagline}</p>}
          </SheetTitle>
          <div className="mt-4"><DashboardModeToggle onNavigate={onClose} /></div>
        </SheetHeader>
        <ScrollArea className="flex-1">
          <nav className="space-y-1 p-3">
            {navGroups.map((group) => {
              const groupHasActive = groupContainsPath(group, location.pathname);
              return (
                <Collapsible key={group.label} defaultOpen={groupHasActive} className="border-b border-border/40 pb-1 last:border-b-0">
                  <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground">
                    <span>{group.label}</span>
                    <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-0.5 space-y-0.5">
                    {group.items.map((item) => renderNavItem(item))}
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </nav>
        </ScrollArea>
        {footerItems.length > 0 && (
          <div className="space-y-1 border-t border-border p-3">
            {footerItems.map((item) => renderNavItem(item))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
