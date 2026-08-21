import { useState, useCallback, useRef, useEffect } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  disabled?: boolean;
}

export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  disabled = false,
}: UsePullToRefreshOptions) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef(0);
  const armed = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pullDistanceRef = useRef(0);

  /**
   * Below `lg` the document scrolls (see AppLayout) and the container itself is
   * NOT scrollable, so `container.scrollTop` is permanently 0. Reading it alone
   * armed pull-to-refresh at every scroll depth, which preventDefault()ed every
   * downward swipe and made pages feel frozen. Always measure the element that
   * actually scrolls.
   */
  const atScrollTop = useCallback(() => {
    const container = containerRef.current;
    if (!container) return false;
    const containerScrolls = container.scrollHeight > container.clientHeight + 1;
    if (containerScrolls) return container.scrollTop <= 0;
    return (window.scrollY || document.documentElement.scrollTop || 0) <= 0;
  }, []);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    armed.current = false;
    if (disabled || isRefreshing) return;
    if (!atScrollTop()) return;

    armed.current = true;
    startY.current = e.touches[0].clientY;
  }, [disabled, isRefreshing, atScrollTop]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (disabled || isRefreshing || !armed.current) return;
    if (!atScrollTop()) {
      armed.current = false;
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;

    if (diff > 0) {
      if (e.cancelable) e.preventDefault();
      const resistance = Math.min(diff * 0.4, threshold * 1.5);
      pullDistanceRef.current = resistance;

      if (container.firstElementChild) {
        (container.firstElementChild as HTMLElement).style.height = `${resistance}px`;
      }
    }
  }, [disabled, isRefreshing, threshold, atScrollTop]);


  const handleTouchEnd = useCallback(async () => {
    const wasArmed = armed.current;
    armed.current = false;
    if (disabled || isRefreshing || !wasArmed) return;



    if (pullDistanceRef.current >= threshold) {
      setIsRefreshing(true);
      if (containerRef.current?.firstElementChild) {
        (containerRef.current.firstElementChild as HTMLElement).style.height = `${threshold}px`;
      }
      
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        pullDistanceRef.current = 0;
        if (containerRef.current?.firstElementChild) {
          (containerRef.current.firstElementChild as HTMLElement).style.height = '0px';
        }
      }
    } else {
      pullDistanceRef.current = 0;
       if (containerRef.current?.firstElementChild) {
        (containerRef.current.firstElementChild as HTMLElement).style.height = '0px';
      }
    }
  }, [disabled, threshold, isRefreshing, onRefresh]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    containerRef,
    isRefreshing,
  };
}
