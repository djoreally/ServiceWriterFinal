"use client";

import { StrictMode, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@packages/auth";
import { supabase } from "@/integrations/supabase/client";
import { ThemeProvider } from "@/components/ThemeProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TerminologyProvider } from "@/contexts/TerminologyContext";
import { RegionalSettingsProvider } from "@/contexts/RegionalSettingsContext";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";
import { TenantProvider } from "@/contexts/TenantContext";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { NextSeoManager } from "@/components/routing/NextSeoManager";

/**
 * TenantPublicShell — the ONE shared provider stack for every migrated public
 * route: the tenant-subdomain pages (`/embed/*`, `/subscribe`, `/customer/*`,
 * `/fleet-manager*`, …) and the non-tenant public pages (`/book/:slug`,
 * `/public-services/:slug`, `/subscribe/:slug`).
 *
 * Used by `app/(tenant)/layout.tsx` and by the tenant catch-all
 * `app/[[...path]]/page.tsx`, so the provider tree is defined exactly once.
 *
 * It mirrors the provider stack the SPA gave these routes
 * (QueryClientProvider → AuthProvider → ThemeProvider → TenantProvider),
 * plus the context providers shared components may read (Tooltip,
 * Terminology, RegionalSettings, Subscription — `RequireAuth` needs
 * `useFeatureGate` from the SubscriptionContext). Deliberately omitted vs the
 * `(app)` layout: `AppStartupNavigator` (disabled on tenant hosts in the SPA,
 * and public pages must never trigger startup redirects), the offline
 * bootstrap/outbox workers (staff-app concerns), `PostHogIdentity`,
 * `OfflineStatusBanner`, keyboard shortcuts, and the AI assistant (the SPA
 * suppressed it on tenant hosts).
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Same tuning as the SPA and the (app) layout: 5-minute stale time,
      // 30-minute cache, no refetch on window focus, retry failed queries once.
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export function TenantPublicShell({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthProvider authStateSource={supabase.auth}>
          <ThemeProvider defaultTheme="system" storageKey="servicewriter-ui-theme">
            <TooltipProvider>
              <TerminologyProvider>
                <RegionalSettingsProvider>
                  <SubscriptionProvider>
                    <TenantProvider>
                      {/* Idempotent: renders children straight through when a
                          router context already exists above (page-level
                          adapters), instead of nesting routers. */}
                      <NextRouterAdapter>
                        <NextSeoManager />
                        {children}
                        <Toaster />
                        <Sonner />
                      </NextRouterAdapter>
                    </TenantProvider>
                  </SubscriptionProvider>
                </RegionalSettingsProvider>
              </TerminologyProvider>
            </TooltipProvider>
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </StrictMode>
  );
}
