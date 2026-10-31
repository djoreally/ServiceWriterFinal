import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTerminology } from "@/contexts/TerminologyContext";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getNavGroups, getFooterNavItems } from "./navItems";
import { filterGroupsForMode, type SidebarMode } from "./navUtils";
import { NavGroups, NavFooter } from "./NavSections";
import { useTeamRole } from "@/hooks/useTeamRole";
import { useWorkspaceBrand } from "@/hooks/useWorkspaceBrand";
import { DashboardModeToggle } from "./DashboardModeToggle";

export const Sidebar = () => {
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
    <aside className="hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-card lg:flex">
      <div className="shrink-0 border-b border-border px-5 py-5">
        <Link to="/dashboard" className="block min-w-0">
          <p className="truncate font-display text-base font-bold text-foreground">{brand.name}</p>
          {brand.tagline && <p className="mt-0.5 truncate text-xs text-muted-foreground">{brand.tagline}</p>}
        </Link>
        <div className="mt-4"><DashboardModeToggle /></div>
      </div>

      <div className="flex-1 overflow-auto">
        <ScrollArea className="h-full">
          <NavGroups groups={navGroups} pathname={location.pathname} />
        </ScrollArea>
      </div>

      <NavFooter items={footerItems} pathname={location.pathname} className="shrink-0" />
    </aside>
  );
};
