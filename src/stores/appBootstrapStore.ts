import { create } from "zustand";

interface AppBootstrapState {
  bootstrapped: boolean;
  bootError: string | null;
  hasBooted: boolean;
  bootInFlight: boolean;
  bootAsync: () => Promise<void>;
  retryBoot: () => Promise<void>;
}

export const useAppBootstrapStore = create<AppBootstrapState>((set, get) => ({
  bootstrapped: false,
  bootError: null,
  hasBooted: false,
  bootInFlight: false,

  bootAsync: async () => {
    if (get().hasBooted || get().bootInFlight) return;
    set({ bootInFlight: true, bootError: null });

    try {
      set({
        hasBooted: true,
        bootInFlight: false,
        bootstrapped: true,
      });
    } catch (error) {
      set({
        bootInFlight: false,
        bootError: error instanceof Error ? error.message : "Failed to bootstrap app",
        bootstrapped: false,
      });
    }
  },

  retryBoot: async () => {
    set({ hasBooted: false, bootstrapped: false, bootError: null });
    await get().bootAsync();
  },
}));
