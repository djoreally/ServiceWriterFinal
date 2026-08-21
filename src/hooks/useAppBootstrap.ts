import { useEffect } from "react";
import { useAppBootstrapStore } from "@/stores/appBootstrapStore";

export function useAppBootstrap() {
  const bootstrapped = useAppBootstrapStore((s) => s.bootstrapped);
  const bootError = useAppBootstrapStore((s) => s.bootError);
  const bootAsync = useAppBootstrapStore((s) => s.bootAsync);
  const retryBoot = useAppBootstrapStore((s) => s.retryBoot);

  useEffect(() => {
    void bootAsync();
  }, [bootAsync]);

  return { bootstrapped, bootError, retryBoot };
}
