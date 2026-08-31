import { useEffect, useState } from 'react';

// Hook to detect client/browser environment (useful to guard window/localStorage usage)
export default function useIsClient(): boolean {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    void Promise.resolve().then(() => setIsClient(typeof window !== 'undefined'));
  }, []);
  return isClient;
}
