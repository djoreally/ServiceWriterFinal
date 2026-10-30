import "./setupJourneys";
import React from "react";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TerminologyProvider } from "@/contexts/TerminologyContext";
import { RegionalSettingsProvider } from "@/contexts/RegionalSettingsContext";
import { FeatureProvider } from "@/shared/features/feature.provider";
import { TenantProvider } from "@/contexts/TenantContext";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";
import { AuthProvider, type FrontendSession } from "@packages/auth";
import { KeyboardShortcutsProvider } from "@/contexts/KeyboardShortcutsContext";
import { AppRoutes } from "@/App";
import type { PersonaPreset } from "./personas";
import { personas } from "./personas";
import { getFakeBackend } from "./fakeBackend";
// Migrated App Router section pages (Phase 3+ migration): in production the
// legacy SPA shell does NOT serve these prefixes (see
// `src/lib/migratedRoutes.ts`) — the section page under `app/` does, inside
// the same provider stack. The harness mirrors that host selection: for a
// migrated prefix it mounts the section page next to `AppRoutes` (whose
// routes still own non-migrated paths like /login that guards redirect to).
// Each section page's `NextRouterAdapter` detects the harness MemoryRouter
// and renders its inner <Routes> against it, exactly as designed.
import DashboardPage from "../../../app/(app)/dashboard/page";
import AppointmentsPage from "../../../app/(app)/appointments/page";
import QuotesPage from "../../../app/(app)/quotes/page";
import SettingsPage from "../../../app/(app)/settings/page";
import FleetPage from "../../../app/(app)/fleet/page";
import FleetOsPage from "../../../app/(app)/fleet-os/[[...path]]/page";
import TechAppPage from "../../../app/(app)/tech-app/[[...path]]/page";
import CommandCenterPage from "../../../app/(app)/command-center/page";
import PublicServicesPage from "../../../app/(tenant)/public-services/[slug]/page";

/** App Router redirect pages, mirrored: /dispatch is a redirect to the
 *  command center in production (`app/(app)/dispatch/page.tsx`). */
const ROUTE_REDIRECTS: Record<string, string> = {
  "/dispatch": "/command-center",
};

function sectionPageFor(pathname: string): React.ComponentType | null {
  const matches = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);
  if (matches("/public-services")) return PublicServicesPage;
  if (matches("/fleet-os")) return FleetOsPage;
  if (matches("/tech-app")) return TechAppPage;
  if (matches("/dashboard")) return DashboardPage;
  if (matches("/appointments")) return AppointmentsPage;
  if (matches("/quotes")) return QuotesPage;
  if (matches("/settings")) return SettingsPage;
  if (matches("/fleet")) return FleetPage;
  if (matches("/command-center")) return CommandCenterPage;
  return null;
}

export interface RenderRouteOptions {
  route?: string;
  persona?: PersonaPreset;
  initialEntries?: string[];
}

function LocationTracker({ onLocationChange }: { onLocationChange: (path: string) => void }) {
  const location = useLocation();
  React.useEffect(() => {
    onLocationChange(location.pathname + location.search);
  }, [location, onLocationChange]);
  return null;
}

/**
 * Production host selection, mirrored: a migrated prefix is served by its
 * App Router section page and the SPA shell does not mount for it at all
 * (`ClientOnlyShell` returns null); any other path is served by the SPA's
 * `AppRoutes`. Switching on the live location also covers in-test
 * navigations (e.g. a guard redirecting /dashboard -> /login hands the
 * route from the section page to the SPA, as in production).
 */
function HostSwitch() {
  const location = useLocation();
  const SectionPage = sectionPageFor(location.pathname);
  // sectionPageFor only ever returns the stable module-level page imports
  // above — it never creates a component — so the selected component's
  // identity is constant per route and nothing remounts on re-render.
  // eslint-disable-next-line react-hooks/static-components
  return SectionPage ? <SectionPage /> : <AppRoutes />;
}

export function renderRoute(options: RenderRouteOptions = {}) {
  const { route = "/", persona = personas.asOwner(), initialEntries } = options;
  const effectiveRoute = ROUTE_REDIRECTS[route] ?? route;
  const entries = initialEntries ?? [effectiveRoute];
  const backend = getFakeBackend();
  backend.setPersona(persona);

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  let currentPath = effectiveRoute;

  const user = userEvent.setup();

  const renderResult = render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="ui-theme">
        <TooltipProvider>
          <TerminologyProvider>
            <RegionalSettingsProvider>
              <FeatureProvider>
                <AuthProvider
                  initialSession={persona.session as FrontendSession | null}
                  authStateSource={backend.auth}
                >
                  <SubscriptionProvider>
                    <TenantProvider>
                      <MemoryRouter initialEntries={entries}>
                        <KeyboardShortcutsProvider>
                          <LocationTracker onLocationChange={(p) => (currentPath = p)} />
                          <HostSwitch />
                        </KeyboardShortcutsProvider>
                      </MemoryRouter>
                    </TenantProvider>
                  </SubscriptionProvider>
                </AuthProvider>
              </FeatureProvider>
            </RegionalSettingsProvider>
          </TerminologyProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );

  return {
    ...renderResult,
    user,
    backend,
    getCurrentPath: () => currentPath,
    queryClient,
  };
}
