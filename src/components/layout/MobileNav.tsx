import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useTerminology } from "@/contexts/TerminologyContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getNavGroups, getFooterNavItems } from "./navItems";
import { filterGroupsForMode, type SidebarMode } from "./navUtils";
import { NavGroups, NavFooter } from "./NavSections";
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
          <NavGroups groups={navGroups} pathname={location.pathname} onNavigate={onClose} />
        </ScrollArea>
        <NavFooter items={footerItems} pathname={location.pathname} onNavigate={onClose} />
      </SheetContent>
    </Sheet>
  );
};
