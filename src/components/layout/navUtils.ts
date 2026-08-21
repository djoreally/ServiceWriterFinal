import type { NavGroup, NavItem } from "./navItems";

export const SIDEBAR_MODE_KEY = "service-writer.sidebar.mode";

export type SidebarMode = "daily" | "admin";

const dailyGroupLabels = new Set(["Overview", "Customers & Vehicles", "Appointments", "Field Ops", "Communications"]);
const adminGroupLabels = new Set(["Services", "Finance", "Marketing & Retention", "Training & Support"]);

const getPathBase = (path: string) => path.split("?")[0];

export const navItemMatchesPath = (item: NavItem, pathname: string): boolean => {
  const itemPath = getPathBase(item.path);
  const itemMatches = itemPath === "/fleet-os"
    ? pathname === "/fleet-os" || pathname.startsWith("/fleet-os/")
    : pathname === itemPath || pathname.startsWith(itemPath + "/");

  return itemMatches || (item.children?.some((child) => navItemMatchesPath(child, pathname)) ?? false);
};

export const groupContainsPath = (group: NavGroup, pathname: string) =>
  group.items.some((item) => navItemMatchesPath(item, pathname));

export const filterGroupsForMode = (groups: NavGroup[], _mode: SidebarMode, _pathname: string) => {
  // Previously this hid ~half the sidebar (Services, Finance, Marketing, Training were
  // "admin" mode; the rest were "daily"). That left super admins and shop owners unable
  // to reach Services / Service Records / Payments without discovering the mode toggle.
  // We now always render every group; the mode toggle is retained purely for future use.
  void _mode;
  void _pathname;
  void dailyGroupLabels;
  void adminGroupLabels;
  return groups;
};
