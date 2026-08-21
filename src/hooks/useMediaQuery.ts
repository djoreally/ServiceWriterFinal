import { useState, useEffect } from 'react';
import { useDebounce } from './useDebounce';

export const useMediaQuery = (query: string, delay = 200): boolean => {
  const [matches, setMatches] = useState(false);
  const debouncedMatches = useDebounce(matches, delay);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const handler = (event: MediaQueryListEvent) => setMatches(event.matches);

    // Set the initial state
    setMatches(mediaQuery.matches);

    // Add the listener
    mediaQuery.addEventListener('change', handler);

    // Cleanup on unmount
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);

  return debouncedMatches;
};
