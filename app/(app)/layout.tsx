"use client";

import { StrictMode, Suspense, useEffect, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@packages/auth";
import { supabase } from "@/integrations/supabase/client";
import { ThemeProvider } from "@/components/ThemeProvider";
import ErrorBoundary from "@/shared/errors/ErrorBoundary";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TerminologyProvider } from "@/contexts/TerminologyContext";
import { RegionalSettingsProvider } from "@/contexts/RegionalSettingsContext";
import { FeatureProvider } from "@/shared/features/feature.provider";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";
import { TenantProvider, useTenant } from "@/contexts/TenantContext";
import { KeyboardShortcutsProvider } from "@/contexts/KeyboardShortcutsContext";
import { OfflineStatusBanner } from "@/components/offline/OfflineStatusBanner";
import { GDPRConsentBanner } from "@/components/security/GDPRConsentBanner";
import { DeferredBootTasks } from "@/components/routing/DeferredBootTasks";
import { setCurrentOfflineTenantSlug } from "@/offline/rollout";
import { lazyRetry } from "@/lib/lazyRetry";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { AppStartupNavigator } from "@/components/routing/AppStartupNavigator";
import { NextSeoManager } from "@/components/routing/NextSeoManager";

/**
 * Route-group layout for migrated App Router pages (`app/(app)/<section>/page.tsx`).
 * The `(app)` group has no URL impact — it only shares this shell.
 *
 * FULLY SELF-SUFFICIENT: replicates the provider stack of the legacy SPA
 * (`src/App.tsx` inside `src/NextClientShell.tsx`) so migrated pages never
 * re-declare providers. Do NOT duplicate this per page — the layout covers
 * every migrated route.
 *
 * Provider order mirrors the SPA exactly:
 *   QueryClientProvider → TooltipProvider → TerminologyProvider →
 *   RegionalSettingsProvider → FeatureProvider → SubscriptionProvider →
 *   TenantProvider → (router) → KeyboardShortcutsProvider → chrome.
 *
 * The `(router)` slot is a layout-level `NextRouterAdapter`: the SPA's
 * `BrowserRouter` position. It exists so layout chrome that needs a router
 * context (`KeyboardShortcutsProvider` calls `useNavigate()`) keeps working.
 * Page-level `NextRouterAdapter`s detect it and render through transparently
 * (react-router forbids nested `<Router>`), so the contract's page pattern
 * works unchanged.
 */

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // ⚡ Performance: 5-minute stale time reduces refetches for stable data
      staleTime: 5 * 60 * 1000,
      // Cache data for 30 minutes
      gcTime: 30 * 60 * 1000,
      // Don't refetch on window focus for better UX
      refetchOnWindowFocus: false,
      // Retry failed queries only once
      retry: 1,
    },
  },
});

// Same lazy-with-retry treatment as the SPA shell: the assistant is heavy,
// always-mounted, and only activates when opened.
const AIAssistant = lazyRetry(() =>
  import("@/components/ai/AIAssistant").then((m) => ({ default: m.AIAssistant })),
);

// PostHogIdentity is lazy-loaded for the same reason (§3.2.1 rule 2:
// analytics identity arms after first paint, never on the critical path).
// Its module graph pulls in posthog-js, which must not compete with the
// shell boot on slow phones.
const PostHogIdentity = lazyRetry(() =>
  import("@/components/analytics/PostHogIdentity").then((m) => ({ default: m.PostHogIdentity })),
);

/**
 * App-shell side effects: the current offline tenant slug, plus the
 * deferred boot tasks (service-worker updates, offline bootstrap/outbox)
 * shared with the SPA shell. Mirrors the wiring mounted in the SPA's
 * `AppRoutes`. The boot tasks mount only after first paint via
 * DeferredBootTasks (§3.2.1 rule 2) so they never compete with the
 * page's own first render and data fetches; the tenant-slug effect is
 * cheap and ordering-relevant, so it stays immediate.
 */
function ShellWiring() {
  const { slug: tenantSlug } = useTenant();

  useEffect(() => {
    setCurrentOfflineTenantSlug(tenantSlug ?? null);
  }, [tenantSlug]);

  return <DeferredBootTasks />;
}

/**
 * The AI assistant is a platform-app surface — like the SPA shell, it is not
 * mounted on tenant booking hosts.
 */
function AssistantMount() {
  const { loading: tenantLoading, slug: tenantSlug } = useTenant();
  if (tenantLoading || tenantSlug) return null;
  // Separate Suspense boundary — null fallback keeps the floating button
  // invisible while the chunk loads. The assistant opens on user action.
  return (
    <Suspense fallback={null}>
      <AIAssistant />
    </Suspense>
  );
}

export default function MigratedAppLayout({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <ErrorBoundary>
        <AuthProvider authStateSource={supabase.auth}>
          <ThemeProvider defaultTheme="system" storageKey="servicewriter-ui-theme">
            <QueryClientProvider client={queryClient}>
              <TooltipProvider>
                <TerminologyProvider>
                  <RegionalSettingsProvider>
                    <FeatureProvider>
                      <SubscriptionProvider>
                        <TenantProvider>
                          {/* useSearchParams() below needs the Suspense boundary. */}
                          <Suspense fallback={null}>
                            <NextRouterAdapter>
                              <KeyboardShortcutsProvider>
                                <Suspense fallback={null}>
                                  <PostHogIdentity />
                                </Suspense>
                                <OfflineStatusBanner />
                                <Toaster />
                                <Sonner />
                                <NextSeoManager />
                                <ShellWiring />
                                <AppStartupNavigator>{children}</AppStartupNavigator>
                                <AssistantMount />
                              </KeyboardShortcutsProvider>
                            </NextRouterAdapter>
                          </Suspense>
                        </TenantProvider>
                      </SubscriptionProvider>
                    </FeatureProvider>
                  </RegionalSettingsProvider>
                </TerminologyProvider>
              </TooltipProvider>
            </QueryClientProvider>
            <GDPRConsentBanner />
          </ThemeProvider>
        </AuthProvider>
      </ErrorBoundary>
    </StrictMode>
  );
}
