import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useTerminology } from "@/contexts/TerminologyContext";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BriefcaseBusiness, ChevronRight, PanelLeftClose, PanelLeftOpen, SlidersHorizontal } from "lucide-react";
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

const SIDEBAR_COMPACT_KEY = "service-writer.sidebar.compact";

export const Sidebar = () => {
  const location = useLocation();
  const { terms } = useTerminology();
  const { role } = useTeamRole();
  const brand = useWorkspaceBrand();
  const [compact, setCompact] = useState(false);
  const [mode, setMode] = useState<SidebarMode>("daily");

  useEffect(() => {
    setCompact(window.localStorage.getItem(SIDEBAR_COMPACT_KEY) === "true");
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

  const toggleCompact = () => {
    setCompact((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_COMPACT_KEY, String(next));
      return next;
    });
  };

  const selectMode = (nextMode: SidebarMode) => {
    setMode(nextMode);
    window.localStorage.setItem(SIDEBAR_MODE_KEY, nextMode);
  };

  const renderNavItem = (item: NavItem, nested = false) => {
    const Icon = item.icon;
    const active = isActive(item);
    const hasChildren = !compact && (item.children?.length ?? 0) > 0;
    const childHasActive = item.children?.some((child) => isActive(child)) ?? false;

    if (hasChildren) {
      return (
        <Collapsible key={item.path} defaultOpen={active || childHasActive} className="rounded-lg">
          <CollapsibleTrigger
            className={cn(
              "flex items-center justify-between w-full gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
              active || childHasActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <span className="flex items-center gap-3 min-w-0">
              <Icon className="h-4 w-4 shrink-0" />
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

    const link = (
      <Link
        key={item.path}
        to={item.path}
        aria-label={item.label}
        className={cn(
          "flex items-center rounded-lg font-medium transition-all",
          compact
            ? "h-10 w-10 justify-center mx-auto"
            : nested
              ? "gap-2 px-3 py-2 text-xs"
              : "gap-3 px-3 py-2 text-sm",
          active
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <Icon className={cn("shrink-0", nested ? "h-3.5 w-3.5" : "h-4 w-4")} />
        {!compact && <span className="truncate">{item.label}</span>}
      </Link>
    );

    if (!compact) return link;

    return (
      <Tooltip key={item.path}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <aside
      className={cn(
        "hidden lg:flex flex-col bg-card border-r border-border h-screen sticky top-0 transition-[width] duration-200",
        compact ? "w-20" : "w-60",
      )}
    >
      {/* Logo */}
      <div className={cn("border-b border-border shrink-0", compact ? "p-3" : "p-6")}>
        <div className={cn("flex items-center", compact ? "justify-center" : "justify-between gap-3")}>
          <Link to="/dashboard" className={cn("flex items-center gap-3 min-w-0", compact && "justify-center")}>
            <ProgressiveImage
              src={brand.logoUrl || "/logo.png"}
              alt={`${brand.name} logo`}
              className="h-8 w-8 rounded object-cover shrink-0"
              placeholderClassName="h-8 w-8 rounded shrink-0"
            />
            {!compact && (
              <div className="min-w-0 flex items-center">
                <h1 className="font-bold text-foreground truncate">{brand.name}</h1>
              </div>
            )}
          </Link>
          {!compact && (
            <button
              type="button"
              onClick={toggleCompact}
              className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground inline-flex items-center justify-center transition-colors"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>

        {compact ? (
          <button
            type="button"
            onClick={toggleCompact}
            className="mt-3 h-9 w-9 mx-auto rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground flex items-center justify-center transition-colors"
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        ) : (
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
        )}
      </div>

      {/* Grouped Navigation */}
      <div className="flex-1 overflow-auto">
        <ScrollArea className="h-full">
          <nav className={cn("space-y-1", compact ? "p-2" : "p-3")}>
            {navGroups.map((group) => {
              const groupHasActive = groupContainsPath(group, location.pathname);

              if (compact) {
                return (
                  <div key={group.label} className="space-y-1 border-b border-border/40 py-2 last:border-b-0">
                    {group.items.map((item) => renderNavItem(item))}
                  </div>
                );
              }

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
      </div>

      {/* Footer */}
      {footerItems.length > 0 && (
        <div className={cn("border-t border-border shrink-0 space-y-1", compact ? "p-2" : "p-4")}>
          {footerItems.map((item) => renderNavItem(item))}
        </div>
      )}
    </aside>
  );
};
