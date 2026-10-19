import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight } from "lucide-react";
import { groupContainsPath, navItemMatchesPath } from "./navUtils";
import type { NavGroup, NavItem } from "./navItems";

/**
 * Canonical grouped workspace navigation — the ONE renderer shared by the
 * desktop Sidebar and the mobile Sheet nav. Previously the two components
 * carried identical renderNavItem/group logic that drifted independently.
 * Presentational only: callers supply items (already role/mode-filtered).
 */

type RendererOptions = { pathname: string; onNavigate?: () => void };

function createNavItemRenderer({ pathname, onNavigate }: RendererOptions) {
  const isActive = (item: NavItem) => navItemMatchesPath(item, pathname);

  return function renderNavItem(item: NavItem, nested = false) {
    const active = isActive(item);
    const hasChildren = (item.children?.length ?? 0) > 0;
    const childHasActive = item.children?.some((child) => isActive(child)) ?? false;

    if (hasChildren) {
      return (
        <Collapsible key={item.path} defaultOpen={active || childHasActive}>
          <CollapsibleTrigger className={cn(
            "group flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm font-medium transition-colors",
            active || childHasActive
              ? "bg-primary-container text-on-primary-container"
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
        aria-label={item.label}
        onClick={onNavigate}
        className={cn(
          "block rounded-md font-medium transition-colors",
          nested ? "px-3 py-2 text-xs" : "px-3 py-2 text-sm",
          active
            ? "bg-primary-container text-on-primary-container"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        )}
      >
        <span className="truncate">{item.label}</span>
      </Link>
    );
  };
}

/** Scrollable grouped navigation sections. */
export function NavGroups({
  groups,
  pathname,
  onNavigate,
}: {
  groups: NavGroup[];
  pathname: string;
  onNavigate?: () => void;
}) {
  const renderNavItem = createNavItemRenderer({ pathname, onNavigate });
  return (
    <nav className="space-y-1 p-3">
      {groups.map((group) => {
        const groupHasActive = groupContainsPath(group, pathname);
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
  );
}

/** Bottom-pinned footer items (rendered OUTSIDE the scroll area). */
export function NavFooter({
  items,
  pathname,
  onNavigate,
  className,
}: {
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
  className?: string;
}) {
  if (items.length === 0) return null;
  const renderNavItem = createNavItemRenderer({ pathname, onNavigate });
  return (
    <div className={cn("space-y-1 border-t border-border p-3", className)}>
      {items.map((item) => renderNavItem(item))}
    </div>
  );
}
