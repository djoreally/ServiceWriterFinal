import { create } from "zustand";
import { persist } from "zustand/middleware";

export const STARTUP_ROUTING_STORAGE_KEY = "startup-routing-v1";

interface StartupRoutingState {
  hasHydrated: boolean;
  intendedPath: string | null;
  setIntendedPath: (path: string | null) => void;
  setHasHydrated: (value: boolean) => void;
  clearIntendedPath: () => void;
}

export const useStartupRoutingStore = create<StartupRoutingState>()(
  persist(
    (set): StartupRoutingState => ({
      hasHydrated: false,
      intendedPath: null as string | null,
      setIntendedPath: (path: string | null) => set({ intendedPath: path }),
      setHasHydrated: (value: boolean) => set({ hasHydrated: value }),
      clearIntendedPath: () => set({ intendedPath: null }),
    }),
    {
      name: STARTUP_ROUTING_STORAGE_KEY,
      onRehydrateStorage: () => (state) => {
        // Hydration handler only updates state; it MUST NOT navigate.
        state?.setHasHydrated(true);
      },
    },
  ),
);

export function resetStartupRoutingState() {
  useStartupRoutingStore.setState({ intendedPath: null, hasHydrated: true });

  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STARTUP_ROUTING_STORAGE_KEY);
  }
}

