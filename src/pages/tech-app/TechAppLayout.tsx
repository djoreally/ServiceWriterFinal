/**
 * TechAppLayout — Mobile-first shell for the technician field app.
 *
 * The technician app opens to the shop-branded technician dashboard. The shell provides
 * the industrial visual system across every technician route, keeps primary
 * tabs in the bottom nav, and moves secondary technician links into a menu.
 */

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  BookOpen,
  Briefcase,
  Clock,
  Database,
  Grid2X2,
  LockKeyhole,
  MapPin,
  Menu,
  MessageSquare,
  Package,
  Settings,
  Shield,
  Truck,

  UserCircle,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationBell } from "@/components/notifications";
import { getPushRegistrationState, registerTechPushDevice } from "@/lib/tech-push";
import { useTechIdentity } from "@/hooks/useTechIdentity";
import { useShopBrand } from "@/hooks/useShopBrand";
import type { InAppNotification } from "@/hooks/useNotifications";
import type { TechIdentity } from "@/hooks/useTechIdentity";

const TechIdentityContext = createContext<{
  identity: TechIdentity | null;
  loading: boolean;
  refetch: () => Promise<void>;
}>({ identity: null, loading: true, refetch: async () => {} });

export const useTechContext = () => useContext(TechIdentityContext);

const NAV_ITEMS = [
  { path: "/tech-app", label: "Dashboard", icon: Grid2X2 },
  { path: "/tech-app/jobs", label: "Jobs", icon: Briefcase },
  { path: "/tech-app/fleet", label: "Fleet", icon: Truck },
  { path: "/tech-app/data-center", label: "Data", icon: Database },
  { path: "/tech-app/profile", label: "Profile", icon: UserCircle },
];


const MENU_ITEMS = [
  { path: "/tech-app/route", label: "Route", icon: MapPin },
  { path: "/tech-app/messages", label: "Dispatch", icon: MessageSquare },
  { path: "/tech-app/more", label: "More", icon: Grid2X2 },
  { path: "/tech-app/services", label: "Service Records", icon: Wrench },
  { path: "/tech-app/shift", label: "Shift Clock", icon: Clock },
  { path: "/tech-app/shift-review", label: "Shift Review", icon: Clock },
  { path: "/tech-app/inventory", label: "Inventory", icon: Package },
  { path: "/knowledge-base", label: "Knowledge Base", icon: BookOpen },
  { path: "/tech-app/settings", label: "Settings", icon: Settings },
];

const TECH_NOTIFICATION_TYPES = new Set([
  "job_assignment",
  "technician_assignment",
  "technician_message",
  "technician_message_admin",
  "dispatch_message",
  "dispatch_update",
  "route_updated",
  "job_update",
  "appointment_update",
]);

const isTechnicianNotification = (notification: InAppNotification, identity: TechIdentity | null) => {
  const metadata = notification.metadata ?? {};
  const notificationType = notification.type?.toLowerCase();
  const audience = typeof metadata.audience === "string" ? metadata.audience.toLowerCase() : null;
  const technicianId = typeof metadata.technician_id === "string" ? metadata.technician_id : null;
  const assignedTechnicianId = typeof metadata.assigned_technician_id === "string" ? metadata.assigned_technician_id : null;
  const jobId = typeof metadata.job_id === "string" || typeof metadata.appointment_id === "string";

  if (audience === "admin" || audience === "owner" || audience === "management") return false;
  if (identity?.techId && (technicianId === identity.techId || assignedTechnicianId === identity.techId)) return true;
  if (audience === "technician" || audience === "field") return true;
  if (notificationType && TECH_NOTIFICATION_TYPES.has(notificationType)) return true;

  return Boolean(jobId && notificationType && !["new_booking", "payment_received", "low_inventory"].includes(notificationType));
};

