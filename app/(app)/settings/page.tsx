"use client";

import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import { RouteRoleGuard } from "@/components/security/RouteRoleGuard";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct import of the legacy page component (no lazyRetry — App Router code-splits per route)
import Settings from "@/legacy-pages/Settings";

const SETTINGS_TAB_ALIASES: Readonly<Record<string, string>> = {
  business: "business",
  profile: "business",
  regional: "business",
  terminology: "business",

  booking: "booking",
  hours: "booking",
  availability: "booking",
  "service-area": "booking",
  services: "booking",
  catalog: "booking",
  weather: "booking",
  embed: "booking",
  subdomain: "booking",

  team: "team",
  members: "team",
  dispatch: "team",
  technician: "team",
  technicians: "team",

  payments: "payments",
  payment: "payments",
  stripe: "payments",
  square: "payments",
  tax: "payments",
  billing: "payments",
  quickbooks: "payments",
  qbo: "payments",
  "cash-drawer": "payments",
  deposits: "payments",

  comms: "comms",
  communications: "comms",
  marketing: "comms",
  email: "comms",
  smtp: "comms",
  sms: "comms",
  voice: "comms",
  agent: "comms",
  newsletter: "comms",

  integrations: "integrations",
  integration: "integrations",
  calendar: "integrations",
  "google-calendar": "integrations",
  inspection: "integrations",
  inspections: "integrations",
  "link-health": "integrations",

  advanced: "advanced",
  offline: "advanced",
  sync: "advanced",
  gdpr: "advanced",
  data: "advanced",
  export: "advanced",
  erasure: "advanced",
};

function SettingsRoute() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const requestedTab = params.get("tab")?.trim().toLowerCase();

  if (requestedTab) {
    const normalizedTab = SETTINGS_TAB_ALIASES[requestedTab] ?? "business";
    if (normalizedTab !== requestedTab) {
      params.set("tab", normalizedTab);
      const query = params.toString();
      return <Navigate to={`/settings${query ? `?${query}` : ""}${location.hash}`} replace />;
    }
  }

  return (
    <RequireAuth>
      <RouteRoleGuard>
        <RouteErrorBoundary section="Settings">
          <div className="settings-route contents">
            <Settings />
          </div>
          <style>{`
            /* The Settings save bar is fixed independently of AppLayout.
               Keep it above the mobile bottom nav and do not reserve desktop
               sidebar space until AppLayout actually renders the sidebar. */
            @media (max-width: 767px) {
              .settings-route .fixed.bottom-0.left-0.right-0.z-30 {
                bottom: calc(var(--mobile-nav-height) + env(safe-area-inset-bottom));
              }
            }

            @media (min-width: 768px) and (max-width: 1023px) {
              .settings-route .fixed.bottom-0.left-0.right-0.z-30 {
                left: 0 !important;
              }
            }
          `}</style>
        </RouteErrorBoundary>
      </RouteRoleGuard>
    </RequireAuth>
  );
}

export default function SettingsPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/settings" element={<SettingsRoute />} />
      </Routes>
    </NextRouterAdapter>
  );
}
