import { create } from "zustand";
import { persist } from "zustand/middleware";

interface FleetModeStore {
  isFleetMode: boolean;
  toggleFleetMode: () => void;
  setFleetMode: (value: boolean) => void;
}

export const useFleetMode = create<FleetModeStore>()(
  persist(
    (set) => ({
      isFleetMode: false,
      toggleFleetMode: () => set((s) => ({ isFleetMode: !s.isFleetMode })),
      setFleetMode: (value) => set({ isFleetMode: value }),
    }),
    { name: "fleet-mode" }
  )
);