export default function TechAppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { identity, loading, error, refetch } = useTechIdentity();
  const brand = useShopBrand(identity?.businessUserId);
  const blocked = identity && ["locked", "deactivated", "unlinked", "unauthenticated", "invited", "roster_only"].includes(identity.accessState);
  const filterTechNotifications = useCallback(
    (notification: InAppNotification) => isTechnicianNotification(notification, identity),
    [identity],
  );

  const [pushState, setPushState] = useState(() => getPushRegistrationState());

  // Silently (re)bind this device when the tech already granted notifications, so a
  // reinstalled PWA or rotated VAPID key never leaves them unreachable.
  useEffect(() => {
    if (!identity || blocked || pushState !== "granted") return;
    void registerTechPushDevice();
  }, [identity, blocked, pushState]);

  const enablePush = async () => {
    const endpoint = await registerTechPushDevice();
    setPushState(endpoint ? "granted" : getPushRegistrationState());
  };

  const isActive = (path: string) => {
    if (path === "/tech-app") return location.pathname === "/tech-app";
    return location.pathname.startsWith(path);
  };

  return (
    <TechIdentityContext.Provider value={{ identity, loading, refetch }}>
      <div className="flex min-h-screen flex-col bg-[#fdf8f8] text-[#1c1b1b] font-sans">
        <header className="sticky top-0 z-40 border-b-2 border-[#c7c6ca] bg-[#fdf8f8] shadow-sm pt-safe">
          <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-5 md:px-8">
            <button className="flex items-center gap-3" onClick={() => navigate("/tech-app")} aria-label="Open technician dashboard">
              {brand.logoUrl ? (
                <img
                  src={brand.logoUrl}
                  alt={`${brand.name} logo`}
                  className="h-8 w-8 rounded-md object-cover"
                />
              ) : (
                <Wrench className="h-7 w-7 fill-black text-black" />
              )}
              <span className="max-w-[190px] truncate text-xl font-extrabold tracking-[-0.02em] text-[#1439cc] sm:max-w-none">
                {brand.name}
              </span>
              {identity?.isAdmin && (
                <Badge variant="outline" className="hidden border-[#c41720]/30 bg-[#ffdad6] text-[10px] text-[#930010] sm:inline-flex">
                  <Shield className="mr-1 h-3 w-3" /> Admin
                </Badge>
              )}
            </button>

            <div className="flex items-center gap-1">
              {identity && !blocked && pushState === "prompt" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs font-semibold text-[#1439cc]"
                  onClick={enablePush}
                >
                  Enable alerts
                </Button>
              )}
              {identity && !blocked && <NotificationBell filterNotification={filterTechNotifications} />}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-12 w-12 rounded-md text-[#46474a] hover:bg-[#e5e2e1]"
                    aria-label="Open technician menu"
                  >
                    <Menu className="h-7 w-7" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={10} className="w-64 border-2 border-[#c7c6ca] bg-[#fdf8f8] p-2 text-[#1c1b1b] shadow-lg">
                  <DropdownMenuLabel className="font-mono text-xs font-extrabold uppercase tracking-[0.12em] text-[#46474a]">
                    Technician Menu
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-[#c7c6ca]" />
                  {MENU_ITEMS.map((item) => (
                    <DropdownMenuItem
                      key={item.path}
                      className="min-h-11 cursor-pointer gap-3 rounded-lg px-3 font-semibold focus:bg-[#e5e2e1]"
                      onClick={() => navigate(item.path)}
                    >
                      <item.icon className="h-5 w-5 text-[#46474a]" />
                      {item.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto pb-[calc(var(--mobile-nav-height)+env(safe-area-inset-bottom)+1rem)] [&_.bg-card]:bg-white [&_.border-border]:border-[#c7c6ca] [&_.text-muted-foreground]:text-[#46474a]">
          {loading ? (
            <div className="p-8 text-center text-[#46474a]">Loading technician workspace…</div>
          ) : error || !identity ? (
            <div className="mx-auto max-w-md p-8 text-center"><AlertCircle className="mx-auto mb-3 h-10 w-10 text-destructive" /><h1 className="font-semibold">Technician workspace unavailable</h1><p className="mt-2 text-sm text-muted-foreground">{error || "No technician workspace is linked to this account."}</p></div>
          ) : blocked ? (
            <div className="mx-auto max-w-md p-8 text-center"><LockKeyhole className="mx-auto mb-3 h-10 w-10 text-destructive" /><h1 className="font-semibold capitalize">Access {identity.accessState}</h1><p className="mt-2 text-sm text-muted-foreground">Contact your workspace manager to restore technician access.</p></div>
          ) : <Outlet />}
        </main>

        {!blocked && identity && !error && (
          <nav className="fixed bottom-0 left-0 right-0 z-50 border-t-2 border-[#c7c6ca] bg-[#fdf8f8] pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_10px_rgba(0,0,0,0.10)]" data-app-bottomnav>
            <div className="mx-auto flex h-[var(--mobile-nav-height)] max-w-lg items-center justify-around px-2">
              {NAV_ITEMS.map((item) => {
                const active = isActive(item.path);
                return (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className={cn(
                      "flex min-h-11 min-w-[58px] flex-col items-center justify-center rounded-lg px-1.5 py-1 font-mono text-[11px] font-extrabold tracking-[0.05em] transition-transform active:scale-95 sm:min-w-[68px] sm:text-xs",
                      active
                        ? "bg-[#da3433] text-white shadow-sm"
                        : "text-[#46474a] hover:bg-[#e5e2e1]"
                    )}
                  >
                    <item.icon className={cn("h-5 w-5", active && "text-white")} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        )}
      </div>
    </TechIdentityContext.Provider>
  );
}
