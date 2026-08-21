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

export function renderRoute(options: RenderRouteOptions = {}) {
  const { route = "/", persona = personas.asOwner(), initialEntries = [route] } = options;
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

  let currentPath = route;

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
                      <MemoryRouter initialEntries={initialEntries}>
                        <KeyboardShortcutsProvider>
                          <LocationTracker onLocationChange={(p) => (currentPath = p)} />
                          <AppRoutes />
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
